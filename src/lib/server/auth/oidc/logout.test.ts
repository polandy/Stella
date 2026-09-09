import { describe, expect, it } from 'bun:test';
import { planRpLogout, type RpLogoutDeps } from './logout';

/*
 * RP-initiated logout orchestration (docs/02 §2.1): ask the provider where to send the
 * browser, or decide there is nowhere to send it. Tested with a fake provider — no HTTP.
 */

const ID_TOKEN = 'header.payload.signature';

function deps(
	endSessionEndpoint: string | null | (() => never),
	overrides: Partial<RpLogoutDeps> = {}
): RpLogoutDeps & { calls: number[] } {
	const calls: number[] = [];
	return {
		calls,
		enabled: true,
		clientId: 'stella',
		postLogoutRedirectUri: 'https://stella.example.home/login?signedOut',
		provider: {
			endSessionEndpoint: async () => {
				calls.push(1);
				if (typeof endSessionEndpoint === 'function') return endSessionEndpoint();
				return endSessionEndpoint;
			}
		},
		...overrides
	};
}

describe('planRpLogout', () => {
	it('returns the provider logout URL for a federated session', async () => {
		const url = await planRpLogout(deps('https://auth.example.home/logout'), ID_TOKEN);

		expect(url).not.toBeNull();
		expect(new URL(url as string).searchParams.get('id_token_hint')).toBe(ID_TOKEN);
	});

	it('does not even ask the provider for a local session', async () => {
		const d = deps('https://auth.example.home/logout');

		expect(await planRpLogout(d, null)).toBeNull();
		expect(d.calls).toEqual([]);
	});

	it('does not ask the provider when RP-initiated logout is switched off', async () => {
		const d = deps('https://auth.example.home/logout', { enabled: false });

		expect(await planRpLogout(d, ID_TOKEN)).toBeNull();
		expect(d.calls).toEqual([]);
	});

	it('stays local when the provider advertises no end_session_endpoint', async () => {
		const d = deps(null);

		expect(await planRpLogout(d, ID_TOKEN)).toBeNull();
		expect(d.calls).toEqual([1]);
	});

	it('stays local when the provider is unreachable, rather than failing the sign-out', async () => {
		const d = deps(() => {
			throw new Error('discovery failed');
		});

		expect(await planRpLogout(d, ID_TOKEN)).toBeNull();
		expect(d.calls).toEqual([1]); // it did try, and swallowed only the failure
	});
});
