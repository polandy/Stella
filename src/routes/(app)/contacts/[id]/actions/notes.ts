import { dispatchCommand } from '$lib/server/domain/commands/dispatch';
import { readCommand } from '$lib/server/commands/parse';
import { fromFormData } from '$lib/commands/form-data';
import { NoteAddSchema } from '$lib/commands/payloads';
import { ulidGenerator } from '$lib/server/id';
import { systemClock } from '$lib/server/clock';
import { error, fail, redirect } from '@sveltejs/kit';
import { requireRemover, requireViewer } from '$lib/server/auth/guards';
import { getContact } from '$lib/server/domain/contacts/contacts';
import { removeNote } from '$lib/server/domain/notes/remove-note';
import { say, translator } from '$lib/server/i18n/say';
import type { Actions } from '../$types';

/** The notes card (docs/02 §2.5). */
export const noteActions = {
	addNote: async ({ request, params, locals }) => {
		const viewer = requireViewer(locals);

		// A note is a command (docs/04 §4.11.2): named by the form when it can, so a save whose
		// answer was lost and is then kept on the phone is recognised when it arrives again.
		const form = await request.formData();
		const reading = readCommand({
			id: form.get('commandId') || ulidGenerator.next(),
			type: 'note.add',
			payload: { ...fromFormData(NoteAddSchema, form), contactId: params.id },
			issuedAt: systemClock.now()
		});
		if (!reading.ok) {
			return fail(400, {
				noteError: say(
					locals,
					reading.part === 'payload' ? 'errors.note.empty' : 'errors.command.malformed'
				)
			});
		}
		const { command } = reading;
		const author = {
			userId: viewer.id,
			householdId: viewer.householdId,
			locale: locals.locale
		};
		const outcome = await dispatchCommand(locals.services.offline.commandDeps, author, command);
		if (outcome.status !== 'applied') {
			return fail(400, {
				noteError:
					outcome.status === 'refused'
						? outcome.reason(translator(locals))
						: say(locals, 'errors.note.couldNotSave')
			});
		}

		throw redirect(303, `/contacts/${params.id}`);
	},

	/*
	 * Held for the undo window and posted when it closes (docs/02 §2.23). Not a command: it
	 * waits for a connection, so the right to remove is checked at the moment it happens.
	 */
	removeNote: async ({ request, params, locals }) => {
		const remover = requireRemover(locals);

		const form = await request.formData();
		const id = form.get('id');
		if (typeof id !== 'string') return fail(400, {});

		const contact = await getContact(locals.services.people.contactDeps, remover, params.id);
		if (!contact) throw error(404, say(locals, 'errors.contact.notFound'));

		const removed = await removeNote(locals.services.notes.noteDeps, remover, id);
		// Gone meanwhile or not theirs to remove: said alike, so a foreign id reveals nothing.
		if (!removed) return fail(404, { noteError: say(locals, 'errors.note.gone') });
		throw redirect(303, `/contacts/${params.id}`);
	}
} satisfies Actions;
