import { fail, redirect } from '@sveltejs/kit';
import * as v from 'valibot';
import {
	API_TOKEN_LIFETIMES_DAYS,
	EmptyApiTokenNameError,
	issueApiToken,
	listApiTokens,
	revokeApiToken,
	type ApiTokenLifetime
} from '$lib/server/auth/api-tokens';
import { say, translator } from '$lib/server/i18n/say';
import { getApiTokenDeps } from '$lib/server/services';
import type { Actions, PageServerLoad } from './$types';

/*
 * A member's API tokens (docs/02 §2.16.1). Every member manages their own: a token acts as the
 * member who made it, so nobody — an admin included — mints or withdraws one for someone else.
 *
 * Revoking is immediate, without the undo other removals offer: a token is withdrawn because
 * it may be in the wrong hands, and a grace period would be a window for exactly those hands.
 */

const MAX_NAME = 80;

const CreateSchema = v.object({
	name: v.pipe(v.string(), v.maxLength(MAX_NAME)),
	lifetimeDays: v.pipe(v.string(), v.transform(Number), v.picklist(API_TOKEN_LIFETIMES_DAYS))
});

const RevokeSchema = v.object({ tokenId: v.pipe(v.string(), v.minLength(1)) });

function requireMember(locals: App.Locals) {
	if (!locals.user) throw redirect(302, '/login');
	return locals.user;
}

export const load: PageServerLoad = async ({ locals }) => {
	const user = requireMember(locals);
	const deps = getApiTokenDeps();
	const now = deps.clock.now();
	const tokens = (await listApiTokens(deps, user.id)).map((token) => ({
		...token,
		expired: token.expiresAt <= now
	}));
	return { tokens, lifetimes: [...API_TOKEN_LIFETIMES_DAYS] };
};

export const actions: Actions = {
	create: async ({ request, locals }) => {
		const user = requireMember(locals);
		const parsed = v.safeParse(CreateSchema, Object.fromEntries(await request.formData()));
		if (!parsed.success) return fail(400, { error: say(locals, 'errors.form.checkAndRetry') });
		try {
			const { token } = await issueApiToken(getApiTokenDeps(), user.id, {
				name: parsed.output.name,
				lifetimeDays: parsed.output.lifetimeDays as ApiTokenLifetime
			});
			return { created: { token, name: parsed.output.name.trim() } };
		} catch (err) {
			if (err instanceof EmptyApiTokenNameError) {
				return fail(400, { error: err.phrase(translator(locals)) });
			}
			throw err;
		}
	},

	revoke: async ({ request, locals }) => {
		const user = requireMember(locals);
		const parsed = v.safeParse(RevokeSchema, Object.fromEntries(await request.formData()));
		if (!parsed.success) return fail(400, { error: say(locals, 'errors.form.checkAndRetry') });
		const revoked = await revokeApiToken(getApiTokenDeps(), user.id, parsed.output.tokenId);
		if (!revoked) return fail(404, { error: say(locals, 'settings.apiTokens.notFound') });
		return { revoked: say(locals, 'settings.apiTokens.revoked') };
	}
};
