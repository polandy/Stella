import { describe, expect, it } from 'bun:test';
import type { ReviewAnswer } from '../../../import-match/review';
import type { Viewer } from '../../access/visibility';
import { ContactGoneError } from '../contacts/require-visible';
import { englishWording } from '../import/monica/wording.fixture';
import { fixedClock, sequentialIds } from '../testing';
import { anna, b64, JPEG, setup, vcf } from '../testing/nextcloud-book';
import { BOOK, person } from '../testing/nextcloud-household';
import { applyBookReview, prepareBookReview, unansweredCards } from './review';

/*
 * The linked book's new cards in the matching review (docs/02 §2.16.3): every card Stella has
 * not met yet is asked about once, under the book's source, against shared people only; what
 * is answered links the card, and a card's picture fills a person who has none.
 */

const ADA: Viewer = { id: 'u-ada', householdId: 'h1' };

const bert = (...more: string[]) => vcf('bert', 'FN:Bert Beispiel', 'N:Beispiel;Bert;;;', ...more);

async function synced(cards: Record<string, string>) {
	const world = setup(cards);
	await world.sync();
	const { house } = world;
	const deps = {
		store: house.store,
		sources: house.sources,
		writer: house.writer,
		setAvatar: house.setAvatar,
		clock: fixedClock(3_000),
		ids: sequentialIds()
	};
	const apply = (answers: Record<string, ReviewAnswer>) =>
		applyBookReview(deps, {
			viewer: ADA,
			source: BOOK,
			answers: new Map(Object.entries(answers)),
			wording: englishWording,
			locale: 'en'
		});
	return { ...world, deps, apply };
}

describe('the book’s new cards', () => {
	it('are the cards nobody answered for, asked under the book’s source', async () => {
		const { house, deps } = await synced({ 'anna.vcf': anna(), 'bert.vcf': bert() });
		house.add(person('p-anna', { displayName: 'Anna Muster' }));
		house.links.set('anna', 'p-anna');

		expect(await unansweredCards(deps, ADA, BOOK)).toBe(bert());
		const review = await prepareBookReview(deps, ADA, BOOK);
		expect(review.source).toBe(BOOK);
		expect(review.cards.map((c) => c.card.key)).toEqual(['bert']);
	});

	it('are nothing to review once every card is answered', async () => {
		const { house, deps } = await synced({ 'anna.vcf': anna() });
		house.links.set('anna', null);

		expect(await unansweredCards(deps, ADA, BOOK)).toBe('');
	});

	it('are matched against shared people only', async () => {
		const { house, deps } = await synced({ 'anna.vcf': anna() });
		house.add(
			person('p-mine', {
				firstName: 'Anna',
				lastName: 'Muster',
				displayName: 'Anna Muster',
				fields: [{ kind: 'phone', value: '+41 79 111 22 33', label: null }],
				visibility: 'private'
			})
		);

		const [card] = (await prepareBookReview(deps, ADA, BOOK)).cards;
		expect(card).toMatchObject({ kind: 'none', candidates: [] });
	});

	it('answered link their cards, a new person always shared', async () => {
		const { house, apply, sync } = await synced({ 'anna.vcf': anna(), 'bert.vcf': bert() });
		house.add(person('p-anna', { firstName: 'Anna', displayName: 'Anna' }));

		const outcome = await apply({
			anna: { kind: 'same', personId: 'p-anna', takeCard: [] },
			bert: { kind: 'new' }
		});

		expect(outcome).toMatchObject({ added: 1, completed: 1, skipped: 0 });
		expect(house.links.get('anna')).toBe('p-anna');
		const bertId = house.links.get('bert')!;
		expect(house.people.get(bertId)).toMatchObject({
			displayName: 'Bert Beispiel',
			visibility: 'shared'
		});
		expect(house.people.get('p-anna')!.lastName).toBe('Muster');
		expect(await sync()).toMatchObject({ newCards: 0 });
	});

	it('never link a card to a private person', async () => {
		const { house, apply } = await synced({ 'anna.vcf': anna() });
		house.add(person('p-mine', { displayName: 'Anna', visibility: 'private' }));

		await expect(
			apply({ anna: { kind: 'same', personId: 'p-mine', takeCard: [] } })
		).rejects.toThrow(ContactGoneError);
		expect(house.links.has('anna')).toBe(false);
	});

	it('bring their picture to a person who has none, and to a new one', async () => {
		const photo = `PHOTO;ENCODING=b;TYPE=JPEG:${b64(JPEG)}`;
		const { house, apply } = await synced({ 'anna.vcf': anna(photo), 'bert.vcf': bert(photo) });
		house.add(person('p-anna', { displayName: 'Anna' }));

		const outcome = await apply({
			anna: { kind: 'same', personId: 'p-anna', takeCard: [] },
			bert: { kind: 'new' }
		});

		expect(outcome.photos).toBe(2);
		expect(house.files.get(house.people.get('p-anna')!.avatar!.path)).toEqual(JPEG);
		expect(house.people.get(house.links.get('bert')!)!.hasPhoto).toBe(true);
	});

	it('leave a person’s own picture as it is', async () => {
		const photo = `PHOTO;ENCODING=b;TYPE=JPEG:${b64(JPEG)}`;
		const { house, apply } = await synced({ 'anna.vcf': anna(photo) });
		const avatar = { photoId: 'mine', path: 'mine.jpg', mime: 'image/jpeg' };
		house.add(person('p-anna', { displayName: 'Anna', hasPhoto: true, avatar }));

		const outcome = await apply({ anna: { kind: 'same', personId: 'p-anna', takeCard: [] } });

		expect(outcome.photos).toBe(0);
		expect(house.people.get('p-anna')!.avatar).toEqual(avatar);
	});
});
