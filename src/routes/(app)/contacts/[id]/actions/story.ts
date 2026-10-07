import { dispatchCommand } from '$lib/server/domain/commands/dispatch';
import { readCommand } from '$lib/server/commands/parse';
import { fromFormData } from '$lib/commands/form-data';
import { InteractionLogSchema } from '$lib/commands/payloads';
import { ulidGenerator } from '$lib/server/id';
import { systemClock } from '$lib/server/clock';
import { error, fail, redirect } from '@sveltejs/kit';
import { requireViewer } from '$lib/server/auth/guards';
import { getContact } from '$lib/server/domain/contacts/contacts';
import { deleteInteraction } from '$lib/server/domain/interactions/interactions';
import { deleteJournalEntry } from '$lib/server/domain/journal/journal';
import { contactSectionPath } from '$lib/contacts/sections';
import { getCommandDeps } from '$lib/server/services';
import { say, translator } from '$lib/server/i18n/say';
import type { Actions } from '../$types';

/** The story card: touchpoints logged, and entries taken back (docs/02 §2.23). */
export const storyActions = {
	logInteraction: async ({ request, params, locals }) => {
		const viewer = requireViewer(locals);

		// A touchpoint is a command (docs/04 §4.11.2), named by the form when it can, so one
		// kept on the phone after a lost answer is recognised when it arrives again. The form
		// names the people with it `participants`, one field each.
		const form = await request.formData();
		const reading = readCommand({
			id: form.get('commandId') || ulidGenerator.next(),
			type: 'interaction.log',
			payload: {
				...fromFormData(InteractionLogSchema, form),
				participantIds: form.getAll('participants').filter((p) => typeof p === 'string'),
				contactId: params.id
			},
			issuedAt: systemClock.now()
		});
		if (!reading.ok) {
			return fail(400, { interactionError: say(locals, 'errors.interaction.needKindAndDay') });
		}
		const { command } = reading;
		const author = {
			userId: viewer.id,
			householdId: viewer.householdId,
			locale: locals.locale
		};
		const outcome = await dispatchCommand(getCommandDeps(), author, command);
		if (outcome.status !== 'applied') {
			return fail(400, {
				interactionError:
					outcome.status === 'refused'
						? outcome.reason(translator(locals))
						: say(locals, 'errors.interaction.couldNotLog')
			});
		}

		// The story timeline owns its paged list, so the page reloads to show the new item — and
		// has to be told where it came from, or the reader lands back at the top.
		throw redirect(303, contactSectionPath(params.id, 'story'));
	},

	removeInteraction: async ({ request, params, locals }) => {
		const viewer = requireViewer(locals);

		const form = await request.formData();
		const interactionId = form.get('id');
		if (typeof interactionId !== 'string') return fail(400, {});

		const contact = await getContact(locals.services.people.contactDeps, viewer, params.id);
		if (!contact) throw error(404, say(locals, 'errors.contact.notFound'));

		const author = {
			userId: viewer.id,
			householdId: viewer.householdId,
			locale: locals.locale,
			defaultVisibility: 'shared' as const
		};
		const removed = await deleteInteraction(
			locals.services.story.interactionDeps,
			author,
			interactionId
		);
		if (!removed)
			return fail(403, { interactionError: say(locals, 'errors.interaction.onlyLogger') });
		throw redirect(303, `/contacts/${params.id}`);
	},

	/*
	 * The story timeline shows journal entries beside touchpoints, so removing one has to be
	 * possible from here too — previously only the full journal page could.
	 */
	removeJournalEntry: async ({ request, params, locals }) => {
		const viewer = requireViewer(locals);

		const form = await request.formData();
		const id = form.get('id');
		if (typeof id !== 'string') return fail(400, {});

		const contact = await getContact(locals.services.people.contactDeps, viewer, params.id);
		if (!contact) throw error(404, say(locals, 'errors.contact.notFound'));

		const author = {
			userId: viewer.id,
			householdId: viewer.householdId,
			defaultVisibility: 'shared' as const
		};
		const removed = await deleteJournalEntry(locals.services.story.journalDeps, author, id);
		if (!removed) return fail(403, { interactionError: say(locals, 'errors.journal.onlyAuthor') });
		throw redirect(303, `/contacts/${params.id}`);
	}
} satisfies Actions;
