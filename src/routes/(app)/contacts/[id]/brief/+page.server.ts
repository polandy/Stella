import { error } from '@sveltejs/kit';
import { requireViewer } from '#lib/server/auth/guards.js';
import { getContact } from '#lib/server/domain/contacts/contacts.js';
import { listContactFields } from '#lib/server/domain/contact-fields/contact-fields.js';
import { listImportantDates } from '#lib/server/domain/dates/important-dates.js';
import { upcomingDates } from '#lib/server/domain/dates/upcoming.js';
import { ideaWaits, listGiftsForContact } from '#lib/server/domain/gifts/gifts.js';
import { birthOf } from '#lib/when/resolve.js';
import { listHomesOf } from '#lib/server/domain/homes/homes.js';
import { listNotesForContact } from '#lib/server/domain/notes/notes.js';
import { readFamilyOf } from '#lib/server/domain/relationships/family.js';
import { listStoryPage } from '#lib/server/domain/story/story.js';
import { listOpenTodosForContact } from '#lib/server/domain/todos/todos.js';
import { systemClock } from '#lib/server/clock.js';
import { say } from '#lib/server/i18n/say.js';
import { todayFor } from '#lib/dates/today.js';
import { briefBlocks, closeFamily, nextDateAmong } from '#lib/people/brief.js';
import { birthdayFact, metLine } from '#lib/people/identity-card.js';
import { orderOpenTodos } from '#lib/todos/todos.js';
import { allOf } from '../all-of';
import { birthdayOf, peopleNamedIn } from '../person-view';
import { nameLookup, STORY_PAGE_SIZE } from '../story-view';
import { briefBlockView, briefHomes, type BriefRead } from './brief-view';
import type { PageServerLoad } from './$types';

/** How far ahead the brief looks for a date worth knowing: a year, so there always is one. */
const NEXT_DATE_HORIZON_DAYS = 366;

/*
 * A person's brief (docs/dev/02 §2.2.5): what to know before a visit, read-only, on one page that
 * also prints. Every read is the person page's own use-case, scoped to the viewer; this only
 * picks from them.
 */
export const load = (async ({ locals, params }) => {
	const viewer = requireViewer(locals);
	const { services } = locals;

	const contact = await getContact(services.people.contactDeps, viewer, params.id);
	// 404 for both "missing" and "not visible to you" — never reveal existence.
	if (!contact) throw error(404, say(locals, 'errors.contact.notFound'));

	const today = todayFor(systemClock);
	const read = await allOf({
		dates: listImportantDates(services.records.importantDateDeps, viewer, params.id),
		fields: listContactFields(services.records.contactFieldDeps, viewer, params.id),
		homes: listHomesOf(services.records.homeListDeps, viewer, params.id),
		// One page of the story holds the latest moments the brief takes, as a rule several times over.
		storyPage: listStoryPage(services.story.storyDeps, viewer, params.id, {
			limit: STORY_PAGE_SIZE
		}),
		notes: listNotesForContact(services.notes.noteDeps, viewer, params.id),
		gifts: listGiftsForContact(services.gifts.giftDeps, viewer, params.id),
		todos: listOpenTodosForContact(services.todos.todoDeps, viewer, params.id),
		family: readFamilyOf(services.relationships.familyReadDeps, viewer, params.id, {
			reviewOpen: false,
			proposeFor: []
		}),
		// The household's dates: the family's birthdays give their ages and the date coming up.
		dateSources: services.records.importantDates.listSourcesVisibleTo(viewer),
		birthEstimates: services.records.importantDates.listBirthEstimatesVisibleTo(viewer)
	});

	const family = closeFamily(
		{
			ties: read.family.ties,
			tieWording: read.family.tieWording,
			derivedKin: read.family.kinship.derived,
			birthdays: read.dateSources,
			birthEstimates: read.birthEstimates
		},
		today
	);
	const ahead = upcomingDates(read.dateSources, today, {
		horizonDays: NEXT_DATE_HORIZON_DAYS,
		limit: Infinity
	});
	const blocks = briefBlocks<BriefRead>({
		next: nextDateAmong(ahead, [params.id, ...family.map((member) => member.id)]),
		family,
		homes: briefHomes(read.homes, read.fields),
		notes: read.notes,
		story: read.storyPage.items,
		todos: orderOpenTodos(read.todos),
		// An idea for later is not one to bring yet (docs/dev/02 §2.25.8).
		gifts: read.gifts.filter((gift) => !ideaWaits(gift, birthOf(contact), today)),
		met: metLine(contact)
	});
	// The visible graph names everyone the viewer may see, so a mention keeps its name.
	const nameOf = nameLookup(peopleNamedIn(read.family.graph));

	return {
		contact: {
			id: contact.id,
			displayName: contact.displayName,
			avatarPhotoId: contact.avatarPhotoId,
			isDeceased: contact.isDeceased
		},
		birthday: birthdayFact(
			{ ...birthdayOf(contact, read.dates), isDeceased: contact.isDeceased, dates: read.dates },
			today
		),
		blocks: blocks.map((block) => briefBlockView(block, { contactId: contact.id, nameOf })),
		today
	};
}) satisfies PageServerLoad;
