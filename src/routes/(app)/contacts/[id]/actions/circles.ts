import { dispatchCommand } from '$lib/server/domain/commands/dispatch';
import { parseCommand } from '$lib/server/commands/parse';
import { ulidGenerator } from '$lib/server/id';
import { systemClock } from '$lib/server/clock';
import { error, fail, redirect } from '@sveltejs/kit';
import { getContact } from '$lib/server/domain/contacts/contacts';
import { removeMember } from '$lib/server/domain/circles/circles';
import { getCircleDeps, getCommandDeps, getContactDeps } from '$lib/server/services';
import { say, translator } from '$lib/server/i18n/say';
import type { Actions } from '../$types';

/** The profile card's circles (docs/02 §2.7). */
export const circleActions = {
	joinCircle: async ({ request, params, locals }) => {
		if (!locals.user) throw redirect(302, '/login');

		const form = await request.formData();
		const name = form.get('circleName');
		if (typeof name !== 'string' || name.trim() === '') {
			return fail(400, { circleError: say(locals, 'errors.circle.needName') });
		}

		// A command (docs/04 §4.11.2), named by the form so one kept on the phone is recognised.
		const command = parseCommand({
			id: form.get('commandId') || ulidGenerator.next(),
			type: 'circle.join',
			payload: { contactId: params.id, circleName: name, role: form.get('role') ?? null },
			issuedAt: systemClock.now()
		});
		if (command?.type !== 'circle.join')
			return fail(400, { circleError: say(locals, 'errors.circle.needName') });
		const author = {
			userId: locals.user.id,
			householdId: locals.user.householdId,
			locale: locals.locale
		};
		const outcome = await dispatchCommand(getCommandDeps(), author, command).catch(() => null);
		if (outcome?.status !== 'applied') {
			return fail(400, {
				circleError:
					outcome?.status === 'refused'
						? outcome.reason(translator(locals))
						: say(locals, 'errors.circle.couldNotAdd')
			});
		}

		throw redirect(303, `/contacts/${params.id}`);
	},

	leaveCircle: async ({ request, params, locals }) => {
		if (!locals.user) throw redirect(302, '/login');
		const viewer = { id: locals.user.id, householdId: locals.user.householdId };

		const contact = await getContact(getContactDeps(), viewer, params.id);
		if (!contact) throw error(404, say(locals, 'errors.contact.notFound'));

		const form = await request.formData();
		const circleId = form.get('circleId');
		if (typeof circleId !== 'string') return fail(400, {});

		await removeMember(getCircleDeps(), circleId, params.id);
		throw redirect(303, `/contacts/${params.id}`);
	}
} satisfies Actions;
