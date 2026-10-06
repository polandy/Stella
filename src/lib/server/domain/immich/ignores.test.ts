import { describe, expect, it } from 'bun:test';
import { ContactGoneError } from '../contacts/require-visible';
import {
	ignoreMatch,
	proposeAgain,
	type ImmichIgnore,
	type ImmichIgnoreRepository
} from './ignores';
import { ImmichLinkRefusedError, type LinkVisibleContacts } from './links';
import { BERT_ID, CARL_ID } from './test-library';

/*
 * Ignoring a proposal of *Find your people* (docs/concepts/immich.md §9, docs/02 §2.24.7): the
 * pair is kept with who said so and when, never proposed again, and anyone who sees the contact
 * may take it back.
 */

const actor = { userId: 'u-anna', householdId: 'h1' };
const viewer = { id: 'u-anna', householdId: 'h1' };
const NOW = 1_700_000_000_000;

const contacts: LinkVisibleContacts = {
	findByIdVisibleTo: async (_viewer, id) =>
		id === 'c-bert' ? { displayName: 'Bert Example', visibility: 'shared' } : null
};

/** Ignores in memory; `visible` is what the access layer would let the viewer see. */
function memoryIgnores(visible = new Set(['c-bert'])) {
	const rows: ImmichIgnore[] = [];
	const ignores: ImmichIgnoreRepository = {
		listVisibleTo: async () => rows.filter((row) => visible.has(row.contactId)),
		save: async (added) => {
			for (const row of added)
				if (
					!rows.some(
						(r) => r.contactId === row.contactId && r.immichPersonId === row.immichPersonId
					)
				)
					rows.push(row);
		},
		remove: async (_viewer, contactId, personId) => {
			const at = rows.findIndex(
				(r) => visible.has(contactId) && r.contactId === contactId && r.immichPersonId === personId
			);
			if (at < 0) return false;
			rows.splice(at, 1);
			return true;
		}
	};
	return { ignores, rows };
}

function setup() {
	const memory = memoryIgnores();
	return { ...memory, deps: { ignores: memory.ignores, contacts, clock: { now: () => NOW } } };
}

describe('ignoreMatch', () => {
	it('keeps each face of the row as a pair, with who ignored it and when', async () => {
		const { deps, rows } = setup();

		await ignoreMatch(deps, actor, 'c-bert', [BERT_ID, CARL_ID]);

		expect(rows).toEqual([
			{ contactId: 'c-bert', immichPersonId: BERT_ID, ignoredBy: 'u-anna', ignoredAt: NOW },
			{ contactId: 'c-bert', immichPersonId: CARL_ID, ignoredBy: 'u-anna', ignoredAt: NOW }
		]);
	});

	it('refuses a contact the member cannot see', async () => {
		const { deps, rows } = setup();

		await expect(ignoreMatch(deps, actor, 'c-private', [BERT_ID])).rejects.toBeInstanceOf(
			ContactGoneError
		);
		expect(rows).toEqual([]);
	});

	it('refuses anything that is not an Immich id, and an empty row', async () => {
		const { deps, rows } = setup();

		await expect(
			ignoreMatch(deps, actor, 'c-bert', [BERT_ID, '../users/me'])
		).rejects.toBeInstanceOf(ImmichLinkRefusedError);
		await expect(ignoreMatch(deps, actor, 'c-bert', [])).rejects.toBeInstanceOf(
			ImmichLinkRefusedError
		);
		expect(rows).toEqual([]);
	});
});

describe('proposeAgain', () => {
	it('removes the record, so the pair can be proposed again', async () => {
		const { deps, rows } = setup();
		await ignoreMatch(deps, actor, 'c-bert', [BERT_ID]);

		expect(await proposeAgain(deps, viewer, 'c-bert', BERT_ID)).toBe(true);
		expect(rows).toEqual([]);
	});

	it('takes nothing back for a contact the member cannot see', async () => {
		const memory = memoryIgnores(new Set());
		memory.rows.push({
			contactId: 'c-private',
			immichPersonId: BERT_ID,
			ignoredBy: 'u-other',
			ignoredAt: 1
		});

		expect(await proposeAgain({ ignores: memory.ignores }, viewer, 'c-private', BERT_ID)).toBe(
			false
		);
		expect(memory.rows).toHaveLength(1);
	});
});
