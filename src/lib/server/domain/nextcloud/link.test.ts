import { describe, expect, it } from 'bun:test';
import { fixedClock, sequentialIds } from '../testing';
import { anna, vcf, wording } from '../testing/nextcloud-book';
import { BOOK, person, SYSTEM, testHousehold } from '../testing/nextcloud-household';
import { createFakeAddressBook } from '../../nextcloud/fake-gateway';
import { createNextcloudLink, FAILURE_RETRY_MS, SYNC_ON_OPEN_INTERVAL_MS } from './link';

/*
 * The household's link to its Nextcloud book (docs/02 §2.16.3): synced by *Sync now* and on
 * opening Stella — the latter at most every few minutes, sooner again after a failure — never
 * twice at once, and always as the Nextcloud actor.
 */

const H = SYSTEM.householdId;
const ADA = { id: 'u-ada', householdId: H };

function world() {
	const house = testHousehold();
	const book = createFakeAddressBook({ 'anna.vcf': anna() });
	const clock = fixedClock(10_000_000);
	let actorsMade = 0;
	const link = createNextcloudLink({
		book,
		store: house.store,
		sources: house.sources,
		writer: house.writer,
		media: house.media,
		setAvatar: house.setAvatar,
		clock,
		ids: sequentialIds(),
		actors: {
			nextcloud: async () => {
				actorsMade++;
				return SYSTEM;
			}
		},
		source: BOOK
	});
	const request = { wording, locale: 'en' as const };
	return { house, book, clock, link, request, actors: () => actorsMade };
}

describe('the Nextcloud link', () => {
	it('syncs as the Nextcloud actor and says what is waiting', async () => {
		const { house, link, request, actors } = world();

		expect(await link.status(ADA)).toEqual({
			source: BOOK,
			syncedAt: null,
			failing: false,
			newCards: 0,
			conflicts: 0
		});
		expect(await link.sync(H, request)).toMatchObject({ ok: true, outcome: { newCards: 1 } });
		expect(actors()).toBe(1);
		expect(await link.status(ADA)).toMatchObject({ syncedAt: 10_000_000, newCards: 1 });
		house.links.set('anna', null);
		expect((await link.status(ADA)).newCards).toBe(0);
	});

	it('joins a sync already running instead of starting another', async () => {
		const { book, link, request } = world();
		const first = link.sync(H, request);
		const second = link.sync(H, request);

		expect(second).toBe(first);
		await first;
		book.phone.save('bert.vcf', vcf('bert', 'FN:Bert'));
		expect(await link.sync(H, request)).toMatchObject({ outcome: { newCards: 2 } });
	});

	it('on opening, syncs only when the last sync is a while ago', async () => {
		const { clock, link, request } = world();

		expect(await link.syncIfDue(H, request)).toMatchObject({ ok: true });
		clock.advance(SYNC_ON_OPEN_INTERVAL_MS - 1);
		expect(await link.syncIfDue(H, request)).toBeNull();
		clock.advance(1);
		expect(await link.syncIfDue(H, request)).toMatchObject({ ok: true });
	});

	it('says a book it could not reach, tries again soon on opening, and recovers', async () => {
		const { book, clock, link, request } = world();
		book.setUnreachable(true);

		expect(await link.syncIfDue(H, request)).toEqual({ ok: false });
		expect((await link.status(ADA)).failing).toBe(true);
		clock.advance(FAILURE_RETRY_MS - 1);
		expect(await link.syncIfDue(H, request)).toBeNull();
		book.setUnreachable(false);
		clock.advance(1);
		expect(await link.syncIfDue(H, request)).toMatchObject({ ok: true });
		expect((await link.status(ADA)).failing).toBe(false);
	});

	it('counts the conflicts waiting for the member', async () => {
		const { house, link } = world();
		house.add(person('p-anna'));
		await house.store.putConflicts(H, BOOK, 'p-anna', [{ kind: 'photo' }], 1);

		expect((await link.status(ADA)).conflicts).toBe(1);
	});
});
