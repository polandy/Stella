import { fail, redirect } from '@sveltejs/kit';
import { requireUser, requireViewer } from '$lib/server/auth/guards';
import {
	listBrowsableNamesAmong,
	listContactNamesAmong
} from '$lib/server/domain/contacts/contact-names';
import { listPeopleEnoughForFirstRun } from '$lib/server/domain/contacts/directory';
import { hasImminentDate, upcomingDates } from '$lib/server/domain/dates/upcoming';
import { dispatchCommand } from '$lib/server/domain/commands/dispatch';
import { parsePhotoCommand, readCommand } from '$lib/server/commands/parse';
import { fromFormData } from '$lib/commands/form-data';
import { MomentCaptureSchema } from '$lib/commands/payloads';
import { ulidGenerator } from '$lib/server/id';
import { systemClock } from '$lib/server/clock';
import { renderMarkdownWithMentions } from '$lib/server/domain/notes/markdown';
import { membersViewerFirst } from '$lib/server/domain/household/members';
import { buildStream } from '$lib/server/domain/stream/stream';
import { extractMentionIds, mentionToken } from '$lib/mentions/mentions';
import { parseStreamFilter } from '$lib/stream/filter';
import type { Actions, PageServerLoad } from './$types';
import { say, translator } from '$lib/server/i18n/say';
import type { MessageKey } from '$lib/i18n/translate';
import { LINK_PARAM, linkHintHref } from '$lib/stream/link-hint';
import { welcomeSteps } from '$lib/stream/welcome';
import { todayFor } from '$lib/dates/today';

/*
 * Home (docs/02 §2.22, §2.12): the "What happened?" capture field, the household stream, and
 * the rail beside it — what is coming up. Everything on it is a scoped query over existing
 * tables; capture is the moments use-case. The layout guard already ensures `locals.user`.
 */

/** Query param that opens the composer pre-filled with one person's handle: `?about=<id>`. */
const ABOUT_PARAM = 'about';

export const load: PageServerLoad = async ({ locals, url }) => {
	const user = requireUser(locals);
	const viewer = requireViewer(locals);

	// The filter names a member, so it can only be read once the household's members are known.
	const members = await membersViewerFirst(locals.services.household.memberDeps, viewer);
	const filter = parseStreamFilter(
		url.searchParams,
		members.map((m) => m.id)
	);

	// The people the URL names: a link hint's pair, or the person a moment is about.
	const [a, b] = (url.searchParams.get(LINK_PARAM) ?? '').split(',');
	const aboutId = url.searchParams.get(ABOUT_PARAM);
	const named = [a, b, aboutId].filter((id): id is string => Boolean(id));

	const [items, onList, dateSources, firstPeople] = await Promise.all([
		buildStream(locals.services.media.streamDeps, viewer, filter),
		// Who the household can still act on — the browsing scope — among just those.
		listBrowsableNamesAmong(locals.services.people.contactNameDeps, viewer, named),
		locals.services.records.importantDates.listSourcesVisibleTo(viewer),
		// Just enough of the household to tell whether it has begun (docs/02 §2.22.3).
		listPeopleEnoughForFirstRun(locals.services.people.contactDirectoryDeps, viewer)
	]);
	// What a mention already written is called (archived people included), for the moments
	// on this page only.
	const names = await listContactNamesAmong(
		locals.services.people.contactNameDeps,
		viewer,
		items.flatMap((item) => (item.kind === 'moment' ? extractMentionIds(item.body) : []))
	);
	const nameById = new Map(names.map((c) => [c.id, c.displayName]));
	const nameOf = (id: string) => nameById.get(id) ?? null;

	// The hint only names people the viewer may see; anything else is silently dropped.
	const nameOnList = new Map(onList.map((c) => [c.id, c.displayName]));
	const [a2, b2] = [nameOnList.get(a), nameOnList.get(b)];
	const linkSuggestion =
		a && b && a2 && b2 ? { a: { id: a, name: a2 }, b: { id: b, name: b2 } } : null;

	// "Write a moment" on an upcoming date opens the composer with that person already in it.
	const about = onList.find((c) => c.id === aboutId);

	// One reading of the clock, so the composer's day and the horizon cannot straddle midnight.
	const day = todayFor(systemClock);
	const upcoming = upcomingDates(dateSources, day);

	return {
		today: day,
		compose: url.searchParams.has('compose') || about !== undefined,
		// As stored, so the composer takes the person as picked — a namesake too (docs/02 §2.2.3).
		draft: about ? `${mentionToken(about.id)} ` : null,
		upcoming,
		// Below `lg` the rail only precedes the stream when a date is close (docs/05 §5.5).
		railFirst: hasImminentDate(upcoming),
		linkSuggestion,
		// The first-run card (docs/02 §2.22.3), or null once the household has begun.
		welcome: welcomeSteps({
			peopleIds: firstPeople,
			selfContactId: user.selfContactId,
			isAdmin: user.role === 'admin'
		}),
		filter,
		members,
		stream: items.map((item) =>
			item.kind === 'moment'
				? { ...item, body: undefined, bodyHtml: renderMarkdownWithMentions(item.body, nameOf) }
				: item
		)
	};
};

/** What the composer says when the moment's field `field` did not read. */
function captureProblem(field: string | null): MessageKey {
	if (field === 'body') return 'errors.moment.needText';
	if (field === 'entryDate') return 'errors.moment.badDay';
	return 'errors.moment.couldNotSave';
}

export const actions: Actions = {
	capture: async ({ request, locals }) => {
		const viewer = requireViewer(locals);
		const author = {
			userId: viewer.id,
			householdId: viewer.householdId,
			locale: locals.locale,
			defaultVisibility: 'shared' as const
		};

		// The composer names its command when it can, so a double submit is one moment; a form
		// posted without JavaScript gets an id here.
		const form = await request.formData();
		const reading = readCommand({
			id: form.get('commandId') || ulidGenerator.next(),
			type: 'moment.capture',
			payload: fromFormData(MomentCaptureSchema, form),
			issuedAt: systemClock.now()
		});
		if (!reading.ok) {
			return fail(400, {
				momentError: say(
					locals,
					reading.part === 'payload' ? captureProblem(reading.field) : 'errors.command.malformed'
				),
				draft: String(form.get('body') ?? '')
			});
		}
		const { command } = reading;

		// A refusal is answered here; anything else is ours, and `handleError` logs it.
		const outcome = await dispatchCommand(locals.services.offline.commandDeps, author, command);
		if (outcome.status !== 'applied') {
			const message =
				outcome.status === 'refused'
					? outcome.reason(translator(locals))
					: say(locals, 'errors.moment.couldNotSave');
			return fail(400, { momentError: message, draft: command.payload.body });
		}
		const captured = outcome.result;

		// Photos ride along as commands of their own, named by the composer, so a save whose
		// answer was lost can send them again from the phone without doubling any.
		const images = form.getAll('image');
		const thumbs = form.getAll('thumb');
		const widths = form.getAll('width');
		const heights = form.getAll('height');
		const photoIds = form.getAll('photoId');
		for (let i = 0; i < images.length; i++) {
			const image = images[i];
			const thumb = thumbs[i];
			if (!(image instanceof File) || !(thumb instanceof File)) continue;
			const photoId = photoIds[i];
			const photo = parsePhotoCommand({
				id: typeof photoId === 'string' && photoId ? photoId : ulidGenerator.next(),
				type: 'moment.photo',
				parentId: command.id,
				image: new Uint8Array(await image.arrayBuffer()),
				thumb: new Uint8Array(await thumb.arrayBuffer()),
				width: Number(widths[i]),
				height: Number(heights[i]),
				issuedAt: systemClock.now()
			});
			const attached = photo
				? await dispatchCommand(locals.services.offline.commandDeps, author, photo)
				: null;
			if (attached?.status !== 'applied') {
				return fail(400, {
					momentError: say(locals, 'errors.moment.photoFailed'),
					draft: ''
				});
			}
		}

		throw redirect(303, linkHintHref(captured.linkSuggestion));
	}
};
