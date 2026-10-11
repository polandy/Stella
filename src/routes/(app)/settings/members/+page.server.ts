import { fail } from '@sveltejs/kit';
import { requireAdmin, requireRemover, requireUser } from '$lib/server/auth/guards';
import {
	CannotRemoveYourselfError,
	listMemberAccounts,
	memberRemovalPreview,
	memberRestorePreview,
	MemberGoneError,
	MemberNotFormerError,
	removeMember,
	restoreMember,
	type MemberRemovalPreview,
	type MemberRestorePreview
} from '$lib/server/domain/household/remove-member';
import { say, translator } from '$lib/server/i18n/say';
import type { Actions, PageServerLoad } from './$types';

/**
 * The household's members (docs/02 §2.1): who signs in, and how. Every member sees the page;
 * an admin also gets, for each other member, what removing them would leave behind, and for
 * each former member what restoring them would bring back — a household has a handful of
 * members, so neither confirm step needs a second request.
 */
export const load: PageServerLoad = async ({ locals }) => {
	const user = requireUser(locals);
	const remover = requireRemover(locals);
	const deps = locals.services.household.memberAccountDeps;
	const { current, former } = await listMemberAccounts(deps, remover);

	const previews: Record<string, MemberRemovalPreview> = {};
	const restorePreviews: Record<string, MemberRestorePreview> = {};
	if (remover.isAdmin) {
		for (const member of current.filter((m) => m.id !== user.id)) {
			previews[member.id] = await memberRemovalPreview(deps, remover, member.id);
		}
		for (const member of former) {
			restorePreviews[member.id] = await memberRestorePreview(deps, remover, member.id);
		}
	}
	return {
		viewerId: user.id,
		isAdmin: remover.isAdmin,
		current,
		former,
		previews,
		restorePreviews
	};
};

export const actions: Actions = {
	/* Remove a member; one already gone answers 404, which the page reads as done (§2.23). */
	remove: async ({ request, locals }) => {
		requireAdmin(locals);
		const memberId = (await request.formData()).get('memberId');
		if (typeof memberId !== 'string' || memberId === '')
			return fail(400, { error: say(locals, 'errors.form.checkAndRetry') });

		try {
			await removeMember(
				locals.services.household.memberAccountDeps,
				requireRemover(locals),
				memberId
			);
		} catch (err) {
			if (err instanceof MemberGoneError) return fail(404, { removed: memberId });
			if (err instanceof CannotRemoveYourselfError)
				return fail(400, { error: err.phrase(translator(locals)) });
			throw err;
		}
		return { removed: memberId };
	},

	/* Restore a former member; one already back answers 404, which the page reads as done. */
	restore: async ({ request, locals }) => {
		requireAdmin(locals);
		const memberId = (await request.formData()).get('memberId');
		if (typeof memberId !== 'string' || memberId === '')
			return fail(400, { error: say(locals, 'errors.form.checkAndRetry') });

		try {
			await restoreMember(
				locals.services.household.memberAccountDeps,
				requireRemover(locals),
				memberId
			);
		} catch (err) {
			if (err instanceof MemberNotFormerError) return fail(404, { restored: memberId });
			throw err;
		}
		return { restored: memberId };
	}
};
