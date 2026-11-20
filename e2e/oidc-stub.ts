import { exportJWK, generateKeyPair, SignJWT } from 'jose';
import {
	STUB_CLIENT_ID,
	STUB_CLIENT_SECRET,
	STUB_IDENTITIES,
	type StubIdentity,
	type StubIdentityKey
} from './oidc';

// Stand-in OIDC provider for the SSO e2e (docs/dev/08 §8.4); started by playwright.config.ts and run.sh.

const port = Number(process.env.PORT ?? 4175);
const issuer = `http://127.0.0.1:${port}`;

const { privateKey, publicKey } = await generateKeyPair('RS256');
const publicJwk = { ...(await exportJWK(publicKey)), kid: 'e2e', alg: 'RS256', use: 'sig' };

interface Grant {
	identity: StubIdentity;
	nonce: string;
	redirectUri: string;
	codeChallenge: string;
}

/** Codes handed out by the authorize page, each good for one token request. */
const grants = new Map<string, Grant>();

const isIdentityKey = (key: string | null): key is StubIdentityKey =>
	key !== null && Object.hasOwn(STUB_IDENTITIES, key);

async function s256(verifier: string): Promise<string> {
	const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
	return Buffer.from(digest).toString('base64url');
}

const escapeHtml = (text: string) =>
	text.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

/** The provider's sign-in page: one link per identity, each carrying the request back. */
function authorizePage(url: URL): Response {
	if (url.searchParams.get('client_id') !== STUB_CLIENT_ID) {
		return new Response('unknown client', { status: 400 });
	}
	const links = Object.entries(STUB_IDENTITIES).map(([key, identity]) => {
		const approve = new URL('/authorize/approve', issuer);
		for (const name of ['redirect_uri', 'state', 'nonce', 'code_challenge']) {
			approve.searchParams.set(name, url.searchParams.get(name) ?? '');
		}
		approve.searchParams.set('as', key);
		return `<li><a href="${escapeHtml(approve.href)}">${escapeHtml(identity.name)}</a></li>`;
	});
	const html = `<!doctype html><title>Stub IdP</title><h1>Sign in as</h1><ul>${links.join('')}</ul>`;
	return new Response(html, { headers: { 'content-type': 'text/html; charset=utf-8' } });
}

function approve(url: URL): Response {
	const key = url.searchParams.get('as');
	const redirectUri = url.searchParams.get('redirect_uri');
	if (!isIdentityKey(key) || !redirectUri) return new Response('bad request', { status: 400 });

	const code = crypto.randomUUID();
	grants.set(code, {
		identity: STUB_IDENTITIES[key],
		nonce: url.searchParams.get('nonce') ?? '',
		redirectUri,
		codeChallenge: url.searchParams.get('code_challenge') ?? ''
	});
	const back = new URL(redirectUri);
	back.searchParams.set('code', code);
	back.searchParams.set('state', url.searchParams.get('state') ?? '');
	return Response.redirect(back.href, 302);
}

async function token(request: Request): Promise<Response> {
	const form = new URLSearchParams(await request.text());
	const code = form.get('code') ?? '';
	const grant = grants.get(code);
	grants.delete(code);

	const refused =
		!grant ||
		form.get('grant_type') !== 'authorization_code' ||
		form.get('client_id') !== STUB_CLIENT_ID ||
		form.get('client_secret') !== STUB_CLIENT_SECRET ||
		form.get('redirect_uri') !== grant.redirectUri ||
		(await s256(form.get('code_verifier') ?? '')) !== grant.codeChallenge;
	if (refused) return Response.json({ error: 'invalid_grant' }, { status: 400 });

	const { identity, nonce } = grant;
	const idToken = await new SignJWT({
		nonce,
		email: identity.email,
		email_verified: true,
		name: identity.name,
		groups: identity.groups
	})
		.setProtectedHeader({ alg: 'RS256', kid: publicJwk.kid })
		.setIssuer(issuer)
		.setSubject(identity.subject)
		.setAudience(STUB_CLIENT_ID)
		.setIssuedAt()
		.setExpirationTime('5m')
		.sign(privateKey);
	return Response.json({ id_token: idToken, access_token: 'stub', token_type: 'Bearer' });
}

Bun.serve({
	port,
	hostname: '127.0.0.1',
	async fetch(request) {
		const url = new URL(request.url);
		switch (url.pathname) {
			case '/.well-known/openid-configuration':
				return Response.json({
					issuer,
					authorization_endpoint: `${issuer}/authorize`,
					token_endpoint: `${issuer}/token`,
					jwks_uri: `${issuer}/jwks`
				});
			case '/authorize':
				return authorizePage(url);
			case '/authorize/approve':
				return approve(url);
			case '/token':
				return request.method === 'POST' ? token(request) : new Response(null, { status: 405 });
			case '/jwks':
				return Response.json({ keys: [publicJwk] });
			default:
				return new Response('not found', { status: 404 });
		}
	}
});

console.log(`▶ OIDC stub on ${issuer}`);
