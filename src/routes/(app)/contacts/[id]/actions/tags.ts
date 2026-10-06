import { dispatchCommand } from '$lib/server/domain/commands/dispatch';
import { parseCommand } from '$lib/server/commands/parse';
import { ulidGenerator } from '$lib/server/id';
import { systemClock } from '$lib/server/clock';
import { error, fail, redirect } from '@sveltejs/kit';
import * as v from 'valibot';
import { getContact } from '$lib/server/domain/contacts/contacts';
import { TAG_COLORS, unassignTag } from '$lib/server/domain/tags/tags';
import { getCommandDeps, getContactDeps, getTagDeps } from '$lib/server/services';
import { say, translator } from '$lib/server/i18n/say';
import type { Actions } from '../$types';

const AddTagSchema = v.object({
	name: v.pipe(v.string(), v.trim(), v.minLength(1)),
	color: v.optional(v.picklist(TAG_COLORS))
});

/** The profile card's tags (docs/02 §2.8). */
export const tagActions = {
	addTag: async ({ request, params, locals }) => {
		if (!locals.user) throw redirect(302, '/login');

		const form = await request.formData();
		const parsed = v.safeParse(AddTagSchema, {
			name: form.get('name'),
			color: form.get('color') || undefined
		});
		if (!parsed.success) return fail(400, { tagError: say(locals, 'errors.tag.needName') });

		// A command (docs/04 §4.11.2), named by the form so one kept on the phone is recognised.
		const command = parseCommand({
			id: form.get('commandId') || ulidGenerator.next(),
			type: 'tag.assign',
			payload: {
				contactId: params.id,
				name: parsed.output.name,
				color: parsed.output.color ?? null
			},
			issuedAt: systemClock.now()
		});
		if (command?.type !== 'tag.assign')
			return fail(400, { tagError: say(locals, 'errors.tag.needName') });
		const author = {
			userId: locals.user.id,
			householdId: locals.user.householdId,
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
		if (!locals.user) throw redirect(302, '/login');
		const viewer = { id: locals.user.id, householdId: locals.user.householdId };

		const form = await request.formData();
		const tagId = form.get('tagId');
		if (typeof tagId !== 'string') return fail(400, {});

		const contact = await getContact(getContactDeps(), viewer, params.id);
		if (!contact) throw error(404, say(locals, 'errors.contact.notFound'));

		await unassignTag(getTagDeps(), locals.user.householdId, params.id, tagId);
		throw redirect(303, `/contacts/${params.id}`);
	}
} satisfies Actions;
