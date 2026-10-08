import { fail, redirect } from '@sveltejs/kit';
import { requireUser, requireViewer } from '$lib/server/auth/guards';
import {
	listBrowsableNamesAmong,
	listContactNamesAmong
} from '$lib/server/domain/contacts/contact-names';
import { listPeopleEnoughForFirstRun } from '$lib/server/domain/contacts/directory';
import { hasImminentDate, upcomingDates } from '$lib/server/domain/dates/upcoming';
import { countOpenIdeas } from '$lib/server/domain/gifts/gifts';
import { dispatchCommand } from '$lib/server/domain/commands/dispatch';
import { parsePhotoCommand, readCommand } from '$lib/server/commands/parse';
import { fromFormData } from '$lib/commands/form-data';
import { MomentCaptureSchema } from '$lib/commands/payloads';
import { ulidGenerator } from '$lib/server/id';
import { systemClock } from '$lib/server/clock';
import { renderMarkdownWithMentions } from '$lib/server/domain/notes/markdown';
import { membersViewerFirst } from '$lib/server/domain/household/members';
import { buildStream } from '$lib/server/domain/stream/stream';
import { extractMentionIds } from '$lib/mentions/mentions';
import { parseStreamFilter } from '$lib/stream/filter';
import type { Actions, PageServerLoad } from './$types';
import { say, translator } from '$lib/server/i18n/say';
import type { MessageKey } from '$lib/i18n/translate';
import { linkHintHref } from '$lib/stream/link-hint';
import { welcomeSteps } from '$lib/stream/welcome';
import { todayFor } from '$lib/dates/today';
import { composerFor, linkSuggestionAmong, peopleNamedBy, photosPosted } from './home-view';

/*
 * Home (docs/02 §2.22, §2.12): the "What happened?" capture field, the household stream, and
 * the rail beside it — what is coming up. Everything on it is a scoped query over existing
 * tables; capture is the moments use-case. The layout guard already ensures `locals.user`.
 */

export const load: PageServerLoad = async ({ locals, url }) => {
	const user = requireUser(locals);
	const viewer = requireViewer(locals);

	// The filter names a member, so it can only be read once the household's members are known.
	const members = await membersViewerFirst(locals.services.household.memberDeps, viewer);
	const filter = parseStreamFilter(
		url.searchParams,
		members.map((m) => m.id)
	);

	const named = peopleNamedBy(url.searchParams);

	const [items, onList, dateSources, firstPeople] = await Promise.all([
		buildStream(locals.services.media.streamDeps, viewer, filter),
		// Who the household can still act on — the browsing scope — among just those.
		listBrowsableNamesAmong(locals.services.people.contactNameDeps, viewer, named.ids),
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

	// One reading of the clock, so the composer's day and the horizon cannot straddle midnight.
	const day = todayFor(systemClock);
	const dates = upcomingDates(dateSources, day);
	// A person coming up with open gift ideas says how many (docs/02 §2.13.3).
	const ideas = await countOpenIdeas(
		locals.services.gifts.giftDeps,
		viewer,
		dates.map((date) => date.contactId)
	);
	const upcoming = dates.map((date) => ({ ...date, giftIdeas: ideas.get(date.contactId) ?? 0 }));

	return {
		today: day,
		...composerFor(url.searchParams, named, onList),
		upcoming,
		// Below `lg` the rail only precedes the stream when a date is close (docs/05 §5.5).
		railFirst: hasImminentDate(upcoming),
		linkSuggestion: linkSuggestionAmong(named, onList),
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
		for (const posted of photosPosted(form)) {
			const photo = parsePhotoCommand({
				id: posted.photoId ?? ulidGenerator.next(),
				type: 'moment.photo',
				parentId: command.id,
				image: new Uint8Array(await posted.image.arrayBuffer()),
				thumb: new Uint8Array(await posted.thumb.arrayBuffer()),
				width: posted.width,
				height: posted.height,
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
