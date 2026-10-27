import { describe, expect, it } from 'bun:test';
import type { StellaPerson } from '../../../import-match/card';
import type { Viewer } from '../../access/visibility';
import type { ActivityOf } from '../activity/activity';
import { ContactGoneError } from '../contacts/require-visible';
import { readContactCards } from './contact-cards';
import {
	applyContactReview,
	ReviewUnansweredError,
	type CardAnswer,
	type ContactReviewWriter,
	type ReviewWrite
} from './contact-review';
import { englishWording } from './monica/wording.fixture';
import type { ContactSourceRepository, RememberedAnswer } from './source-links';

/*
 * Applying the matching review (docs/02 §2.16): every card the review asked about needs an
 * answer, and the answers are handed to the writer as one write — the new people, what the
 * people already here gain, and the answers to remember.
 */

const NOW = 1_000;
const viewer: Viewer = { id: 'u-anna', householdId: 'h1' };

const card = (...lines: string[]) =>
	['BEGIN:VCARD', 'VERSION:3.0', ...lines, 'END:VCARD'].join('\r\n');
const EXPORT = [
	card(
		'UID:anna-1',
		'FN:Anna Example',
		'N:Example;Anna;;;',
		'EMAIL:anna@example.org',
		'TEL;TYPE=CELL:+41 79 000 00 01',
		'PHOTO;ENCODING=b;TYPE=JPEG:AAECAw=='
	),
	card(
		'UID:felix-1',
		'FN:Felix Neu',
		'N:Neu;Felix;;;',
		'EMAIL:felix@example.org',
		'CATEGORIES:Climbing'
	),
	card('UID:gina-1', 'FN:Gina Alt', 'N:Alt;Gina;;;')
].join('\r\n');
const hashOf = (key: string) => readContactCards(EXPORT).cards.find((c) => c.key === key)!.hash;

const anna: StellaPerson = {
	id: 'c-anna',
	firstName: 'Anna',
	lastName: 'Example',
	displayName: 'Anna Example',
	nickname: null,
	company: null,
	jobTitle: null,
	birthday: null,
	hasPhoto: false,
	fields: [{ kind: 'email', value: 'anna@example.org' }],
	homeLines: [],
	tags: []
};

function setup(remembered: [string, RememberedAnswer][] = [], people = [anna]) {
	const writes: { write: ReviewWrite; audit: ActivityOf<'contacts.reviewed'> | null }[] = [];
	const sources: ContactSourceRepository = {
		answersFor: async () => new Map(remembered),
		matchablePeople: async () => people,
		skippedFor: async () => [],
		askAgain: async () => false
	};
	const writer: ContactReviewWriter = {
		async applyReview(_viewer, write, audit) {
			writes.push({ write, audit });
			return {
				people: write.newPeople.contacts.length,
				completed: write.completions.length
			};
		}
	};
	let n = 0;
	const deps = { sources, writer, clock: { now: () => NOW }, ids: { next: () => `id-${++n}` } };
	const run = (answers: [string, CardAnswer][]) =>
		applyContactReview(deps, {
			viewer,
			text: EXPORT,
			answers: new Map(answers),
			visibility: 'shared',
			wording: englishWording,
			locale: 'en'
		});
	return { run, writes };
}

const allAnswered: [string, CardAnswer][] = [
	['anna-1', { kind: 'same', personId: 'c-anna', takeCard: [] }],
	['felix-1', { kind: 'new' }],
	['gina-1', { kind: 'skip' }]
];

describe('applyContactReview', () => {
	it('writes the new people, what the people here gain and every answer, in one write', async () => {
		const { run, writes } = setup();

		const outcome = await run(allAnswered);

		expect(writes).toHaveLength(1);
		const { write, audit } = writes[0]!;
		expect(write.newPeople.contacts.map((c) => c.id)).toEqual(['vcard:contact:felix-1']);
		expect(write.newPeople.contactFields.map((f) => f.value)).toEqual(['felix@example.org']);
		expect(write.newPeople.tags.map((t) => t.name)).toEqual(['Climbing']);
		expect(write.completions).toEqual([
			expect.objectContaining({
				personId: 'c-anna',
				fields: [expect.objectContaining({ kind: 'phone', label: 'Mobile' })],
				photo: true
			})
		]);
		expect(write.links.map((l) => [l.externalUid, l.state, l.contactId])).toEqual([
			['anna-1', 'linked', 'c-anna'],
			['felix-1', 'linked', 'vcard:contact:felix-1'],
			['gina-1', 'skipped', null]
		]);
		expect(write.links[2]).toMatchObject({
			source: 'vcard:other',
			cardName: 'Gina Alt',
			answeredBy: 'u-anna',
			answeredAt: NOW
		});
		expect(audit?.event).toEqual({
			kind: 'contacts.reviewed',
			people: 1,
			completed: 1,
			source: 'vcard:other',
			visibility: 'shared',
			locale: 'en'
		});
		expect(outcome).toMatchObject({ added: 1, completed: 1, skipped: 1, linkPhotos: 0 });
		// Anna's picture comes in as her photo, through the wizard's photo step.
		expect(outcome.photos.map((p) => [p.contactId, p.isAvatar])).toEqual([['c-anna', true]]);
	});

	it('writes nothing while a card the review asked about has no answer', async () => {
		const { run, writes } = setup();

		await expect(run(allAnswered.slice(0, 2))).rejects.toBeInstanceOf(ReviewUnansweredError);
		expect(writes).toHaveLength(0);
	});

	it('refuses a person the member may no longer browse', async () => {
		const { run, writes } = setup([], []);

		await expect(run(allAnswered)).rejects.toBeInstanceOf(ContactGoneError);
		expect(writes).toHaveLength(0);
	});

	it('asks nothing again on a re-run of the same export, and writes nothing', async () => {
		const { run, writes } = setup([
			['anna-1', { state: 'linked', personId: 'c-anna', cardHash: hashOf('anna-1') }],
			['felix-1', { state: 'out-of-reach' }],
			['gina-1', { state: 'skipped' }]
		]);

		const outcome = await run([]);

		expect(writes).toEqual([]);
		expect(outcome).toMatchObject({ added: 0, completed: 0, skipped: 0, photos: [] });
	});

	it('remembers a changed card that gives nothing new, without logging it', async () => {
		const hasAll: StellaPerson = {
			...anna,
			hasPhoto: true,
			fields: [...anna.fields, { kind: 'phone', value: '+41 79 000 00 01' }]
		};
		const { run, writes } = setup(
			[
				['anna-1', { state: 'linked', personId: 'c-anna', cardHash: 'before-the-change' }],
				['felix-1', { state: 'out-of-reach' }],
				['gina-1', { state: 'skipped' }]
			],
			[hasAll]
		);

		await run([['anna-1', { kind: 'same', personId: 'c-anna', takeCard: [] }]]);

		expect(writes[0]!.write.completions).toEqual([]);
		expect(writes[0]!.write.links.map((l) => l.externalUid)).toEqual(['anna-1']);
		expect(writes[0]!.audit).toBeNull();
	});

	it('ignores an answer for a card the review did not ask about', async () => {
		const { run, writes } = setup([['gina-1', { state: 'skipped' }]]);

		await run([
			...allAnswered.slice(0, 2),
			['gina-1', { kind: 'new' }],
			['nobody', { kind: 'new' }]
		]);

		expect(writes[0]!.write.newPeople.contacts.map((c) => c.id)).toEqual(['vcard:contact:felix-1']);
	});
});
