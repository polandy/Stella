import { fail, redirect } from '@sveltejs/kit';
import * as v from 'valibot';
import { listContacts } from '$lib/server/domain/contacts/contacts';
import { attachJournalPhoto } from '$lib/server/domain/media/journal-photos';
import { captureMoment, MomentNeedsPersonError } from '$lib/server/domain/moments/moments';
import { renderMarkdownWithMentions } from '$lib/server/domain/notes/markdown';
import { buildStream } from '$lib/server/domain/stream/stream';
import {
	getCaptureMomentDeps,
	getContactDeps,
	getJournalPhotoDeps,
	getStreamDeps
} from '$lib/server/services';
import type { Actions, PageServerLoad } from './$types';

/*
 * Home (docs/02 §2.22): the "What happened?" capture field and the household stream. The
 * stream is a scoped query over existing tables; capture is the moments use-case. The layout
 * guard already ensures `locals.user`.
 */

/** Query param carrying the post-save "link these two?" hint: `?link=<a>,<b>`. */
const LINK_PARAM = 'link';

function today(): string {
	return new Date().toLocaleDateString('en-CA'); // ISO YYYY-MM-DD
}

export const load: PageServerLoad = async ({ locals, url }) => {
	if (!locals.user) throw redirect(302, '/login');
	const viewer = { id: locals.user.id, householdId: locals.user.householdId };

	const [items, contacts] = await Promise.all([
		buildStream(getStreamDeps(), viewer),
		listContacts(getContactDeps(), viewer)
	]);
	const nameById = new Map(contacts.map((c) => [c.id, c.displayName]));
	const nameOf = (id: string) => nameById.get(id) ?? null;

	// The hint only names people the viewer may see; anything else is silently dropped.
	const [a, b] = (url.searchParams.get(LINK_PARAM) ?? '').split(',');
	const linkSuggestion =
		a && b && nameById.has(a) && nameById.has(b)
			? { a: { id: a, name: nameById.get(a)! }, b: { id: b, name: nameById.get(b)! } }
			: null;

	return {
		today: today(),
		compose: url.searchParams.has('compose'),
		linkSuggestion,
		candidates: contacts.map((c) => ({
			id: c.id,
			displayName: c.displayName,
			firstName: c.firstName,
			lastName: c.lastName,
			visibility: c.visibility
		})),
		stream: items.map((item) =>
			item.kind === 'moment'
				? { ...item, body: undefined, bodyHtml: renderMarkdownWithMentions(item.body, nameOf) }
				: item
		)
	};
};

const CaptureSchema = v.object({
	body: v.pipe(v.string(), v.trim(), v.minLength(1, 'Write what happened first.')),
	entryDate: v.pipe(v.string(), v.regex(/^\d{4}-\d{2}-\d{2}$/, 'Please pick a valid day.')),
	visibility: v.optional(v.picklist(['shared', 'private']), 'shared'),
	newPeople: v.array(v.pipe(v.string(), v.trim(), v.minLength(1)))
});

export const actions: Actions = {
	capture: async ({ request, locals }) => {
		if (!locals.user) throw redirect(302, '/login');
		const author = {
			userId: locals.user.id,
			householdId: locals.user.householdId,
			defaultVisibility: 'shared' as const
		};

		const form = await request.formData();
		const parsed = v.safeParse(CaptureSchema, {
			body: form.get('body'),
			entryDate: form.get('entryDate'),
			visibility: form.get('visibility') || undefined,
			newPeople: form.getAll('newPeople').filter((n): n is string => typeof n === 'string')
		});
		if (!parsed.success) {
			return fail(400, {
				momentError: parsed.issues[0]?.message ?? 'Could not save the moment.',
				draft: String(form.get('body') ?? '')
			});
		}

		let captured;
		try {
			captured = await captureMoment(getCaptureMomentDeps(), author, parsed.output);
		} catch (err) {
			const message =
				err instanceof MomentNeedsPersonError || err instanceof Error
					? err.message
					: 'Could not save the moment.';
			return fail(400, { momentError: message, draft: parsed.output.body });
		}

		// Photos ride along exactly as on the journal page, on the anchor's entry.
		const images = form.getAll('image');
		const thumbs = form.getAll('thumb');
		const widths = form.getAll('width');
		const heights = form.getAll('height');
		for (let i = 0; i < images.length; i++) {
			const image = images[i];
			const thumb = thumbs[i];
			if (!(image instanceof File) || !(thumb instanceof File)) continue;
			try {
				await attachJournalPhoto(getJournalPhotoDeps(), author, {
					contactId: captured.anchorContactId,
					journalEntryId: captured.entryId,
					visibility: parsed.output.visibility,
					upload: {
						image: new Uint8Array(await image.arrayBuffer()),
						thumb: new Uint8Array(await thumb.arrayBuffer()),
						width: Number(widths[i]),
						height: Number(heights[i])
					}
				});
			} catch {
				return fail(400, { momentError: 'The moment was saved, but a photo could not be added.', draft: '' });
			}
		}

		const hint = captured.linkSuggestion ? `?${LINK_PARAM}=${captured.linkSuggestion.join(',')}` : '';
		throw redirect(303, `/${hint}`);
	}
};
