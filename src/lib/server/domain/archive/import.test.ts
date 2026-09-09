import { describe, expect, it } from 'bun:test';
import type { Clock } from '../../clock';
import type { IdGenerator } from '../../id';
import type { NewActivityEntry } from '../activity/activity';
import type { MediaStore } from '../media/avatars';
import { serialiseDocument, type HouseholdSnapshot } from './archive';
import { ARCHIVE_FORMAT, ARCHIVE_VERSION, buildArchiveDocument } from './document';
import {
	describeImport,
	importArchive,
	splitArchive,
	type ImportArchiveDeps,
	type RestoreCounts,
	type RestoreRepository,
	type ArchiveWording
} from './import';
import { ArchiveFormatError, type RestorePlan } from './restore';

/** English wording, as the route hands it in an English session. */
const wording: ArchiveWording = {
	restored: (people, household) =>
		`restored ${people === 1 ? '1 person' : `${people} people`} from an archive of ${household}`
};

/*
 * Restoring an archive (docs/02 §2.15). Orchestration over fakes: what the admin is told
 * afterwards, that the images follow the rows rather than the other way round, and that an
 * import leaves the same kind of trail an export does.
 */

const NOW = Date.UTC(2026, 9, 1, 8, 0);
const clock: Clock = { now: () => NOW };
const ids: IdGenerator = { next: () => 'activity-1' };
const utf8 = new TextEncoder();

const snapshot: HouseholdSnapshot = {
	householdName: 'Familie Brunner',
	tables: {
		contact: [
			{ id: 'c-1', display_name: 'Hans Brunner', created_by: 'u-1', visibility: 'shared' }
		],
		photo: [
			{ id: 'p-1', contact_id: 'c-1', journal_entry_id: null, file_path: 'p1.jpg', thumb_path: 't1.jpg', mime: 'image/jpeg', created_by: 'u-1', visibility: 'shared' }
		]
	},
	mediaPaths: ['p1.jpg', 't1.jpg']
};

const documentText = () => serialiseDocument(buildArchiveDocument(snapshot, Date.UTC(2026, 8, 7)));

/** A media store that starts with whatever is handed to it and remembers every write. */
function fakeMedia(present: Record<string, Uint8Array> = {}) {
	const files = new Map(Object.entries(present));
	const store: MediaStore = {
		put: async (key, bytes) => {
			files.set(key, bytes);
			return key;
		},
		read: async (path) => files.get(path) ?? null,
		delete: async (path) => {
			files.delete(path);
		}
	};
	return { store, files };
}

function fakeRestore(counts: RestoreCounts = { contact: { added: 1, skipped: 0 } }) {
	let applied: RestorePlan | null = null;
	let recorded: NewActivityEntry | null = null;
	const repo: RestoreRepository = {
		readTarget: async () => ({ memberIds: ['u-admin'], relationshipTypeIds: [], tags: [] }),
		applyRestore: async (plan) => {
			applied = plan;
			return counts;
		},
		recordImport: async (entry) => {
			recorded = entry;
		}
	};
	return {
		repo,
		get applied() {
			return applied;
		},
		get recorded() {
			return recorded;
		}
	};
}

const actor = { userId: 'u-admin', householdId: 'h-here' };

function depsWith(restore: RestoreRepository, media: MediaStore): ImportArchiveDeps {
	return { restore, media, clock, ids };
}

const archiveFile = (media: Record<string, Uint8Array> = {}) => ({
	documentText: documentText(),
	media: new Map(Object.entries(media))
});

describe('taking the archive apart', () => {
	it('finds the document and the images beside it', () => {
		const file = splitArchive([
			{ name: 'household.yaml', bytes: utf8.encode('format: stella-archive') },
			{ name: 'media/p1.jpg', bytes: new Uint8Array([1]) },
			{ name: 'README.txt', bytes: utf8.encode('ignored') }
		]);
		expect(file.documentText).toBe('format: stella-archive');
		expect([...file.media.keys()]).toEqual(['p1.jpg']);
	});

	it('refuses an archive with no document in it', () => {
		expect(() => splitArchive([{ name: 'media/p1.jpg', bytes: new Uint8Array([1]) }])).toThrow(
			ArchiveFormatError
		);
	});

	it('refuses a media file whose name climbs out of the media directory', () => {
		expect(() =>
			splitArchive([
				{ name: 'household.yaml', bytes: utf8.encode('x') },
				{ name: 'media/../../etc/passwd', bytes: new Uint8Array([1]) }
			])
		).toThrow(ArchiveFormatError);
	});
});

describe('importing', () => {
	it('plans against this household and this admin, not the ones in the file', async () => {
		const restore = fakeRestore();
		const { store } = fakeMedia();
		await importArchive(depsWith(restore.repo, store), actor, archiveFile(), wording);

		const contacts = restore.applied!.tables.find((t) => t.table === 'contact')!.rows;
		expect(contacts[0]).toMatchObject({ household_id: 'h-here', created_by: 'u-admin' });
	});

	it('tells the admin what was written and what was already here', async () => {
		const restore = fakeRestore({ contact: { added: 3, skipped: 2 } });
		const { store } = fakeMedia();
		const report = await importArchive(depsWith(restore.repo, store), actor, archiveFile(), wording);

		expect(report.added.contact).toBe(3);
		expect(report.skipped.contact).toBe(2);
		expect(report.household).toBe('Familie Brunner');
	});

	it('stores the images the household does not have yet', async () => {
		const restore = fakeRestore();
		const { store, files } = fakeMedia();
		const report = await importArchive(
			depsWith(restore.repo, store),
			actor,
			archiveFile({ 'p1.jpg': new Uint8Array([1, 2]), 't1.jpg': new Uint8Array([3]) }),
			wording
		);

		expect(report.media).toEqual({ stored: 2, alreadyThere: 0, missing: 0 });
		expect([...files.get('p1.jpg')!]).toEqual([1, 2]);
	});

	it('leaves an image that is already there untouched', async () => {
		// The rule the rows follow: add what is missing, never overwrite what is here.
		const restore = fakeRestore();
		const { store, files } = fakeMedia({ 'p1.jpg': new Uint8Array([9, 9]) });
		const report = await importArchive(
			depsWith(restore.repo, store),
			actor,
			archiveFile({ 'p1.jpg': new Uint8Array([1, 2]), 't1.jpg': new Uint8Array([3]) }),
			wording
		);

		expect([...files.get('p1.jpg')!]).toEqual([9, 9]);
		expect(report.media).toEqual({ stored: 1, alreadyThere: 1, missing: 0 });
	});

	it('says so when the document names an image the archive did not carry', async () => {
		const restore = fakeRestore();
		const { store } = fakeMedia();
		const report = await importArchive(
			depsWith(restore.repo, store),
			actor,
			archiveFile({ 'p1.jpg': new Uint8Array([1]) }),
			wording
		);

		expect(report.media.missing).toBe(1);
		expect(report.warnings).toContainEqual({ code: 'imagesMissing', count: 1 });
	});

	it('writes the images only after the rows, so a failed restore leaves no files behind', async () => {
		const restore = fakeRestore();
		const failing: RestoreRepository = {
			...restore.repo,
			applyRestore: async () => {
				throw new Error('constraint failed');
			}
		};
		const { store, files } = fakeMedia();

		await expect(
			importArchive(
				depsWith(failing, store),
				actor,
				archiveFile({ 'p1.jpg': new Uint8Array([1]) }),
				wording
			)
		).rejects.toThrow('constraint failed');
		expect(files.size).toBe(0);
	});

	it('leaves the trail the household sees in its stream', async () => {
		const restore = fakeRestore({ contact: { added: 1, skipped: 0 } });
		const { store } = fakeMedia();
		await importArchive(depsWith(restore.repo, store), actor, archiveFile(), wording);

		expect(restore.recorded).toMatchObject({
			action: 'import',
			entityType: 'household',
			householdId: 'h-here',
			actorId: 'u-admin',
			visibility: 'shared',
			createdAt: NOW
		});
		expect(restore.recorded!.summary).toContain('Familie Brunner');
	});

	it('refuses a file that is not a Stella archive before touching anything', async () => {
		const restore = fakeRestore();
		const { store } = fakeMedia();
		await expect(
			importArchive(
				depsWith(restore.repo, store),
				actor,
				{ documentText: 'shopping: [milk, bread]', media: new Map() },
				wording
			)
		).rejects.toThrow(ArchiveFormatError);
		// Positive control: nothing was applied and nothing was logged.
		expect(restore.applied).toBeNull();
		expect(restore.recorded).toBeNull();
	});

	it('reads an archive that is only a header without failing', async () => {
		const restore = fakeRestore({});
		const { store } = fakeMedia();
		const report = await importArchive(
			depsWith(restore.repo, store),
			actor,
			{
				documentText: `format: ${ARCHIVE_FORMAT}\nversion: ${ARCHIVE_VERSION}\nhousehold: Empty\n`,
				media: new Map()
			},
			wording
		);
		expect(report.added).toEqual({});
		expect(report.warnings).toEqual([]);
	});
});

describe('what the log says', () => {
	it('counts the people, because that is what the household recognises', () => {
		expect(describeImport({ contact: 12 }, 'Familie Brunner', wording)).toBe(
			'restored 12 people from an archive of Familie Brunner'
		);
		expect(describeImport({ contact: 1 }, 'H', wording)).toContain('1 person');
	});
});
