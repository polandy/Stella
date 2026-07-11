import { describe, expect, it } from 'bun:test';
import type { Clock } from '../../clock';
import type { IdGenerator } from '../../id';
import {
	assignTagByName,
	resolveTagColor,
	type NewTag,
	type Tag,
	type TagRepository
} from './tags';

/*
 * Tags (docs/02 §2.8): household-global labels with a Catppuccin accent colour. Pure colour
 * validation and the find-or-create-then-assign use-case, tested with fakes.
 */

describe('resolveTagColor', () => {
	it('accepts a Catppuccin accent name', () => {
		expect(resolveTagColor('mauve')).toBe('mauve');
	});

	it('defaults when none is given', () => {
		expect(resolveTagColor(undefined)).toBe('blue');
		expect(resolveTagColor('')).toBe('blue');
	});

	it('rejects an unknown colour', () => {
		expect(() => resolveTagColor('chartreuse')).toThrow();
	});
});

const NOW = 1_700_000_000_000;
const clock: Clock = { now: () => NOW };
const idGen = (v: string): IdGenerator => ({ next: () => v });

function fakeRepo(existing: Tag | null = null) {
	const calls: string[] = [];
	let inserted: NewTag | null = null;
	const repo: TagRepository = {
		findByName: async () => existing,
		insert: async (t) => {
			inserted = t;
			calls.push('insert');
		},
		listByHousehold: async () => [],
		assign: async (contactId, tagId) => {
			calls.push(`assign:${contactId}:${tagId}`);
		},
		unassign: async () => {},
		listForContactVisibleTo: async () => [],
		listContactsByTagVisibleTo: async () => []
	};
	return {
		repo,
		calls,
		get inserted() {
			return inserted;
		}
	};
}

const deps = (repo: TagRepository, id = 'tag-1') => ({ tags: repo, ids: idGen(id), clock });

describe('assignTagByName', () => {
	it('creates a new tag then assigns it', async () => {
		const f = fakeRepo(null);
		const id = await assignTagByName(deps(f.repo), 'household-1', 'contact-1', '  Ski Club  ', 'green');
		expect(id).toBe('tag-1');
		expect(f.inserted).toMatchObject({
			id: 'tag-1',
			householdId: 'household-1',
			name: 'Ski Club',
			color: 'green'
		});
		expect(f.calls).toEqual(['insert', 'assign:contact-1:tag-1']);
	});

	it('reuses an existing tag by name (no insert)', async () => {
		const existing: Tag = { id: 'tag-existing', householdId: 'household-1', name: 'Ski Club', color: 'green' };
		const f = fakeRepo(existing);
		const id = await assignTagByName(deps(f.repo), 'household-1', 'contact-1', 'ski club');
		expect(id).toBe('tag-existing');
		expect(f.calls).toEqual(['assign:contact-1:tag-existing']);
	});

	it('rejects a blank name', async () => {
		const f = fakeRepo(null);
		await expect(assignTagByName(deps(f.repo), 'h', 'c', '   ')).rejects.toThrow();
	});

	it('rejects an unknown colour', async () => {
		const f = fakeRepo(null);
		await expect(assignTagByName(deps(f.repo), 'h', 'c', 'Family', 'octarine')).rejects.toThrow();
	});
});
