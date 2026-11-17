import { fail, redirect } from '@sveltejs/kit';
import { requireUser, requireViewer } from '$lib/server/auth/guards';
import { listBrowsableNamesAmong } from '$lib/server/domain/contacts/contact-names';
import { listPeopleEnoughForFirstRun } from '$lib/server/domain/contacts/directory';
import { upcomingDates } from '$lib/server/domain/dates/upcoming';
import { readyGifts } from '$lib/server/domain/gifts/bought';
import { countOpenIdeas } from '$lib/server/domain/gifts/gifts';
import { listHomeMembers } from '$lib/server/domain/homes/homes';
import { dispatchCommand } from '$lib/server/domain/commands/dispatch';
import { parsePhotoCommand, readCommand } from '$lib/server/commands/parse';
import { fromFormData } from '$lib/commands/form-data';
import { MomentCaptureSchema } from '$lib/commands/payloads';
import { ulidGenerator } from '$lib/server/id';
import { systemClock } from '$lib/server/clock';
import { membersViewerFirst } from '$lib/server/domain/household/members';
import { buildStreamUpTo, STREAM_LIMIT } from '$lib/server/domain/stream/stream';
import { offersMorePages, streamPagesOf } from '$lib/stream/pages';
import { parseStreamFilter } from '$lib/stream/filter';
import { homeTagChips, tagNarrowing } from '$lib/hashtags/tag-pages';
import type { Actions, PageServerLoad } from './$types';
import { say, translator } from '$lib/server/i18n/say';
import type { MessageKey } from '$lib/i18n/translate';
import { linkHintHref } from '$lib/stream/link-hint';
import { welcomeSteps } from '$lib/stream/welcome';
import { todayFor } from '$lib/dates/today';
import { composerFor, linkSuggestionAmong, peopleNamedBy, photosPosted } from './home-view';
import { householdTodoActions, readHouseholdTodos } from './_shared/household-todos';
import { householdPlanActions, readHomePlans } from './_shared/household-plans';
import { streamForView } from './_shared/stream-view';
import { memoryBandForView } from './_shared/memories-view';
import { memoriesOn } from '$lib/server/domain/memories/memories';
import { MEMORY_BAND_CAP, MEMORY_STRIP_CAP } from '$lib/memories/memories';

/*
 * Home (docs/dev/02 §2.22, §2.12): the "What happened?" capture field, the household stream, and
 * the rail beside it — what is to do and what is coming up. Everything on it is a scoped query over existing
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
	// How far down the reader has scrolled, so the back button draws the same rows (§2.22.2).
	const pages = streamPagesOf(url.searchParams);

	// One reading of the clock, so the composer's day, the horizon and *On this day* cannot
	// straddle midnight.
	const day = todayFor(systemClock);

	const [streamPage, onList, dateSources, firstPeople, entryTags, todos, memories, homes] =
		await Promise.all([
			buildStreamUpTo(locals.services.media.streamDeps, viewer, filter, pages * STREAM_LIMIT),
			// Who the household can still act on — the browsing scope — among just those.
			listBrowsableNamesAmong(locals.services.people.contactNameDeps, viewer, named.ids),
			locals.services.records.importantDates.listSourcesVisibleTo(viewer),
			// Just enough of the household to tell whether it has begun (docs/dev/02 §2.22.3).
			listPeopleEnoughForFirstRun(locals.services.people.contactDirectoryDeps, viewer),
			// For the Tags row and the line over a stream narrowed by tags (docs/dev/02 §2.20.2).
			locals.services.story.entryTags.listVisibleTo(viewer),
			// Every open one: the band picks the pressing ones, and counts the rest for *Show all*.
			readHouseholdTodos(locals),
			// One past each cap, so the band knows whether *More* has more (docs/dev/02 §2.12.1).
			memoriesOn(locals.services.media.memoryDeps, viewer, day, {
				entries: MEMORY_BAND_CAP + 1,
				photos: MEMORY_STRIP_CAP + 1
			}),
			// The composer offers whoever shares the moment's person's home (docs/dev/02 §2.20.3).
			listHomeMembers(locals.services.records.homeListDeps, viewer)
		]);
	const items = streamPage.items;
	const stream = await streamForView(locals.services.people.contactNameDeps, viewer, items);

	const dates = upcomingDates(dateSources, day);
	// A person coming up with open gift ideas says how many, and what is bought for them (§2.13.3),
	// and what outing is booked with them and how many wait without a day (§2.27.7).
	const coming = dates.map((date) => date.contactId);
	const [ideas, ready, plans] = await Promise.all([
		countOpenIdeas(locals.services.gifts.giftDeps, viewer, coming),
		readyGifts(locals.services.gifts.giftDeps, viewer, coming),
		readHomePlans(locals, coming, day)
	]);
	const upcoming = dates.map((date) => ({
		...date,
		giftIdeas: ideas.get(date.contactId) ?? 0,
		readyGifts: ready.get(date.contactId) ?? [],
		bookedPlans: plans.lines.get(date.contactId)?.booked ?? [],
		planIdeas: plans.lines.get(date.contactId)?.undated ?? 0
	}));

	return {
		today: day,
		homes,
		...composerFor(url.searchParams, named, onList),
		upcoming,
		plans: { asking: plans.asking, coming: plans.coming },
		todos,
		memories: memoryBandForView(memories),
		linkSuggestion: linkSuggestionAmong(named, onList),
		// The first-run card (docs/dev/02 §2.22.3), or null once the household has begun.
		welcome: welcomeSteps({
			peopleIds: firstPeople,
			selfContactId: user.selfContactId,
			isAdmin: user.role === 'admin'
		}),
		filter,
		members,
		tagChips: homeTagChips(entryTags, filter.tags),
		tagLine: tagNarrowing(filter.tags, filter.memberId, entryTags, items.length),
		stream,
		pages,
		morePages: offersMorePages(pages, streamPage.more)
	};
};

/** What the composer says when the moment's field `field` did not read. */
function captureProblem(field: string | null): MessageKey {
	if (field === 'body') return 'errors.moment.needText';
	if (field === 'entryDate') return 'errors.moment.badDay';
	return 'errors.moment.couldNotSave';
}

export const actions: Actions = {
	// The *To-dos* band ticks here (docs/dev/02 §2.26.6).
	...householdTodoActions('/'),
	// A passed outing idea is answered here, and *Undo* of its tick (docs/dev/02 §2.27.7).
	...householdPlanActions('/'),
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
