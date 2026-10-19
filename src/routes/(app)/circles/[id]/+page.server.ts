import { error, fail, redirect } from '@sveltejs/kit';
import { requireRemover, requireViewer } from '$lib/server/auth/guards';
import {
	addMembers,
	CIRCLE_COLORS,
	CIRCLE_KINDS,
	getCircle,
	groupMembersByRole,
	removeMember,
	setMembersRole,
	suggestRoles
} from '$lib/server/domain/circles/circles';
import { listMembers } from '$lib/server/domain/circles/memberships';
import { readCircleTree } from '$lib/server/domain/circles/tree';
import { circleTree } from '$lib/circles/tree';
import { todayFor } from '$lib/dates/today';
import {
	circlePhotoRemovable,
	circlePhotoView,
	photoRoleOptions
} from '$lib/server/domain/circles/circle-photo-view';
import { listCirclePhotos } from '$lib/server/domain/circles/circle-photos';
import { circleDeletable } from '$lib/server/domain/circles/delete-circle';
import { BlankRoleNameError, renameCircleRole } from '$lib/server/domain/circles/rename-role';
import { listContactNamesAmong } from '$lib/server/domain/contacts/contact-names';
import { listCircleCuts } from '$lib/server/domain/media/cuts';
import { readSurnameHelp } from '$lib/server/domain/contacts/last-names';
import { deleteActions } from './actions/delete';
import { detailsActions } from './actions/details';
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
	const remover = requireRemover(locals);

	const circle = await getCircle(locals.services.circles.circleDeps, viewer, params.id);
	if (!circle) throw error(404, say(locals, 'errors.circle.notFound'));

	const [members, photos, cuts, surnameHelp, flat] = await Promise.all([
		listMembers(locals.services.circles.circleMembershipDeps, viewer, params.id),
		listCirclePhotos(locals.services.circles.circlePhotoDeps, viewer, params.id),
		listCircleCuts(locals.services.circles.cutDeps, viewer, params.id),
		readSurnameHelp(locals.services.people.surnameReviewDeps, viewer, null),
		readCircleTree(locals.services.circles.circleTreeDeps, viewer)
	]);
	const roles = suggestRoles(members.map((m) => m.role));
	const tree = circleTree(flat);
	const siblings = tree.neighbours(circle.id);

	return {
		circle,
		// Where the circle sits (docs/02 §2.4.2): the way up, the siblings either side, and its
		// direct sub-circles with their own members and what lies further inside each.
		nesting: {
			ancestors: tree.ancestors(circle.id),
			previous: siblings.previous,
			next: siblings.next,
			children: tree
				.children(circle.id)
				.map((c) => ({ ...c, descendantCount: tree.descendants(c.id).length })),
			hiddenChildCount: tree.get(circle.id)?.hiddenChildCount ?? 0
		},
		// Where the timeline's today marker stands, on the server's clock.
		today: todayFor(locals.services.circles.circleDeps.clock),
		// What the header's edit form offers (docs/02 §2.4.2), as the create form does.
		kinds: CIRCLE_KINDS,
		colors: CIRCLE_COLORS,
		// *Delete circle…* is only in the ⋯ menu of whoever may: its creator, an admin on a shared one.
		canDelete: circleDeletable(remover, circle),
		// People are shown under their role, so a class reads as its teachers and its pupils.
		memberGroups: groupMembersByRole(members),
		// What this circle already calls its people, offered while adding the next one.
		roleSuggestions: roles,
		// The cover, the banner over each role group, and the Photos section (docs/02 §2.4.2).
		photos: circlePhotoView(
			// Each photo's role picker: the circle's roles, and its own once nobody has it (§4).
			photos.map((p) => ({
				...p,
				roleOptions: photoRoleOptions(roles, p.role),
				removable: circlePhotoRemovable(remover, circle, p)
			})),
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
	...detailsActions,
	...deleteActions,
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
		// pick rather than being dropped silently from it (§3.7). Visible, not browsable: the
		// picker leaves archived people out, but archiving tidies the lists, it does not hide
		// (docs/02 §2.2), so someone archived while the pick was made still joins.
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
		// The page always posts both; a form without them was not made by it.
		if (typeof from !== 'string' || typeof to !== 'string') {
			return fail(400, { error: say(locals, 'errors.form.checkAndRetry') });
		}

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
		if (typeof contactId !== 'string') {
			return fail(400, { error: say(locals, 'errors.form.checkAndRetry') });
		}

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
