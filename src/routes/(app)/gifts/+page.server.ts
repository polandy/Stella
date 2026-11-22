import { fromFormData } from '#lib/commands/form-data.js';
import { GiftMarkGivenSchema } from '#lib/commands/gift-todo-payloads.js';
import { todayFor } from '#lib/dates/today.js';
import { ideaListGroups } from '#lib/gifts/idea-list.js';
import { requireViewer } from '#lib/server/auth/guards.js';
import { systemClock } from '#lib/server/clock.js';
import { upcomingDates } from '#lib/server/domain/dates/upcoming.js';
import { readGiftGroups } from '#lib/server/domain/gifts/gift-group-follow-up.js';
import { listOpenIdeas } from '#lib/server/domain/gifts/gifts.js';
import { listPlanned, passedOf } from '#lib/server/domain/gifts/planned.js';
import { giverViewOf } from '#lib/gifts/giver.js';
import { occasionOverview } from '#lib/gifts/occasion-overview.js';
import type { PlannedGift } from '#lib/gifts/record-given.js';
import { authorNames } from '#lib/server/domain/household/members.js';
import { applyGiftCommand, boughtOf, occasionOf, textOf } from '../_shared/gift-commands';
import { recordGivenFromForm } from '../_shared/gift-record';
import { openIdeaView } from './idea-view';
import type { Actions, PageServerLoad } from './$types';

/*
 * Every open gift idea of the household on one page (docs/dev/02 §2.25.6) — a Christmas shopping
 * list. One group per person, whoever's next birthday or Christmas Eve comes first on top. An
 * idea is given right here; everything else about it stays on the person's Gifts card.
 */

/** Christmas Eve is never more than a year off, so no birthday further out can come first. */
const BIRTHDAY_HORIZON_DAYS = 366;

export const load: PageServerLoad = async ({ locals }) => {
	const viewer = requireViewer(locals);
	const [ideas, planned, dateSources, nameOfAuthor] = await Promise.all([
		listOpenIdeas(locals.services.gifts.giftDeps, viewer),
		listPlanned(locals.services.gifts.giftDeps, viewer),
		locals.services.records.importantDates.listSourcesVisibleTo(viewer),
		authorNames(locals.services.household.memberDeps, viewer.householdId)
	]);
	const groupIds = [...new Set(ideas.flatMap((idea) => (idea.groupId ? [idea.groupId] : [])))];
	const groups = (await readGiftGroups(locals.services.gifts.giftGroupDeps, viewer, groupIds)).map(
		({ group, gifts }) => ({
			id: group.id,
			members: gifts.map((gift) => ({ contactId: gift.contactId, name: gift.contactName }))
		})
	);
	const today = todayFor(systemClock);
	const ahead = upcomingDates(dateSources, today, {
		horizonDays: BIRTHDAY_HORIZON_DAYS,
		limit: Infinity
	});
	return {
		today,
		viewerId: viewer.id,
		// What *Nachtragen…* may tick: the planned gifts whose day went by (§2.25.14).
		planned: passedOf(planned, today).map((gift): PlannedGift => ({
			id: gift.id,
			contactId: gift.contactId,
			contactName: gift.contactName,
			title: gift.title,
			state: gift.state,
			giver: giverViewOf(gift),
			when: gift.when,
			on: gift.on
		})),
		// Every recipient under each occasion, bought ones too (§2.25.6).
		occasions: occasionOverview(
			planned.map((gift) => ({
				id: gift.id,
				contactId: gift.contactId,
				contactName: gift.contactName,
				avatarPhotoId: gift.avatarPhotoId,
				title: gift.title,
				state: gift.state,
				on: gift.on,
				giver: giverViewOf(gift),
				hiddenFromRecipient: gift.hiddenFromRecipient
			}))
		),
		groups: ideaListGroups(
			ideas.map((idea) => openIdeaView(idea, viewer.id, nameOfAuthor, groups)),
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
	},

	/** *Nachtragen…* for everyone (§2.25.14): each gift names its person, the access layer checks each. */
	recordGifts: async ({ request, locals }) =>
		recordGivenFromForm(locals, await request.formData(), '/gifts'),

	/** *Bought* on the list (§2.25.9): the idea leaves it, and its toast takes it back. */
	markGiftBought: async ({ request, locals }) => {
		const form = await request.formData();
		return applyGiftCommand(locals, form, 'gift.markBought', boughtOf(form), 'giftRowError', {
			contactId: textOf(form, 'contactId') ?? '',
			back: '/gifts'
		});
	}
} satisfies Actions;
