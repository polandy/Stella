import { describe, expect, it } from 'bun:test';
import type { Clock } from '../../clock';
import type { IdGenerator } from '../../id';
import {
	deleteInteraction,
	InvalidInteractionError,
	lastContactedAt,
	logInteraction,
	type Interaction,
	type InteractionAuthor,
	type InteractionRepository,
	type NewInteraction
} from './interactions';

/*
 * Interactions (docs/02 §2.6). The use-case is thin orchestration, so the tests pin what it
 * decides: normalisation, the visibility default, every refused input, and the pure
 * "last contacted" rule the profile header shows.
 */

const NOW = 1_700_000_000_000;
const clock: Clock = { now: () => NOW };
const ids: IdGenerator = { next: () => 'int-1' };
const author: InteractionAuthor = {
	userId: 'u1',
	householdId: 'h1',
	defaultVisibility: 'shared'
};

function fakeRepo() {
	let inserted: NewInteraction | null = null;
	const deleted: { authorId: string; id: string }[] = [];
	const repo: InteractionRepository = {
		insert: async (i) => {
			inserted = i;
		},
		listForContactVisibleTo: async () => [],
		deleteOwn: async (params) => {
			deleted.push(params);
			return true;
		}
	};
	return {
		repo,
		deleted,
		get inserted() {
			return inserted;
		}
	};
}

const deps = (repo: InteractionRepository) => ({ interactions: repo, ids, clock });

describe('logInteraction', () => {
	it('stores a call with trimmed text, the author and the household default visibility', async () => {
		const f = fakeRepo();
		const id = await logInteraction(deps(f.repo), author, {
			contactId: 'c1',
			kind: 'call',
			happenedAt: '2026-08-30',
			title: '  Sunday call  ',
			description: '  talked about the move  '
		});
		expect(id).toBe('int-1');
		expect(f.inserted).toEqual({
			id: 'int-1',
			contactId: 'c1',
			createdBy: 'u1',
			visibility: 'shared',
			kind: 'call',
			happenedAt: '2026-08-30',
			title: 'Sunday call',
			description: 'talked about the move',
			participantIds: [],
			createdAt: NOW,
			updatedAt: NOW
		});
	});

	it('turns empty title and description into null', async () => {
		const f = fakeRepo();
		await logInteraction(deps(f.repo), author, {
			contactId: 'c1',
			kind: 'met',
			happenedAt: '2026-08-30',
			title: '   ',
			description: ''
		});
		expect(f.inserted).toMatchObject({ title: null, description: null });
	});

	it('keeps an explicit private visibility over the author default', async () => {
		const f = fakeRepo();
		await logInteraction(deps(f.repo), author, {
			contactId: 'c1',
			kind: 'gift',
			happenedAt: '2026-08-30',
			visibility: 'private'
		});
		expect(f.inserted?.visibility).toBe('private');
	});

	it('de-duplicates participants and keeps their order', async () => {
		const f = fakeRepo();
		await logInteraction(deps(f.repo), author, {
			contactId: 'c1',
			kind: 'met',
			happenedAt: '2026-08-30',
			participantIds: ['c3', 'c2', 'c3']
		});
		expect(f.inserted?.participantIds).toEqual(['c3', 'c2']);
	});

	it('refuses the subject contact as a participant of their own interaction', async () => {
		const f = fakeRepo();
		await expect(
			logInteraction(deps(f.repo), author, {
				contactId: 'c1',
				kind: 'met',
				happenedAt: '2026-08-30',
				participantIds: ['c2', 'c1']
			})
		).rejects.toBeInstanceOf(InvalidInteractionError);
		expect(f.inserted).toBeNull();
	});

	it('refuses an unknown kind', async () => {
		const f = fakeRepo();
		await expect(
			logInteraction(deps(f.repo), author, {
				contactId: 'c1',
				// deliberately outside the union: the form posts a string
				kind: 'telepathy' as never,
				happenedAt: '2026-08-30'
			})
		).rejects.toBeInstanceOf(InvalidInteractionError);
		expect(f.inserted).toBeNull();
	});

	it.each(['30.08.2026', '2026-8-30', '2026-02-30', '', '--08-30'])(
		'refuses the date %p',
		async (happenedAt) => {
			const f = fakeRepo();
			await expect(
				logInteraction(deps(f.repo), author, { contactId: 'c1', kind: 'met', happenedAt })
			).rejects.toBeInstanceOf(InvalidInteractionError);
			expect(f.inserted).toBeNull();
		}
	);
});

describe('deleteInteraction', () => {
	it('only ever deletes as the author', async () => {
		const f = fakeRepo();
		const removed = await deleteInteraction(deps(f.repo), author, 'int-9');
		expect(removed).toBe(true);
		expect(f.deleted).toEqual([{ authorId: 'u1', id: 'int-9' }]);
	});
});

describe('lastContactedAt', () => {
	const at = (happenedAt: string): Pick<Interaction, 'happenedAt'> => ({ happenedAt });

	it('is null when nothing was logged', () => {
		expect(lastContactedAt([])).toBeNull();
	});

	it('is the most recent day regardless of list order', () => {
		expect(lastContactedAt([at('2026-01-05'), at('2026-08-30'), at('2026-03-01')])).toBe(
			'2026-08-30'
		);
	});
});
