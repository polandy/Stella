import { error, fail, redirect } from '@sveltejs/kit';
import { requireViewer } from '$lib/server/auth/guards';
import * as v from 'valibot';
import { getContact } from '$lib/server/domain/contacts/contacts';
import { listContactNamesAmong } from '$lib/server/domain/contacts/contact-names';
import { listContacts } from '$lib/server/domain/contacts/directory';
import { authorNames } from '$lib/server/domain/household/members';
import {
	deleteJournalEntry,
	editJournalEntry,
	listJournalForContact,
	setJournalMentions
} from '$lib/server/domain/journal/journal';
import { extractMentionIds, mentionsOtherThan } from '$lib/mentions/mentions';
import { resolveForAudience } from '$lib/server/domain/mentions/resolve-for-audience';
import { withNamesakeContext } from '$lib/server/domain/mentions/namesake-context';
import { parsePhotoCommand, readCommand } from '$lib/server/commands/parse';
import { fromFormData } from '$lib/commands/form-data';
import { JournalWriteSchema } from '$lib/commands/payloads';
import { dispatchCommand } from '$lib/server/domain/commands/dispatch';
import { systemClock } from '$lib/server/clock';
import { ulidGenerator } from '$lib/server/id';

import type { Actions, PageServerLoad } from './$types';
import { TranslatableError } from '$lib/i18n/translatable';
import { say, translator } from '$lib/server/i18n/say';
import type { MessageKey } from '$lib/i18n/translate';
import { todayFor } from '$lib/dates/today';
import { journalEntriesFor } from './journal-view';

export const load: PageServerLoad = async ({ locals, params }) => {
	const viewer = requireViewer(locals);

	const contact = await getContact(locals.services.people.contactDeps, viewer, params.id);
	if (!contact) throw error(404, say(locals, 'errors.contact.notFound')); // never reveal existence

	const [entries, journalPhotos] = await Promise.all([
		listJournalForContact(locals.services.story.journalDeps, viewer, params.id),
		locals.services.media.journalPhotos.listJournalPhotos(viewer, params.id)
	]);
	// Names for the people the entries mention, not for the whole household.
	const contactNames = await listContactNamesAmong(
		locals.services.people.contactNameDeps,
		viewer,
		entries.flatMap((e) => extractMentionIds(e.body))
	);

	const nameOfAuthor = await authorNames(locals.services.household.memberDeps, viewer.householdId);

	return {
		contact: {
			id: contact.id,
			displayName: contact.displayName,
			avatarPhotoId: contact.avatarPhotoId
		},
		today: todayFor(systemClock),
		entries: journalEntriesFor({
			viewerId: viewer.id,
			entries,
			photos: journalPhotos,
			names: contactNames,
			nameOfAuthor
		})
	};
};

/*
 * The form read only checks the shape the page posts. Text that is only spaces is the
 * use-case's to refuse, with its own sentence; a form the page would never post gets the
 * general one.
 */
const EditSchema = v.object({
	id: v.string(),
	title: v.optional(v.pipe(v.string(), v.trim())),
	body: v.string()
});

/** What the journal says when the entry's field `field` did not read. */
function writeProblem(field: string | null): MessageKey {
	if (field === 'body') return 'errors.note.empty';
	if (field === 'entryDate') return 'errors.journal.badDay';
	return 'errors.journal.couldNotSave';
}

export const actions: Actions = {
	save: async ({ request, params, locals }) => {
		const viewer = requireViewer(locals);

		// The contact must be visible to journal about it.
		const contact = await getContact(locals.services.people.contactDeps, viewer, params.id);
		if (!contact) throw error(404, say(locals, 'errors.contact.notFound'));

		// Writing is an addition (§2.20) and a command (docs/04 §4.11.2): named by the form when it
		// can, so a save whose answer was lost and is kept on the phone is recognised on arrival.
		const form = await request.formData();
		const reading = readCommand({
			id: form.get('commandId') || ulidGenerator.next(),
			type: 'journal.write',
			payload: { ...fromFormData(JournalWriteSchema, form), contactId: params.id },
			issuedAt: systemClock.now()
		});
		if (!reading.ok && reading.part === 'payload') {
			return fail(400, { journalError: say(locals, writeProblem(reading.field)) });
		}
		const author = { userId: viewer.id, householdId: viewer.householdId, locale: locals.locale };
		const refusal = (
			outcome: Awaited<ReturnType<typeof dispatchCommand>> | null,
			otherwise: MessageKey
		) =>
			fail(400, {
				journalError:
					outcome?.status === 'refused'
						? outcome.reason(translator(locals))
						: say(locals, otherwise)
			});
		const command = reading.ok ? reading.command : null;
		const written = command
			? await dispatchCommand(locals.services.offline.commandDeps, author, command)
			: null;
		if (!command || written?.status !== 'applied')
			return refusal(written, 'errors.journal.couldNotSave');

		// Browser-processed photos (parallel image/thumb/width/height arrays) follow as commands of
		// their own, landing on the entry with its visibility (§2.20).
		const images = form.getAll('image');
		const thumbs = form.getAll('thumb');
		const widths = form.getAll('width');
		const heights = form.getAll('height');
		for (let i = 0; i < images.length; i++) {
			const image = images[i];
			const thumb = thumbs[i];
			if (!(image instanceof File) || !(thumb instanceof File)) continue;
			const photo = parsePhotoCommand({
				id: ulidGenerator.next(),
				type: 'moment.photo',
				parentId: command.id,
				image: new Uint8Array(await image.arrayBuffer()),
				thumb: new Uint8Array(await thumb.arrayBuffer()),
				width: Number(widths[i]),
				height: Number(heights[i]),
				issuedAt: systemClock.now()
			});
			const stored = photo
				? await dispatchCommand(locals.services.offline.commandDeps, author, photo)
				: null;
			if (stored?.status !== 'applied') return refusal(stored, 'errors.journal.photoFailed');
		}

		throw redirect(303, `/contacts/${params.id}/journal`);
	},

	edit: async ({ request, params, locals }) => {
		const viewer = requireViewer(locals);

		const form = await request.formData();
		const parsed = v.safeParse(EditSchema, {
			id: form.get('id'),
			title: form.get('title') || undefined,
			body: form.get('body')
		});
		if (!parsed.success) {
			return fail(400, { journalError: say(locals, 'errors.form.checkAndRetry') });
		}

		// Need the entry's own visibility to scope the @-picker candidates the same way `save`
		// does — editing never changes the day/visibility slot (docs/02 §2.20).
		const entries = await listJournalForContact(
			locals.services.story.journalDeps,
			viewer,
			params.id
		);
		const entry = entries.find((e) => e.id === parsed.output.id);
		if (!entry || entry.createdBy !== viewer.id) {
			return fail(404, { journalError: say(locals, 'errors.journal.editFailed') });
		}

		const contacts = await listContacts(locals.services.people.contactDirectoryDeps, viewer);
		const author = {
			userId: viewer.id,
			householdId: viewer.householdId,
			locale: locals.locale,
			defaultVisibility: 'shared' as const
		};

		let ok: boolean;
		let resolved: { body: string; ids: string[] };
		try {
			// A handle that could be several people is asked about, not dropped (docs/02 §2.2.3).
			resolved = await withNamesakeContext(
				locals.services.people.namesakeContextDeps,
				viewer,
				async () => resolveForAudience(contacts, entry.visibility, parsed.output.body)
			);
			ok = await editJournalEntry(locals.services.story.journalDeps, author, {
				id: parsed.output.id,
				title: parsed.output.title ?? null,
				body: resolved.body
			});
		} catch (err) {
			if (!(err instanceof TranslatableError)) throw err;
			return fail(400, { journalError: err.phrase(translator(locals)) });
		}
		if (!ok) {
			return fail(404, { journalError: say(locals, 'errors.journal.editFailed') });
		}

		await setJournalMentions(
			locals.services.story.journalDeps,
			parsed.output.id,
			mentionsOtherThan(resolved.ids, params.id)
		);

		throw redirect(303, `/contacts/${params.id}/journal`);
	},

	delete: async ({ request, params, locals }) => {
		const viewer = requireViewer(locals);

		const form = await request.formData();
		const id = form.get('id');
		if (typeof id !== 'string') {
			return fail(400, { journalError: say(locals, 'errors.form.checkAndRetry') });
		}

		const deleted = await deleteJournalEntry(
			locals.services.story.journalDeps,
			{ userId: viewer.id, householdId: viewer.householdId, defaultVisibility: 'shared' },
			id
		);
		// Gone meanwhile or another member's: said alike, so a foreign id reveals nothing.
		if (!deleted) return fail(404, { journalError: say(locals, 'errors.journal.gone') });
		throw redirect(303, `/contacts/${params.id}/journal`);
	}
};
