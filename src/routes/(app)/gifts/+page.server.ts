import { fromFormData } from '$lib/commands/form-data';
import { GiftMarkGivenSchema } from '$lib/commands/payloads';
import { todayFor } from '$lib/dates/today';
import { ideaListGroups } from '$lib/gifts/idea-list';
import { requireViewer } from '$lib/server/auth/guards';
import { systemClock } from '$lib/server/clock';
import { upcomingDates } from '$lib/server/domain/dates/upcoming';
import { listOpenIdeas } from '$lib/server/domain/gifts/gifts';
import { authorNames } from '$lib/server/domain/household/members';
import { applyGiftCommand, occasionOf, textOf } from '../_shared/gift-commands';
import { openIdeaView } from './idea-view';
import type { Actions, PageServerLoad } from './$types';

/*
 * Every open gift idea of the household on one page (docs/02 §2.25.6) — a Christmas shopping
 * list. One group per person, whoever's next birthday or Christmas Eve comes first on top. An
 * idea is given right here; everything else about it stays on the person's Gifts card.
 */

/** Christmas Eve is never more than a year off, so no birthday further out can come first. */
const BIRTHDAY_HORIZON_DAYS = 366;

export const load: PageServerLoad = async ({ locals }) => {
	const viewer = requireViewer(locals);
	const [ideas, dateSources, nameOfAuthor] = await Promise.all([
		listOpenIdeas(locals.services.gifts.giftDeps, viewer),
		locals.services.records.importantDates.listSourcesVisibleTo(viewer),
		authorNames(locals.services.household.memberDeps, viewer.householdId)
	]);
	const today = todayFor(systemClock);
	const ahead = upcomingDates(dateSources, today, {
		horizonDays: BIRTHDAY_HORIZON_DAYS,
		limit: Infinity
	});
	return {
		today,
		groups: ideaListGroups(
			ideas.map((idea) => openIdeaView(idea, viewer.id, nameOfAuthor)),
			ahead,
			today
		)
	};
};

export const actions = {
	/** *Mark as given* on the list: the person comes with the form, the access layer checks it. */
	markGiftGiven: async ({ request, locals }) => {
		const form = await request.formData();
		return applyGiftCommand(
			locals,
			form,
			'gift.markGiven',
			{ ...fromFormData(GiftMarkGivenSchema, form), occasion: occasionOf(form) },
			'giftRowError',
			{ contactId: textOf(form, 'contactId') ?? '', back: '/gifts' }
		);
	}
} satisfies Actions;
