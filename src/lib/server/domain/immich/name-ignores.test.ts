import { describe, expect, it } from 'bun:test';
import { ImmichLinkRefusedError } from './links';
import {
	ignoreNewcomer,
	proposeNewcomerAgain,
	type ImmichNameIgnore,
	type ImmichNameIgnoreRepository
} from './name-ignores';
import { BERT_ID, CARL_ID } from './test-library';

/*
 * Ignoring a face of *New from Immich* (docs/02 §2.24.7): there is no contact to hang it on, so it
 * is the household's — kept with who said so and when, and any member may propose it again.
 */

const actor = { userId: 'u-anna', householdId: 'h1' };
const NOW = 1_700_000_000_000;

function setup() {
	const rows: ImmichNameIgnore[] = [];
	const nameIgnores: ImmichNameIgnoreRepository = {
		listForHousehold: async (viewer) =>
			rows.filter((row) => row.householdId === viewer.householdId),
		save: async (row) => {
			if (
				!rows.some(
					(r) => r.householdId === row.householdId && r.immichPersonId === row.immichPersonId
				)
			)
				rows.push(row);
		},
		remove: async (viewer, personId) => {
			const at = rows.findIndex(
				(r) => r.householdId === viewer.householdId && r.immichPersonId === personId
			);
			if (at < 0) return false;
			rows.splice(at, 1);
			return true;
		}
	};
	return { rows, deps: { nameIgnores, clock: { now: () => NOW } } };
}

describe('ignoreNewcomer', () => {
	it('keeps the face for the household, with who ignored it and when', async () => {
		const { deps, rows } = setup();
		await ignoreNewcomer(deps, actor, BERT_ID);
		expect(rows).toEqual([
			{ householdId: 'h1', immichPersonId: BERT_ID, ignoredBy: 'u-anna', ignoredAt: NOW }
		]);
	});

	it('refuses something that is not an Immich id, and keeps nothing', async () => {
		const { deps, rows } = setup();
		await expect(ignoreNewcomer(deps, actor, '../people')).rejects.toBeInstanceOf(
			ImmichLinkRefusedError
		);
		expect(rows).toEqual([]);
	});
});

describe('proposeNewcomerAgain', () => {
	it('forgets the ignored face, and says whether there was one', async () => {
		const { deps, rows } = setup();
		await ignoreNewcomer(deps, actor, BERT_ID);
		await ignoreNewcomer(deps, actor, CARL_ID);

		expect(await proposeNewcomerAgain(deps, { id: 'u-bert', householdId: 'h1' }, BERT_ID)).toBe(
			true
		);
		expect(rows.map((r) => r.immichPersonId)).toEqual([CARL_ID]);
		expect(await proposeNewcomerAgain(deps, { id: 'u-bert', householdId: 'h1' }, BERT_ID)).toBe(
			false
		);
	});
});
