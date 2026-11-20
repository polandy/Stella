import { DEMO_MEMBER_EMAIL } from '../src/lib/server/db/demo-constants';

// What the stand-in provider knows; apart from `oidc-stub.ts` so specs can import it under Node.

/** Where the specs reach the stub; the port follows `playwright.config.ts` and `run.sh`. */
export const STUB_ISSUER = `http://127.0.0.1:${process.env.E2E_OIDC_PORT ?? 4175}`;

/** The client the e2e server registers as; `package.json`'s `e2e:server` passes the same pair. */
export const STUB_CLIENT_ID = 'stella-e2e';
export const STUB_CLIENT_SECRET = 'e2e-oidc-secret';

/** The only group the e2e server lets in (`OIDC_ALLOWED_GROUPS`). */
export const STUB_ALLOWED_GROUP = 'stella-users';

export interface StubIdentity {
	subject: string;
	name: string;
	email: string;
	groups: string[];
}

/** The people the stub offers to sign in as, keyed by the choice its sign-in page links. */
export const STUB_IDENTITIES = {
	// The demo household's member: the verified email links this identity to Nina's account.
	nina: {
		subject: 'stub-nina',
		name: 'Nina Brunner',
		email: DEMO_MEMBER_EMAIL,
		groups: [STUB_ALLOWED_GROUP]
	},
	// Known to the provider but in no group the household allows.
	outsider: {
		subject: 'stub-outsider',
		name: 'Otto Aussen',
		email: 'otto@example.test',
		groups: ['guests']
	}
} satisfies Record<string, StubIdentity>;

export type StubIdentityKey = keyof typeof STUB_IDENTITIES;
