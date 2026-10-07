import { dispatchCommand } from '$lib/server/domain/commands/dispatch';
import { readCommand } from '$lib/server/commands/parse';
import { fromFormData } from '$lib/commands/form-data';
import { TagAssignSchema } from '$lib/commands/payloads';
import { ulidGenerator } from '$lib/server/id';
import { systemClock } from '$lib/server/clock';
import { error, fail, redirect } from '@sveltejs/kit';
import { requireViewer } from '$lib/server/auth/guards';
import { getContact } from '$lib/server/domain/contacts/contacts';
import { unassignTag } from '$lib/server/domain/tags/tags';
import { getCommandDeps, getTagDeps } from '$lib/server/services';
import { say, translator } from '$lib/server/i18n/say';
import type { Actions } from '../$types';

/** The profile card's tags (docs/02 §2.8). */
export const tagActions = {
	addTag: async ({ request, params, locals }) => {
		const viewer = requireViewer(locals);

		// A command (docs/04 §4.11.2), named by the form so one kept on the phone is recognised.
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
		const outcome = await dispatchCommand(getCommandDeps(), author, command);
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

		await unassignTag(getTagDeps(), viewer.householdId, params.id, tagId);
		throw redirect(303, `/contacts/${params.id}`);
	}
} satisfies Actions;
