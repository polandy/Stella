import { describe, expect, it } from 'bun:test';
import type { Viewer } from '../../access/visibility';
import { fixedClock, sequentialIds } from '../testing';
import { answerConflict, type ConflictAnswer } from './conflicts';
import { anna, b64, cardOf, JPEG, linkedAnna, wording } from '../testing/nextcloud-book';

/*
 * Answering what a linked card said otherwise (docs/02 §2.16.3): Stella's side stays, or the
 * card's is taken; either way the conflict is gone and the person is in step with the card at
 * the next sync.
 */

const BERT: Viewer = { id: 'u-bert', householdId: 'h1' };

async function waitingOn(
	change: (world: Awaited<ReturnType<typeof linkedAnna>>) => void,
	over: Parameters<typeof linkedAnna>[0] = {}
) {
	const world = await linkedAnna(over);
	change(world);
	await world.sync();
	const { house } = world;
	const answer = (take: ConflictAnswer['take'], kind: ConflictAnswer['kind'] = 'lastName') =>
		answerConflict(
			{
				store: house.store,
				writer: house.writer,
				setAvatar: house.setAvatar,
				clock: fixedClock(2_000),
				ids: sequentialIds()
			},
			{ viewer: BERT, contactId: 'p-anna', kind, take, wording, locale: 'en' }
		);
	return { ...world, answer };
}

const renamed = ({ book }: Awaited<ReturnType<typeof linkedAnna>>) =>
	book.phone.save('anna.vcf', anna().replace('N:Muster;Anna;;;', 'N:Meier;Anna;;;'));

describe('a conflict answered', () => {
	it('keeping Stella’s writes Stella’s onto the card', async () => {
		const { house, book, sync, answer } = await waitingOn(renamed);
		expect(house.conflicts).toHaveLength(1);

		expect(await answer('stella')).toBe(true);
		expect(house.conflicts).toEqual([]);
		expect(await sync()).toMatchObject({ written: 1 });
		expect(cardOf(book, 'anna')).toContain('N:Muster;Anna;;;');
		expect(house.people.get('p-anna')!.lastName).toBe('Muster');
	});

	it('taking the card’s name sets it, and the card needs nothing more', async () => {
		const { house, sync, answer } = await waitingOn(renamed);

		expect(await answer('card')).toBe(true);
		expect(house.people.get('p-anna')!).toMatchObject({
			lastName: 'Meier',
			displayName: 'Anna Meier'
		});
		expect(house.conflicts).toEqual([]);
		expect(house.audits.at(-1)).toMatchObject({
			actorId: BERT.id,
			event: { kind: 'contacts.reviewed', completed: 1 }
		});
		expect(await sync()).toMatchObject({ written: 0 });
	});

	it('taking the card’s birthday sets it', async () => {
		const { house, answer } = await waitingOn(
			({ book }) => book.phone.save('anna.vcf', anna('BDAY:1950-04-08')),
			{ birthday: { value: '1950-04-07', precision: 'full' } }
		);

		expect(await answer('card', 'birthday')).toBe(true);
		expect(house.people.get('p-anna')!.birthday).toEqual({
			value: '1950-04-08',
			precision: 'full'
		});
	});

	it('taking the card’s picture makes it the person’s photo', async () => {
		const { house, answer } = await waitingOn(
			({ book, house }) => {
				house.files.set('mine.jpg', new Uint8Array([...JPEG, 1]));
				book.phone.save('anna.vcf', anna(`PHOTO;ENCODING=b;TYPE=JPEG:${b64(JPEG)}`));
			},
			{ hasPhoto: true, avatar: { photoId: 'mine', path: 'mine.jpg', mime: 'image/jpeg' } }
		);
		expect(house.conflicts.map((c) => c.conflict.kind)).toEqual(['photo']);

		expect(await answer('card', 'photo')).toBe(true);
		const avatar = house.people.get('p-anna')!.avatar!;
		expect(house.files.get(avatar.path)).toEqual(JPEG);
		expect(house.conflicts).toEqual([]);
	});

	it('twice is answered once', async () => {
		const { house, answer } = await waitingOn(renamed);
		await answer('stella');

		expect(await answer('card')).toBe(false);
		expect(house.people.get('p-anna')!.lastName).toBe('Muster');
	});

	it('about someone made private meanwhile is not answered', async () => {
		const { house, answer } = await waitingOn(renamed);
		house.people.get('p-anna')!.visibility = 'private';

		expect(await answer('card')).toBe(false);
		expect(house.people.get('p-anna')!.lastName).toBe('Muster');
	});
});
