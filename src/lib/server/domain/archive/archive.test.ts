import { describe, expect, it } from 'bun:test';
import type { Clock } from '../../clock';
import type { IdGenerator } from '../../id';
import type { NewActivityEntry } from '../activity/activity';
import {
	UnsafeMediaPathError,
	archiveFileName,
	describeExport,
	exportHousehold,
	mediaEntryName,
	type ArchiveRepository,
	type HouseholdSnapshot
} from './archive';

/*
 * Describing the export archive (docs/02 §2.15). Pure orchestration with a fake repository:
 * what goes in the manifest, what the file is called, which media paths the archive refuses to
 * carry, and that an export leaves a trail the household can see.
 */

const NOW = Date.UTC(2026, 8, 7, 9, 30); // 2026-09-07
const clock: Clock = { now: () => NOW };
const ids: IdGenerator = { next: () => 'activity-1' };

function snapshot(over: Partial<HouseholdSnapshot> = {}): HouseholdSnapshot {
	return {
		householdName: 'Familie Brunner',
		tables: {
			contact: [{ id: 'c-1' }, { id: 'c-2' }],
			note: [{ id: 'n-1', contact_id: 'c-1' }],
			tag: []
		},
		mediaPaths: ['photo-1.jpg', 'photo-1-thumb.jpg'],
		...over
	};
}

function fakeRepo(s: HouseholdSnapshot = snapshot()) {
	let recorded: NewActivityEntry | null = null;
	const repo: ArchiveRepository = {
		readHousehold: async () => s,
		recordExport: async (entry) => {
			recorded = entry;
		}
	};
	return {
		repo,
		get recorded() {
			return recorded;
		}
	};
}

const actor = { userId: 'user-1', householdId: 'household-1' };

describe('entry names', () => {
	it('puts a media file under media/, beside the document', () => {
		expect(mediaEntryName('photo-1.jpg')).toBe('media/photo-1.jpg');
	});

	it('keeps a nested media key nested', () => {
		expect(mediaEntryName('2026/photo-1.jpg')).toBe('media/2026/photo-1.jpg');
	});

	it.each([
		['climbing out with ..', '../../etc/passwd'],
		['climbing out mid-path', 'photos/../../secret.jpg'],
		['absolute', '/etc/passwd'],
		['a backslash, which some readers treat as a separator', 'photos\\evil.jpg'],
		['a bare dot segment', './photo.jpg'],
		['an empty segment', 'photos//photo.jpg'],
		['empty', '']
	])('refuses a media path %s rather than sanitising it', (_why, path) => {
		expect(() => mediaEntryName(path)).toThrow(UnsafeMediaPathError);
	});
});

describe('archiveFileName', () => {
	it('is named for the household and the day it was taken', () => {
		expect(archiveFileName('Familie Brunner', NOW)).toBe('stella-familie-brunner-2026-09-07.tar');
	});

	it('survives a household name a filesystem would not', () => {
		expect(archiveFileName('Müller / Häuser ☂', NOW)).toBe('stella-muller-hauser-2026-09-07.tar');
	});

	it('falls back rather than producing a nameless file', () => {
		expect(archiveFileName('☂☂☂', NOW)).toBe('stella-household-2026-09-07.tar');
	});
});

describe('describeExport', () => {
	it('says how many people went into the archive', () => {
		expect(describeExport({ contact: 12 })).toBe('exported the household archive (12 people)');
		expect(describeExport({ contact: 1 })).toBe('exported the household archive (1 person)');
	});

	it('says none rather than undefined when nothing was there', () => {
		expect(describeExport({})).toBe('exported the household archive (0 people)');
	});
});

describe('exportHousehold', () => {
	it('describes the archive and names the file', async () => {
		const f = fakeRepo();
		const result = await exportHousehold({ archive: f.repo, clock, ids }, actor);
		expect(result.fileName).toBe('stella-familie-brunner-2026-09-07.tar');
		expect(result.document.counts.contact).toBe(2);
		expect(result.mediaPaths).toEqual(['photo-1.jpg', 'photo-1-thumb.jpg']);
	});

	it('leaves a trail the whole household can see', async () => {
		const f = fakeRepo();
		await exportHousehold({ archive: f.repo, clock, ids }, actor);
		expect(f.recorded).toEqual({
			id: 'activity-1',
			householdId: 'household-1',
			actorId: 'user-1',
			action: 'export',
			entityType: 'household',
			entityId: 'household-1',
			contactId: null,
			visibility: 'shared',
			summary: 'exported the household archive (2 people)',
			createdAt: NOW
		});
	});
});
