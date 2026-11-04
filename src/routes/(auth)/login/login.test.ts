import { describe, expect, it } from 'bun:test';
import { isHttpError, isRedirect, type Cookies } from '@sveltejs/kit';
import type { AuthServices } from '$lib/server/services/auth';
import type { AppServices } from '$lib/server/services/app-services';

/*
 * The password sign-in action (docs/02 §2.1.1) over a test-wired `locals.services`: the sign-in
 * methods the operator turned on are read off the services, so the refusal is testable without
 * touching the process-wide configuration.
 */
const { actions } = await import('./+page.server');

let verified: string[];

function servicesWith(local: boolean): AppServices {
	const auth: Pick<AuthServices, 'methods' | 'accountDeps'> = {
		methods: { local, oidc: true },
		accountDeps: {
			accounts: {
				findCredentialsByEmail: async (email: string) => {
					verified.push(email);
					return null;
				}
			},
			verifyPassword: async () => false
		} as unknown as AuthServices['accountDeps']
	};
	return { auth: auth as AuthServices } as AppServices;
}

async function postLogin(services: AppServices): Promise<unknown> {
	const form = new FormData();
	form.set('email', 'ada@example.test');
	form.set('password', 'secret-password');
	const event = {
		request: new Request('http://localhost/login', { method: 'POST', body: form }),
		cookies: {} as Cookies,
		locals: { services, locale: 'en' }
	};
	try {
		return await actions.default(event as unknown as Parameters<typeof actions.default>[0]);
	} catch (thrown) {
		if (isHttpError(thrown) || isRedirect(thrown)) return thrown;
		throw thrown;
	}
}

describe('POST /login', () => {
	it('refuses with 404 and never checks a password when local sign-in is off', async () => {
		verified = [];
		const answer = await postLogin(servicesWith(false));
		expect(isHttpError(answer) && answer.status).toBe(404);
		expect(verified).toEqual([]);
	});

	it('checks the credentials when local sign-in is on', async () => {
		verified = [];
		const answer = (await postLogin(servicesWith(true))) as { status: number };
		expect(answer.status).toBe(400);
		expect(verified).toEqual(['ada@example.test']);
	});
});
