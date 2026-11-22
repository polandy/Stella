import { beforeEach, describe, expect, it } from 'bun:test';
import { fakeOwnPeople } from '../shared/idea-on-person.fixture';
import { fakeGifts } from './gifts.fixture';
import { markGiftBought } from './bought';
import { addGift, type GiftDeps } from './gifts';
import { listPassedPlanned, listPlanned } from './planned';

/* What *Nachtragen…* on `/gifts` may tick (docs/dev/02 §2.25.14), over an in-memory port. */

const ANDY = { userId: 'andy', householdId: 'h1' };
const VIEWER = { id: 'andy', householdId: 'h1' };

let deps: GiftDeps;
let counter: number;
let now: number;

beforeEach(() => {
	counter = 0;
	now = Date.UTC(2026, 9, 8, 9);
	deps = {
		gifts: fakeGifts(() => ({ value: '2018-03-14', precision: 'full' })),
		ownPeople: fakeOwnPeople(),
		contacts: {
			async findByIdVisibleTo(_viewer, id) {
				return { id, birthDate: '2018-03-14', birthDatePrecision: 'full' } as never;
			}
		},
		ids: { next: () => `gift-${++counter}` },
		clock: { now: () => now }
	};
});

const planned = (title: string, extra: Record<string, unknown>) =>
	addGift(deps, ANDY, {
		contactId: 'hilde',
		state: 'idea',
		title,
		note: null,
		url: null,
		givenOn: null,
		occasion: null,
		visibility: 'shared',
		...extra
	});

describe('listPassedPlanned', () => {
	it('lists the open and bought gifts whose day has come, each with that day', async () => {
		await planned('Sled', { when: { kind: 'christmas_at_age', age: 8 } });
		const { giftId } = await planned('Kite', { when: { kind: 'on_date', on: '2026-12-24' } });
		await markGiftBought(deps, ANDY, { contactId: 'hilde', giftId, bought: true });
		await planned('Bike', { when: { kind: 'at_age', age: 9 } });
		await planned('Now', {});
		await planned('Given', { state: 'given', givenOn: '2026-12-24' });
		// Noted in October; Christmas has passed since.
		now = Date.UTC(2026, 11, 27, 9);
		const listed = await listPassedPlanned(deps, VIEWER);
		expect(listed.map((gift) => [gift.title, gift.on]).sort()).toEqual([
			['Kite', '2026-12-24'],
			['Sled', '2026-12-24']
		]);
		expect(listed[0]).not.toHaveProperty('birth');
	});
});

describe('listPlanned', () => {
	it('lists the open and bought gifts with their day, or null without an occasion', async () => {
		await planned('Sled', { when: { kind: 'christmas_at_age', age: 8 } });
		const { giftId } = await planned('Kite', { when: { kind: 'on_date', on: '2027-06-01' } });
		await markGiftBought(deps, ANDY, { contactId: 'hilde', giftId, bought: true });
		await planned('Now', {});
		await planned('Given', { state: 'given', givenOn: '2026-12-24' });
		const listed = await listPlanned(deps, VIEWER);
		expect(listed.map((gift) => [gift.title, gift.on]).sort()).toEqual([
			['Kite', '2027-06-01'],
			['Now', null],
			['Sled', '2026-12-24']
		]);
	});
});
