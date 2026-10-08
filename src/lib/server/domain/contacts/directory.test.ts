import { describe, expect, it } from 'bun:test';
import { isKnownByAFirstNameOnly } from '../../../people/namesakes';
import { inMemoryContactDirectory, somebody } from '../testing';
import type { ContactDirectoryReads } from './directory';
import {
	countArchivedContacts,
	countKnownByAFirstNameOnly,
	listArchivedContacts,
	listContacts,
	listPeopleEnoughForFirstRun
} from './directory';

/*
 * The people lists (docs/02 §2.2): what each screen asks the directory read model, over the
 * shared in-memory fake. Which people the viewer may see is the adapter's, covered against
 * SQLite in `db/contact-reads.test.ts`.
 */

const viewer = { id: 'u', householdId: 'h' };

describe('the directory and the archive', () => {
	const deps = {
		directory: inMemoryContactDirectory([
			somebody('ben', 'Ben'),
			somebody('anna', 'Anna'),
			somebody('old', 'Otto', { archived: true })
		])
	};

	it('lists the browsable people, and the archived ones only in the archive', async () => {
		expect((await listContacts(deps, viewer)).map((p) => p.id)).toEqual(['anna', 'ben']);
		expect((await listArchivedContacts(deps, viewer)).map((p) => p.id)).toEqual(['old']);
		expect(await countArchivedContacts(deps, viewer)).toBe(1);
	});
});

describe('countKnownByAFirstNameOnly', () => {
	it('counts by the same rule the clean-up list gathers people by', async () => {
		const people = [
			somebody('anna', 'Anna'),
			somebody('ben', 'Ben', { lastName: 'Brunner' }),
			somebody('carla', 'Carla Huber'),
			somebody('dora', 'Dora', { description: 'from the choir' }),
			somebody('emil', 'Emil', { metPlace: 'Bern' }),
			somebody('fritz', ' Fritz ')
		];
		const directory = inMemoryContactDirectory(people);

		expect(await countKnownByAFirstNameOnly({ directory }, viewer)).toBe(2);
		const rows = await directory.listDistinguishableVisibleTo(viewer);
		expect(
			rows
				.filter(isKnownByAFirstNameOnly)
				.map((r) => r.id)
				.sort()
		).toEqual(['anna', 'fritz']);
	});
});

/*
 * Home's first-run card (docs/02 §2.22.3) only needs to know whether the household holds
 * anybody besides the member's own record, so it must not read the whole household to learn it.
 */
describe('listPeopleEnoughForFirstRun', () => {
	it('asks for two browsable ids: one more than the self record can ever be', async () => {
		const limits: number[] = [];
		const fake = inMemoryContactDirectory([
			somebody('self', 'Me'),
			somebody('anna', 'Anna'),
			somebody('ben', 'Ben')
		]);
		const directory: ContactDirectoryReads = {
			...fake,
			listSomeBrowsableIdsVisibleTo: async (asker, limit) => {
				limits.push(limit);
				return fake.listSomeBrowsableIdsVisibleTo(asker, limit);
			}
		};

		expect(await listPeopleEnoughForFirstRun({ directory }, viewer)).toHaveLength(2);
		expect(limits).toEqual([2]);
	});
});
