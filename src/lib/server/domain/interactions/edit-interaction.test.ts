import { beforeEach, describe, expect, it } from 'bun:test';
import { eq } from 'drizzle-orm';
import { createDrizzleContactNameReads } from '../../db/contact-name-reads';
import { createDrizzleInteractionRepository } from '../../db/interaction-repository';
import * as schema from '../../db/schema';
import { fixedClock } from '../testing';
import {
	ADMIN,
	AUTHOR,
	FOREIGN_ADMIN,
	H,
	H2,
	MEMBER,
	removalDb,
	type RemovalDb
} from '../testing/removal-db';
import { editInteraction, type EditInteractionInput } from './edit-interaction';
import { InvalidInteractionError } from './interactions';

/*
 * Editing a touchpoint (docs/02 §2.6, docs/03 §3.7): its author alone — an admin removes another
 * member's, never rewrites it. Wired to the real adapter: the rule, and which participants an
 * edit may touch, live in its SQL.
 */

const NOW = 1_760_000_000_000;
const EARLIER = 1_700_000_000_000;

const nina = { userId: AUTHOR, householdId: H };
const andy = { userId: ADMIN, householdId: H };
const mia = { userId: MEMBER, householdId: H };
const foreign = { userId: FOREIGN_ADMIN, householdId: H2 };

let t: RemovalDb;
let deps: Parameters<typeof editInteraction>[0];

function addInteraction(id: string, over: Partial<typeof schema.interaction.$inferInsert> = {}) {
	t.db
		.insert(schema.interaction)
		.values({
			id,
			contactId: 'c-kurt',
			createdBy: AUTHOR,
			visibility: 'shared',
			kind: 'met',
			happenedAt: '2026-10-08',
			title: 'Coffee',
			description: 'At the lake',
			createdAt: EARLIER,
			updatedAt: EARLIER,
			...over
		})
		.run();
}

function addParticipants(interactionId: string, ...contactIds: string[]) {
	t.db
		.insert(schema.interactionParticipant)
		.values(contactIds.map((contactId) => ({ interactionId, contactId })))
		.run();
}

const row = (id: string) =>
	t.db.select().from(schema.interaction).where(eq(schema.interaction.id, id)).get();
const participantsOf = (id: string) =>
	t.db
		.select({ contactId: schema.interactionParticipant.contactId })
		.from(schema.interactionParticipant)
		.where(eq(schema.interactionParticipant.interactionId, id))
		.all()
		.map((r) => r.contactId)
		.sort();

const edit = (over: Partial<EditInteractionInput> = {}): EditInteractionInput => ({
	id: 'i-1',
	kind: 'call',
	happenedAt: '2026-10-09',
	title: 'Phoned',
	description: 'About the move',
	participantIds: [],
	...over
});

beforeEach(() => {
	t = removalDb();
	t.db
		.insert(schema.contact)
		.values({
			id: 'c-gone',
			householdId: H,
			createdBy: ADMIN,
			visibility: 'shared',
			displayName: 'Gone',
			archivedAt: EARLIER
		})
		.run();
	deps = {
		interactions: createDrizzleInteractionRepository(t.db),
		contactNames: createDrizzleContactNameReads(t.db),
		clock: fixedClock(NOW)
	};
});

describe('editInteraction: who may', () => {
	it('lets the author rewrite day, kind and text, keeping who sees it', async () => {
		addInteraction('i-1');

		expect(await editInteraction(deps, nina, edit())).toBe(true);

		expect(row('i-1')).toMatchObject({
			kind: 'call',
			happenedAt: '2026-10-09',
			title: 'Phoned',
			description: 'About the move',
			visibility: 'shared',
			createdBy: AUTHOR,
			createdAt: EARLIER,
			updatedAt: NOW
		});
	});

	it('lets the author edit their private touchpoint, which stays private', async () => {
		addInteraction('i-1', { visibility: 'private' });
		expect(await editInteraction(deps, nina, edit())).toBe(true);
		expect(row('i-1')).toMatchObject({ visibility: 'private', kind: 'call' });
	});

	it("refuses an admin on another member's shared touchpoint, though they may remove it", async () => {
		addInteraction('i-1');
		addInteraction('i-andys', { createdBy: ADMIN });

		expect(await editInteraction(deps, andy, edit())).toBe(false);
		expect(await editInteraction(deps, andy, edit({ id: 'i-andys' }))).toBe(true);
		expect(row('i-1')).toMatchObject({ kind: 'met', title: 'Coffee', updatedAt: EARLIER });
	});

	it("refuses a member on someone else's shared touchpoint", async () => {
		addInteraction('i-1');
		addInteraction('i-mias', { createdBy: MEMBER });

		expect(await editInteraction(deps, mia, edit())).toBe(false);
		expect(await editInteraction(deps, mia, edit({ id: 'i-mias' }))).toBe(true);
		expect(row('i-1')).toMatchObject({ title: 'Coffee' });
	});

	it('refuses a user of another household', async () => {
		addInteraction('i-1');
		expect(await editInteraction(deps, foreign, edit())).toBe(false);
		expect(row('i-1')).toMatchObject({ title: 'Coffee' });
	});

	it('refuses the author once the person is private to someone else', async () => {
		addInteraction('i-on-secret', { contactId: 'c-secret' });
		addInteraction('i-1');

		expect(await editInteraction(deps, nina, edit({ id: 'i-on-secret' }))).toBe(false);
		expect(await editInteraction(deps, nina, edit())).toBe(true);
		expect(row('i-on-secret')).toMatchObject({ title: 'Coffee' });
	});

	it('answers a touchpoint that is gone like one the editor may not touch', async () => {
		expect(await editInteraction(deps, nina, edit({ id: 'i-never' }))).toBe(false);
	});

	it('tells the household nothing', async () => {
		addInteraction('i-1');
		await editInteraction(deps, nina, edit());
		expect(t.db.select().from(schema.activityLog).all()).toEqual([]);
	});

	it('clears an emptied title or description', async () => {
		addInteraction('i-1');
		await editInteraction(deps, nina, edit({ title: '  ', description: null }));
		expect(row('i-1')).toMatchObject({ title: null, description: null });
	});
});

describe('editInteraction: what it refuses', () => {
	beforeEach(() => addInteraction('i-1'));

	const refused: [string, Partial<EditInteractionInput>][] = [
		['an unknown kind', { kind: 'telepathy' as EditInteractionInput['kind'] }],
		['a day not shaped YYYY-MM-DD', { happenedAt: '9.10.2026' }],
		['a day the calendar lacks', { happenedAt: '2026-02-30' }],
		['the person as their own participant', { participantIds: ['c-kurt'] }],
		['a participant who does not exist', { participantIds: ['c-nobody'] }],
		['a participant the author may not see', { participantIds: ['c-secret'] }],
		['a newly named archived participant', { participantIds: ['c-gone'] }]
	];

	for (const [what, over] of refused) {
		it(`refuses ${what}, and changes nothing`, async () => {
			await expect(editInteraction(deps, nina, edit(over))).rejects.toBeInstanceOf(
				InvalidInteractionError
			);
			expect(row('i-1')).toMatchObject({ kind: 'met', title: 'Coffee', updatedAt: EARLIER });
			expect(participantsOf('i-1')).toEqual([]);
		});
	}
});

describe('editInteraction: who took part', () => {
	it('replaces the participants the author chose', async () => {
		addInteraction('i-1');
		addParticipants('i-1', 'c-lea');

		await editInteraction(deps, nina, edit({ participantIds: [] }));
		expect(participantsOf('i-1')).toEqual([]);

		await editInteraction(deps, nina, edit({ participantIds: ['c-lea', 'c-lea'] }));
		expect(participantsOf('i-1')).toEqual(['c-lea']);
	});

	it('keeps a participant the author cannot see, which the editor never showed them', async () => {
		addInteraction('i-1');
		addParticipants('i-1', 'c-lea', 'c-secret');

		await editInteraction(deps, nina, edit({ participantIds: [] }));

		expect(participantsOf('i-1')).toEqual(['c-secret']);
	});

	it('keeps an archived participant already on it, and lets the author take them off', async () => {
		addInteraction('i-1');
		addParticipants('i-1', 'c-gone');

		await editInteraction(deps, nina, edit({ participantIds: ['c-gone', 'c-lea'] }));
		expect(participantsOf('i-1')).toEqual(['c-gone', 'c-lea']);

		await editInteraction(deps, nina, edit({ participantIds: ['c-lea'] }));
		expect(participantsOf('i-1')).toEqual(['c-lea']);
	});

	it('leaves the participants alone when it refuses the editor', async () => {
		addInteraction('i-1');
		addParticipants('i-1', 'c-lea');

		expect(await editInteraction(deps, andy, edit({ participantIds: [] }))).toBe(false);
		expect(participantsOf('i-1')).toEqual(['c-lea']);
	});
});

describe('editInteraction: a hidden participant stays unknown', () => {
	it('refuses naming one the author cannot see, whether or not they are on it', async () => {
		addInteraction('i-1');
		addParticipants('i-1', 'c-secret');
		addInteraction('i-2');

		for (const id of ['i-1', 'i-2']) {
			await expect(
				editInteraction(deps, nina, edit({ id, participantIds: ['c-secret'] }))
			).rejects.toBeInstanceOf(InvalidInteractionError);
		}
		expect(participantsOf('i-1')).toEqual(['c-secret']);
	});
});
