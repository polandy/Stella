import { dispatchCommand } from '$lib/server/domain/commands/dispatch';
import { parseCommand } from '$lib/server/commands/parse';
import { ulidGenerator } from '$lib/server/id';
import { systemClock } from '$lib/server/clock';
import { error, fail, redirect } from '@sveltejs/kit';
import * as v from 'valibot';
import { getContact } from '$lib/server/domain/contacts/contacts';
import { deleteInteraction, INTERACTION_KINDS } from '$lib/server/domain/interactions/interactions';
import { deleteJournalEntry } from '$lib/server/domain/journal/journal';
import { contactSectionPath } from '$lib/contacts/sections';
import {
	getCommandDeps,
	getContactDeps,
	getInteractionDeps,
	getJournalDeps
} from '$lib/server/services';
import { say, translator } from '$lib/server/i18n/say';
import type { Actions } from '../$types';

const LogInteractionSchema = v.object({
	kind: v.picklist(INTERACTION_KINDS),
	happenedAt: v.pipe(v.string(), v.minLength(1)),
	title: v.optional(v.pipe(v.string(), v.trim())),
	description: v.optional(v.pipe(v.string(), v.trim())),
	visibility: v.optional(v.picklist(['shared', 'private']), 'shared'),
	participantIds: v.array(v.pipe(v.string(), v.minLength(1)))
});

/** The story card: touchpoints logged, and entries taken back (docs/02 §2.23). */
export const storyActions = {
	logInteraction: async ({ request, params, locals }) => {
		if (!locals.user) throw redirect(302, '/login');

		const form = await request.formData();
		const parsed = v.safeParse(LogInteractionSchema, {
			kind: form.get('kind'),
			happenedAt: form.get('happenedAt'),
			title: form.get('title') || undefined,
			description: form.get('description') || undefined,
			visibility: form.get('visibility') || undefined,
			participantIds: form.getAll('participants').filter((p) => typeof p === 'string')
		});
		if (!parsed.success) {
			return fail(400, { interactionError: say(locals, 'errors.interaction.needKindAndDay') });
		}

		// A touchpoint is a command (docs/04 §4.11.2), named by the form when it can, so one
		// kept on the phone after a lost answer is recognised when it arrives again.
		const command = parseCommand({
			id: form.get('commandId') || ulidGenerator.next(),
			type: 'interaction.log',
			payload: {
				contactId: params.id,
				...parsed.output,
				title: parsed.output.title ?? null,
				description: parsed.output.description ?? null
			},
			issuedAt: systemClock.now()
		});
		if (command?.type !== 'interaction.log') {
			return fail(400, { interactionError: say(locals, 'errors.interaction.needKindAndDay') });
		}
		const author = {
			userId: locals.user.id,
			householdId: locals.user.householdId,
			locale: locals.locale
		};
		const outcome = await dispatchCommand(getCommandDeps(), author, command).catch(() => null);
		if (outcome?.status !== 'applied') {
			return fail(400, {
				interactionError:
					outcome?.status === 'refused'
						? outcome.reason(translator(locals))
						: say(locals, 'errors.interaction.couldNotLog')
			});
		}

		// The story timeline owns its paged list, so the page reloads to show the new item — and
		// has to be told where it came from, or the reader lands back at the top.
		throw redirect(303, contactSectionPath(params.id, 'story'));
	},

	removeInteraction: async ({ request, params, locals }) => {
		if (!locals.user) throw redirect(302, '/login');
		const viewer = { id: locals.user.id, householdId: locals.user.householdId };

		const form = await request.formData();
		const interactionId = form.get('id');
		if (typeof interactionId !== 'string') return fail(400, {});

		const contact = await getContact(getContactDeps(), viewer, params.id);
		if (!contact) throw error(404, say(locals, 'errors.contact.notFound'));

		const author = {
			userId: locals.user.id,
			householdId: locals.user.householdId,
			locale: locals.locale,
			defaultVisibility: 'shared' as const
		};
		const removed = await deleteInteraction(getInteractionDeps(), author, interactionId);
		if (!removed)
			return fail(403, { interactionError: say(locals, 'errors.interaction.onlyLogger') });
		throw redirect(303, `/contacts/${params.id}`);
	},

	/*
	 * The story timeline shows journal entries beside touchpoints, so removing one has to be
	 * possible from here too — previously only the full journal page could.
	 */
	removeJournalEntry: async ({ request, params, locals }) => {
		if (!locals.user) throw redirect(302, '/login');
		const viewer = { id: locals.user.id, householdId: locals.user.householdId };

		const form = await request.formData();
		const id = form.get('id');
		if (typeof id !== 'string') return fail(400, {});

		const contact = await getContact(getContactDeps(), viewer, params.id);
		if (!contact) throw error(404, say(locals, 'errors.contact.notFound'));

		const author = {
			userId: locals.user.id,
			householdId: locals.user.householdId,
			defaultVisibility: 'shared' as const
		};
		const removed = await deleteJournalEntry(getJournalDeps(), author, id);
		if (!removed) return fail(403, { interactionError: say(locals, 'errors.journal.onlyAuthor') });
		throw redirect(303, `/contacts/${params.id}`);
	}
} satisfies Actions;
