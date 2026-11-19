import { dispatchCommand } from '#lib/server/domain/commands/dispatch.js';
import { readCommand } from '#lib/server/commands/parse.js';
import { fromFormData } from '#lib/commands/form-data.js';
import { TagAssignSchema } from '#lib/commands/person-payloads.js';
import { ulidGenerator } from '#lib/server/id.js';
import { systemClock } from '#lib/server/clock.js';
import { error, fail, redirect } from '@sveltejs/kit';
import { requireViewer } from '#lib/server/auth/guards.js';
import { getContact } from '#lib/server/domain/contacts/contacts.js';
import { unassignTag } from '#lib/server/domain/tags/tags.js';
import { say, translator } from '#lib/server/i18n/say.js';
import type { Actions } from '../$types';

/** The profile card's tags (docs/dev/02 §2.8). */
export const tagActions = {
	addTag: async ({ request, params, locals }) => {
		const viewer = requireViewer(locals);

		// A command (docs/dev/04 §4.11.2), named by the form so one kept on the phone is recognised.
		const form = await request.formData();
		const reading = readCommand({
			id: form.get('commandId') || ulidGenerator.next(),
			type: 'tag.assign',
			payload: { ...fromFormData(TagAssignSchema, form), contactId: params.id },
			issuedAt: systemClock.now()
		});
		if (!reading.ok) return fail(400, { tagError: say(locals, 'errors.tag.needName') });
		const { command } = reading;
		const author = {
			userId: viewer.id,
			householdId: viewer.householdId,
			locale: locals.locale
		};
		const outcome = await dispatchCommand(locals.services.offline.commandDeps, author, command);
		if (outcome.status !== 'applied') {
			return fail(400, {
				tagError:
					outcome.status === 'refused'
						? outcome.reason(translator(locals))
						: say(locals, 'errors.tag.couldNotAdd')
			});
		}

		throw redirect(303, `/contacts/${params.id}`);
	},

	removeTag: async ({ request, params, locals }) => {
		const viewer = requireViewer(locals);

		const form = await request.formData();
		const tagId = form.get('tagId');
		if (typeof tagId !== 'string') return fail(400, {});

		const contact = await getContact(locals.services.people.contactDeps, viewer, params.id);
		if (!contact) throw error(404, say(locals, 'errors.contact.notFound'));

		await unassignTag(locals.services.records.tagDeps, viewer.householdId, params.id, tagId);
		throw redirect(303, `/contacts/${params.id}`);
	}
} satisfies Actions;
