import { dispatchCommand } from '$lib/server/domain/commands/dispatch';
import { parseCommand } from '$lib/server/commands/parse';
import { ulidGenerator } from '$lib/server/id';
import { systemClock } from '$lib/server/clock';
import { fail, redirect } from '@sveltejs/kit';
import { requireViewer } from '$lib/server/auth/guards';
import * as v from 'valibot';
import { getCommandDeps } from '$lib/server/services';
import { say, translator } from '$lib/server/i18n/say';
import type { Actions } from '../$types';

const AddNoteSchema = v.object({
	body: v.pipe(v.string(), v.trim(), v.minLength(1)),
	visibility: v.optional(v.picklist(['shared', 'private']), 'shared'),
	isPinned: v.optional(v.boolean(), false)
});

/** The notes card (docs/02 §2.5). */
export const noteActions = {
	addNote: async ({ request, params, locals }) => {
		const viewer = requireViewer(locals);

		const form = await request.formData();
		const parsed = v.safeParse(AddNoteSchema, {
			body: form.get('body'),
			visibility: form.get('visibility') || undefined,
			isPinned: form.get('isPinned') === 'on'
		});
		if (!parsed.success) {
			return fail(400, { noteError: say(locals, 'errors.note.empty') });
		}

		// A note is a command (docs/04 §4.11.2): named by the form when it can, so a save whose
		// answer was lost and is then kept on the phone is recognised when it arrives again.
		const command = parseCommand({
			id: form.get('commandId') || ulidGenerator.next(),
			type: 'note.add',
			payload: { contactId: params.id, ...parsed.output },
			issuedAt: systemClock.now()
		});
		if (command?.type !== 'note.add') {
			return fail(400, { noteError: say(locals, 'errors.command.malformed') });
		}
		const author = {
			userId: viewer.id,
			householdId: viewer.householdId,
			locale: locals.locale
		};
		const outcome = await dispatchCommand(getCommandDeps(), author, command);
		if (outcome.status !== 'applied') {
			return fail(400, {
				noteError:
					outcome.status === 'refused'
						? outcome.reason(translator(locals))
						: say(locals, 'errors.note.couldNotSave')
			});
		}

		throw redirect(303, `/contacts/${params.id}`);
	}
} satisfies Actions;
