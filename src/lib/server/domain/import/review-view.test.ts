import { describe, expect, it } from 'bun:test';
import type { StellaPerson } from '../../../import-match/card';
import type { Viewer } from '../../access/visibility';
import { readContactCards } from './contact-cards';
import { findForReview, prepareContactReview, reviewedPhotoTarget } from './review-view';
import type { ContactSourceRepository, RememberedAnswer } from './source-links';

/*
 * What the review step reads (docs/02 §2.16): the cards to answer with who each may be, a
 * search among the people the member may browse, and whose photo a reviewed card's picture
 * becomes — decided by the remembered answer, never by the browser.
 */

const viewer: Viewer = { id: 'u-anna', householdId: 'h1' };

const card = (...lines: string[]) =>
	['BEGIN:VCARD', 'VERSION:3.0', ...lines, 'END:VCARD'].join('\r\n');
const PHOTO = 'PHOTO;ENCODING=b;TYPE=JPEG:AAECAw==';
const EXPORT = [
	card('UID:anna-1', 'FN:Anna Example', 'N:Example;Anna;;;', 'EMAIL:anna@example.org', PHOTO),
	card('UID:bert-1', 'FN:Bert Beispiel', 'N:Beispiel;Bert;;;', 'BDAY:1980-02-29'),
	card('UID:felix-1', 'FN:Felix Neu', 'N:Neu;Felix;;;', PHOTO),
	card('UID:gina-1', 'FN:Gina Alt', 'N:Alt;Gina;;;'),
	card('UID:hans-1', 'FN:Hans Weg', 'N:Weg;Hans;;;')
].join('\r\n');
const hashOf = (key: string) => readContactCards(EXPORT).cards.find((c) => c.key === key)!.hash;

const person = (id: string, first: string, last: string, more: Partial<StellaPerson> = {}) =>
	({
		id,
		firstName: first,
		lastName: last,
		displayName: `${first} ${last}`,
		nickname: null,
		company: null,
		jobTitle: null,
		birthday: null,
		hasPhoto: false,
		fields: [],
		homeLines: [],
		tags: [],
		...more
	}) satisfies StellaPerson;

const anna = person('c-anna', 'Anna', 'Example', {
	fields: [{ kind: 'email', value: 'anna@example.org' }]
});
const bert = person('c-bert', 'Bert', 'Beispiel', {
	birthday: { value: '1981-03-01', precision: 'full' }
});
const berta = person('c-berta', 'Berta', 'Beispiel', { hasPhoto: true });

function sourcesWith(
	remembered: [string, RememberedAnswer][] = [],
	people = [anna, bert, berta]
): ContactSourceRepository {
	return {
		answersFor: async () => new Map(remembered),
		matchablePeople: async () => people,
		skippedFor: async () => [],
		askAgain: async () => false
	};
}

describe('prepareContactReview', () => {
	it('hands the step each card with who it may be, and counts what it leaves out', async () => {
		const sources = sourcesWith([
			['gina-1', { state: 'skipped' }],
			['hans-1', { state: 'out-of-reach' }]
		]);

		const review = await prepareContactReview({ sources }, viewer, EXPORT);

		expect(review).toMatchObject({ source: 'vcard:other', total: 5, settled: 1, skippedBefore: 1 });
		expect(
			review.cards.map((c) => [c.card.key, c.kind, c.candidates.map((p) => p.personId)])
		).toEqual([
			['anna-1', 'strong', ['c-anna']],
			['bert-1', 'weak', ['c-bert']],
			['felix-1', 'none', []]
		]);
		expect(review.cards[0]!.candidates[0]!.reasons).toEqual([
			{ kind: 'email', value: 'anna@example.org' },
			{ kind: 'name' }
		]);
		expect(review.cards[1]!.candidates[0]!.plan.conflicts).toEqual([
			{
				kind: 'birthday',
				stella: { value: '1981-03-01', precision: 'full' },
				card: { value: '1980-02-29', precision: 'full' }
			}
		]);
		expect(review.cards[0]!.card).not.toHaveProperty('hash');
	});

	it('offers a changed linked card to the person it was linked to', async () => {
		const sources = sourcesWith([
			['anna-1', { state: 'linked', personId: 'c-berta', cardHash: 'before' }],
			['bert-1', { state: 'linked', personId: 'c-bert', cardHash: hashOf('bert-1') }]
		]);

		const review = await prepareContactReview({ sources }, viewer, EXPORT);

		expect(review.cards[0]).toMatchObject({
			kind: 'linked',
			candidates: [{ personId: 'c-berta' }]
		});
		expect(review.cards.map((c) => c.card.key)).not.toContain('bert-1');
		expect(review.settled).toBe(1);
	});
});

describe('findForReview', () => {
	it('finds the people whose name holds the words, whatever the accents', async () => {
		const found = await findForReview({ sources: sourcesWith() }, viewer, EXPORT, {
			key: 'felix-1',
			query: 'béi'
		});

		expect(found.map((p) => p.personId)).toEqual(['c-bert', 'c-berta']);
		expect(found[0]!.plan.add).toContainEqual({ kind: 'photo' });
	});

	it('finds nobody for one letter or a card that is not in the file', async () => {
		const sources = sourcesWith();
		expect(
			await findForReview({ sources }, viewer, EXPORT, { key: 'felix-1', query: 'b' })
		).toEqual([]);
		expect(
			await findForReview({ sources }, viewer, EXPORT, { key: 'nope', query: 'bert' })
		).toEqual([]);
	});
});

describe('reviewedPhotoTarget', () => {
	const annaPhoto = { contactId: 'vcard:contact:anna-1', isAvatar: true };

	it('keeps a new person’s picture as theirs', async () => {
		const felix = { contactId: 'vcard:contact:felix-1', isAvatar: true };
		const sources = sourcesWith([
			['felix-1', { state: 'linked', personId: felix.contactId, cardHash: 'h' }]
		]);

		expect(await reviewedPhotoTarget({ sources }, viewer, EXPORT, felix)).toEqual(felix);
	});

	it('gives the picture to the person the card was linked to, as their photo if they had none', async () => {
		const toAnna = sourcesWith([
			['anna-1', { state: 'linked', personId: 'c-anna', cardHash: 'h' }]
		]);
		const toBerta = sourcesWith([
			['anna-1', { state: 'linked', personId: 'c-berta', cardHash: 'h' }]
		]);

		expect(await reviewedPhotoTarget({ sources: toAnna }, viewer, EXPORT, annaPhoto)).toEqual({
			contactId: 'c-anna',
			isAvatar: true
		});
		expect(await reviewedPhotoTarget({ sources: toBerta }, viewer, EXPORT, annaPhoto)).toEqual({
			contactId: 'c-berta',
			isAvatar: false
		});
	});

	it('takes no picture of a skipped, unanswered or out-of-reach card', async () => {
		for (const remembered of [
			[['anna-1', { state: 'skipped' }]],
			[],
			[['anna-1', { state: 'out-of-reach' }]]
		] as [string, RememberedAnswer][][]) {
			const sources = sourcesWith(remembered);
			expect(await reviewedPhotoTarget({ sources }, viewer, EXPORT, annaPhoto)).toBeNull();
		}
	});
});
