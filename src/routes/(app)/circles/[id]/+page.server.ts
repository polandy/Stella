import { error, fail, redirect } from '@sveltejs/kit';
import * as v from 'valibot';
import { addMember, getCircle, listMembers, removeMember } from '$lib/server/domain/circles/circles';
import { getContact, listContacts } from '$lib/server/domain/contacts/contacts';
import { getCircleDeps, getContactDeps } from '$lib/server/services';
import type { Actions, PageServerLoad } from './$types';

/*
 * Circle detail (docs/02 §2.4.2): the circle, its visible members (with roles), and a picker to
 * add any other visible contact. Both endpoints of a membership must be visible (§3.7).
 */
export const load: PageServerLoad = async ({ locals, params }) => {
	if (!locals.user) throw redirect(302, '/login');
	const viewer = { id: locals.user.id, householdId: locals.user.householdId };

	const circle = await getCircle(getCircleDeps(), viewer, params.id);
	if (!circle) throw error(404, 'Circle not found');

	const [members, allContacts] = await Promise.all([
		listMembers(getCircleDeps(), viewer, params.id),
		listContacts(getContactDeps(), viewer)
	]);
	const memberIds = new Set(members.map((m) => m.contactId));

	return {
		circle,
		members,
		candidates: allContacts.filter((c) => !memberIds.has(c.id))
	};
};

const AddSchema = v.object({
	contactId: v.pipe(v.string(), v.minLength(1)),
	role: v.optional(v.pipe(v.string(), v.trim()))
});

export const actions: Actions = {
	addMember: async ({ request, params, locals }) => {
		if (!locals.user) throw redirect(302, '/login');
		const viewer = { id: locals.user.id, householdId: locals.user.householdId };

		// Both the circle and the contact must be visible to the actor.
		const circle = await getCircle(getCircleDeps(), viewer, params.id);
		if (!circle) throw error(404, 'Circle not found');

		const form = await request.formData();
		const parsed = v.safeParse(AddSchema, {
			contactId: form.get('contactId'),
			role: form.get('role') || undefined
		});
		if (!parsed.success) return fail(400, { error: 'Please choose a person.' });

		const contact = await getContact(getContactDeps(), viewer, parsed.output.contactId);
		if (!contact) return fail(400, { error: 'That person could not be found.' });

		await addMember(getCircleDeps(), { userId: locals.user.id }, params.id, parsed.output.contactId, parsed.output.role);
		throw redirect(303, `/circles/${params.id}`);
	},

	removeMember: async ({ request, params, locals }) => {
		if (!locals.user) throw redirect(302, '/login');
		const viewer = { id: locals.user.id, householdId: locals.user.householdId };

		const circle = await getCircle(getCircleDeps(), viewer, params.id);
		if (!circle) throw error(404, 'Circle not found');

		const form = await request.formData();
		const contactId = form.get('contactId');
		if (typeof contactId !== 'string') return fail(400, {});

		await removeMember(getCircleDeps(), params.id, contactId);
		throw redirect(303, `/circles/${params.id}`);
	}
};
