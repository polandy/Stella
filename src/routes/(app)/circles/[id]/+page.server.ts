import { error, fail, redirect } from '@sveltejs/kit';
import { requireViewer } from '$lib/server/auth/guards';
import {
	addMembers,
	getCircle,
	groupMembersByRole,
	removeMember,
	setMembersRole,
	suggestRoles
} from '$lib/server/domain/circles/circles';
import { listMembers } from '$lib/server/domain/circles/memberships';
import { circlePhotoView, photoRoleOptions } from '$lib/server/domain/circles/circle-photo-view';
import { listCirclePhotos } from '$lib/server/domain/circles/circle-photos';
import { BlankRoleNameError, renameCircleRole } from '$lib/server/domain/circles/rename-role';
import { listContactNamesAmong } from '$lib/server/domain/contacts/contact-names';
import { listCircleCuts } from '$lib/server/domain/media/cuts';
import { readSurnameHelp } from '$lib/server/domain/contacts/last-names';
import { photoActions } from './actions/photos';
import { readPeopleAndRole } from './people-form';
import { lastNameActions } from '../../_shared/last-names-actions';
import type { Actions, PageServerLoad } from './$types';
import { say, translator } from '$lib/server/i18n/say';

/*
 * Circle detail (docs/02 §2.4.2): the circle, its visible members grouped by role, and a picker to
 * add one or more other visible contacts at once. Both endpoints of a membership must be visible (§3.7).
 */
export const load: PageServerLoad = async ({ locals, params }) => {
	const viewer = requireViewer(locals);

	const circle = await getCircle(locals.services.circles.circleDeps, viewer, params.id);
	if (!circle) throw error(404, say(locals, 'errors.circle.notFound'));

	const [members, photos, cuts, surnameHelp] = await Promise.all([
		listMembers(locals.services.circles.circleMembershipDeps, viewer, params.id),
		listCirclePhotos(locals.services.circles.circlePhotoDeps, viewer, params.id),
		listCircleCuts(locals.services.circles.cutDeps, viewer, params.id),
		readSurnameHelp(locals.services.people.surnameReviewDeps, viewer, null)
	]);
	const roles = suggestRoles(members.map((m) => m.role));

	return {
		circle,
		// People are shown under their role, so a class reads as its teachers and its pupils.
		memberGroups: groupMembersByRole(members),
		// What this circle already calls its people, offered while adding the next one.
		roleSuggestions: roles,
		// The cover, the banner over each role group, and the Photos section (docs/02 §2.4.2).
		photos: circlePhotoView(
			// Each photo's role picker: the circle's roles, and its own once nobody has it (§4).
			photos.map((p) => ({ ...p, roleOptions: photoRoleOptions(roles, p.role) })),
			roles
		),
		// Who wears a profile picture cut from which photo (concept §5): marked in the person
		// picker, and counted when Remove or Make private warns.
		cuts,
		// Who is looking: shared/private and Remove are only offered on their own photos.
		viewerId: viewer.id,
		// Who is in already, so the picker offers the rest of the shell's people.
		memberIds: members.map((m) => m.contactId),
		// Whom a last name set here is offered on to (docs/02 §2.2.4.5).
		passOn: surnameHelp.passOn
	};
};

export const actions: Actions = {
	...photoActions,
	...lastNameActions,

	addMembers: async ({ request, params, locals }) => {
		const viewer = requireViewer(locals);

		// The circle must be visible to the actor before anything is added to it.
		const circle = await getCircle(locals.services.circles.circleDeps, viewer, params.id);
		if (!circle) throw error(404, say(locals, 'errors.circle.notFound'));

		const pick = readPeopleAndRole(await request.formData());
		if (!pick) return fail(400, { error: say(locals, 'errors.circle.choosePerson') });

		// Every chosen person must be visible to the actor — one that is not fails the whole
		// pick rather than being dropped silently from it (§3.7).
		const chosen = new Set(pick.contactIds);
		const visible = await listContactNamesAmong(locals.services.people.contactNameDeps, viewer, [
			...chosen
		]);
		if (visible.length !== chosen.size) {
			return fail(400, { error: say(locals, 'errors.person.notFound') });
		}

		await addMembers(
			locals.services.circles.circleDeps,
			{ userId: viewer.id },
			params.id,
			pick.contactIds,
			pick.role
		);
		throw redirect(303, `/circles/${params.id}`);
	},

	// Re-roles several members at once; a blank role takes the role away (docs/02 §2.4.2).
	setRole: async ({ request, params, locals }) => {
		const viewer = requireViewer(locals);

		const circle = await getCircle(locals.services.circles.circleDeps, viewer, params.id);
		if (!circle) throw error(404, say(locals, 'errors.circle.notFound'));

		const pick = readPeopleAndRole(await request.formData());
		if (!pick) return fail(400, { error: say(locals, 'errors.circle.choosePerson') });

		await setMembersRole(
			locals.services.circles.memberRoleDeps,
			viewer,
			params.id,
			pick.contactIds,
			pick.role
		);
		throw redirect(303, `/circles/${params.id}`);
	},

	// Renames one role for everyone and every photo of this circle that has it (docs/02 §2.4.2).
	renameRole: async ({ request, params, locals }) => {
		const viewer = requireViewer(locals);

		const circle = await getCircle(locals.services.circles.circleDeps, viewer, params.id);
		if (!circle) throw error(404, say(locals, 'errors.circle.notFound'));

		const form = await request.formData();
		const from = form.get('from');
		const to = form.get('role');
		if (typeof from !== 'string' || typeof to !== 'string') return fail(400, {});

		try {
			await renameCircleRole(locals.services.circles.renameRoleDeps, viewer, {
				circleId: params.id,
				from,
				to
			});
		} catch (err) {
			// Which heading failed, so only that one stays open with the message.
			if (err instanceof BlankRoleNameError) {
				return fail(400, { renameError: err.phrase(translator(locals)), renameFrom: from });
			}
			throw err;
		}
		throw redirect(303, `/circles/${params.id}`);
	},

	removeMember: async ({ request, params, locals }) => {
		const viewer = requireViewer(locals);

		const circle = await getCircle(locals.services.circles.circleDeps, viewer, params.id);
		if (!circle) throw error(404, say(locals, 'errors.circle.notFound'));

		const form = await request.formData();
		const contactId = form.get('contactId');
		if (typeof contactId !== 'string') return fail(400, {});

		// Only a member the viewer can see in this circle is taken out (§3.7).
		const removed = await removeMember(
			locals.services.circles.memberRemovalDeps,
			viewer,
			params.id,
			contactId
		);
		if (!removed) return fail(404, { error: say(locals, 'errors.person.notFound') });
		throw redirect(303, `/circles/${params.id}`);
	}
};
