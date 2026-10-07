import { error, fail, redirect } from '@sveltejs/kit';
import { requireViewer } from '$lib/server/auth/guards';
import * as v from 'valibot';
import {
	getContact,
	listContactNamesAmong,
	listContacts
} from '$lib/server/domain/contacts/contacts';
import { authorNames } from '$lib/server/domain/household/members';
import { authorLabel } from '$lib/story/author';
import {
	deleteJournalEntry,
	editJournalEntry,
	listJournalForContact,
	setJournalMentions
} from '$lib/server/domain/journal/journal';
import { renderMarkdownWithMentions } from '$lib/server/domain/notes/markdown';
import { extractMentionIds, mentionsOtherThan } from '$lib/mentions/mentions';
import { resolveForAudience } from '$lib/server/domain/mentions/resolve-for-audience';
import { withNamesakeContext } from '$lib/server/domain/mentions/namesake-context';
import {
	getCommandDeps,
	getContactDeps,
	getJournalDeps,
	getPhotos,
	getMemberDeps,
	getNamesakeContextDeps
} from '$lib/server/services';
import { parsePhotoCommand, readCommand } from '$lib/server/commands/parse';
import { fromFormData } from '$lib/commands/form-data';
import { JournalWriteSchema } from '$lib/commands/payloads';
import { dispatchCommand } from '$lib/server/domain/commands/dispatch';
import { systemClock } from '$lib/server/clock';
import { ulidGenerator } from '$lib/server/id';

import type { Actions, PageServerLoad } from './$types';
import { TranslatableError } from '$lib/errors/translatable';
import { say, translator } from '$lib/server/i18n/say';
import type { MessageKey } from '$lib/i18n/translate';
import { todayFor } from '$lib/dates/today';

export const load: PageServerLoad = async ({ locals, params }) => {
	const viewer = requireViewer(locals);

	const contact = await getContact(getContactDeps(), viewer, params.id);
	if (!contact) throw error(404, say(locals, 'errors.contact.notFound')); // never reveal existence

	const [entries, journalPhotos] = await Promise.all([
		listJournalForContact(getJournalDeps(), viewer, params.id),
		getPhotos().listJournalPhotos(viewer, params.id)
	]);
	// Names for the people the entries mention, not for the whole household.
	const contactNames = await listContactNamesAmong(
		getContactDeps(),
		viewer,
		entries.flatMap((e) => extractMentionIds(e.body))
	);

	// Group visible photo ids by their entry so each entry renders its own gallery.
	const photosByEntry = new Map<string, string[]>();
	for (const p of journalPhotos) {
		const list = photosByEntry.get(p.journalEntryId) ?? [];
		list.push(p.id);
		photosByEntry.set(p.journalEntryId, list);
	}

	// Name lookup for @-mention chips, scoped to what the viewer may see — archived people
	// included, since a mention already written still names them (docs/02 §2.2).
	const nameById = new Map(contactNames.map((c) => [c.id, c.displayName]));
	const nameOf = (id: string) => nameById.get(id) ?? null;
	// Who wrote each entry, named the same way the story names it (docs/02 §2.23).
	const nameOfAuthor = await authorNames(getMemberDeps(), viewer.householdId);

	return {
		contact: {
			id: contact.id,
			displayName: contact.displayName,
			avatarPhotoId: contact.avatarPhotoId
		},
		today: todayFor(systemClock),
		// render Markdown + @-mentions server-side; the output is already safe (docs/02 §2.5, §2.20.1)
		entries: entries.map((e) => ({
			id: e.id,
			entryDate: e.entryDate,
			title: e.title,
			bodyHtml: renderMarkdownWithMentions(e.body, nameOf),
			// the stored body for the edit form, which shows its tokens as handles and keeps whom
			// each one names — including people the picker does not offer, such as the subject.
			// Only an author edits an entry, so only their own carry it.
			bodyForEdit: e.createdBy === viewer.id ? e.body : null,
			mentionNames: Object.fromEntries(
				extractMentionIds(e.body).flatMap((id) =>
					nameById.has(id) ? [[id, nameById.get(id)!]] : []
				)
			),
			visibility: e.visibility,
			mine: e.createdBy === viewer.id,
			author: authorLabel(e.createdBy === viewer.id, nameOfAuthor(e.createdBy)),
			photos: photosByEntry.get(e.id) ?? [],
			updatedAt: e.updatedAt
		}))
	};
};

const EditSchema = v.object({
	id: v.pipe(v.string(), v.minLength(1)),
	title: v.optional(v.pipe(v.string(), v.trim())),
	body: v.pipe(v.string(), v.trim(), v.minLength(1))
});

export const actions: Actions = {
	save: async ({ request, params, locals }) => {
		const viewer = requireViewer(locals);

		// The contact must be visible to journal about it.
		const contact = await getContact(getContactDeps(), viewer, params.id);
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
			return fail(400, {
				journalError: say(
					locals,
					reading.field === 'entryDate' ? 'errors.journal.badDay' : 'errors.note.empty'
				)
			});
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
		const written = command ? await dispatchCommand(getCommandDeps(), author, command) : null;
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
			const stored = photo ? await dispatchCommand(getCommandDeps(), author, photo) : null;
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
			return fail(400, {
				journalError: say(
					locals,
					(parsed.issues[0]?.message as MessageKey | undefined) ?? 'errors.note.empty'
				)
			});
		}

		// Need the entry's own visibility to scope the @-picker candidates the same way `save`
		// does — editing never changes the day/visibility slot (docs/02 §2.20).
		const entries = await listJournalForContact(getJournalDeps(), viewer, params.id);
		const entry = entries.find((e) => e.id === parsed.output.id);
		if (!entry || entry.createdBy !== viewer.id) {
			return fail(404, { journalError: say(locals, 'errors.journal.editFailed') });
		}

		const contacts = await listContacts(getContactDeps(), viewer);
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
			resolved = await withNamesakeContext(getNamesakeContextDeps(), viewer, async () =>
				resolveForAudience(contacts, entry.visibility, parsed.output.body)
			);
			ok = await editJournalEntry(getJournalDeps(), author, {
				id: parsed.output.id,
				title: parsed.output.title ?? null,
				body: resolved.body
			});
		} catch (err) {
			return fail(400, {
				journalError:
					err instanceof TranslatableError
						? err.phrase(translator(locals))
						: say(locals, 'errors.journal.editFailed')
			});
		}
		if (!ok) {
			return fail(404, { journalError: say(locals, 'errors.journal.editFailed') });
		}

		await setJournalMentions(
			getJournalDeps(),
			parsed.output.id,
			mentionsOtherThan(resolved.ids, params.id)
		);

		throw redirect(303, `/contacts/${params.id}/journal`);
	},

	delete: async ({ request, params, locals }) => {
		const viewer = requireViewer(locals);

		const form = await request.formData();
		const id = form.get('id');
		if (typeof id !== 'string') return fail(400, {});

		await deleteJournalEntry(
			getJournalDeps(),
			{ userId: viewer.id, householdId: viewer.householdId, defaultVisibility: 'shared' },
			id
		);
		throw redirect(303, `/contacts/${params.id}/journal`);
	}
};
