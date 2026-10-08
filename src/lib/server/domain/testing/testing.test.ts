import { describe, expect, it } from 'bun:test';
import { Glob } from 'bun';
import { readFileSync } from 'node:fs';
import { posix } from 'node:path';
import {
	contactRepositoryWith,
	fixedClock,
	inMemoryContactDirectory,
	inMemoryContactNames,
	sequentialIds,
	somebody
} from '.';

const viewer = { id: 'u', householdId: 'h' };

describe('fixedClock', () => {
	it('stays at the moment it was given until a test moves it on', () => {
		const clock = fixedClock(1_000);
		expect([clock.now(), clock.now()]).toEqual([1_000, 1_000]);
		clock.advance(250);
		expect(clock.now()).toBe(1_250);
	});
});

describe('sequentialIds', () => {
	it('hands out the ids it was given, then numbered ones', () => {
		const ids = sequentialIds('first', 'second');
		expect([ids.next(), ids.next(), ids.next(), ids.next()]).toEqual([
			'first',
			'second',
			'id-3',
			'id-4'
		]);
	});

	it('numbers from one when given none', () => {
		const ids = sequentialIds();
		expect([ids.next(), ids.next()]).toEqual(['id-1', 'id-2']);
	});
});

describe('somebody', () => {
	it('is a list row with every optional field empty', () => {
		expect(somebody('anna', 'Anna')).toEqual({
			id: 'anna',
			displayName: 'Anna',
			firstName: null,
			lastName: null,
			nickname: null,
			formerName: null,
			description: null,
			metPlace: null,
			metDate: null,
			visibility: 'shared',
			avatarPhotoId: null,
			birthDate: null,
			jobTitle: null,
			company: null,
			archived: false
		});
	});

	it('takes the fields a test is about', () => {
		const anna = somebody('anna', 'Anna', { lastName: 'Lind', archived: true });
		expect([anna.lastName, anna.archived]).toEqual(['Lind', true]);
	});
});

describe('inMemoryContactDirectory', () => {
	const people = [
		somebody('cleo', 'Cleo'),
		somebody('anna', 'Anna', { lastName: 'Lind', description: 'from choir' }),
		somebody('old', 'Otto', { archived: true })
	];
	const directory = inMemoryContactDirectory(people);

	it('lists the browsable people by name, and the archived ones apart', async () => {
		expect((await directory.listVisibleTo(viewer)).map((p) => p.id)).toEqual(['anna', 'cleo']);
		expect((await directory.listArchivedVisibleTo(viewer)).map((p) => p.id)).toEqual(['old']);
		expect(await directory.countArchivedVisibleTo(viewer)).toBe(1);
	});

	it('hands out list rows, without the fake’s own archive flag', async () => {
		const [anna] = await directory.listVisibleTo(viewer);
		expect(anna).not.toHaveProperty('archived');
	});

	it('cuts the browsable ids to the limit', async () => {
		expect(await directory.listSomeBrowsableIdsVisibleTo(viewer, 1)).toEqual(['anna']);
	});

	it('reads what tells the browsable people apart', async () => {
		expect(await directory.listDistinguishableVisibleTo(viewer)).toEqual([
			{
				id: 'anna',
				displayName: 'Anna',
				lastName: 'Lind',
				description: 'from choir',
				metPlace: null,
				metDate: null
			},
			{
				id: 'cleo',
				displayName: 'Cleo',
				lastName: null,
				description: null,
				metPlace: null,
				metDate: null
			}
		]);
	});
});

describe('inMemoryContactNames', () => {
	const names = inMemoryContactNames([
		somebody('anna', 'Anna'),
		somebody('old', 'Otto', { archived: true })
	]);

	it('names the asked-for people, archived ones included', async () => {
		expect(await names.listNamesAmongVisibleTo(viewer, ['old', 'anna', 'nobody'])).toEqual([
			{ id: 'anna', displayName: 'Anna' },
			{ id: 'old', displayName: 'Otto' }
		]);
	});

	it('leaves the archived ones out of the browsable names', async () => {
		expect(await names.listBrowsableNamesAmong(viewer, ['old', 'anna'])).toEqual([
			{ id: 'anna', displayName: 'Anna' }
		]);
	});
});

describe('contactRepositoryWith', () => {
	it('answers with what the test gave it', async () => {
		const repo = contactRepositoryWith({ findByIdVisibleTo: async () => null });
		expect(await repo.findByIdVisibleTo(viewer, 'anna')).toBeNull();
	});

	it('fails loud on a method the test did not expect to be called', async () => {
		const repo = contactRepositoryWith({});
		await expect(repo.setArchived('anna', 1)).rejects.toThrow(
			'ContactRepository.setArchived was not expected in this test'
		);
	});
});

describe('the testing folders', () => {
	// They stay out of the build because nothing the app runs imports them: Vite bundles only
	// what is reached from a route. A test is the only caller they may have — the domain's fakes
	// here, and the edge's fake request event in `lib/server/testing/`.
	const FOLDERS = ['src/lib/server/domain/testing/', 'src/lib/server/testing/'];
	const IMPORT = /\b(?:import|export)\s+(?:type\s+)?(?:[^;'"]*?\s+from\s+)?['"]([^'"]+)['"]/g;
	const target = (importer: string, specifier: string) =>
		specifier.startsWith('$lib/')
			? `src/lib/${specifier.slice('$lib/'.length)}`
			: specifier.startsWith('.')
				? posix.join(posix.dirname(importer), specifier)
				: null;
	const inFolder = (path: string) =>
		FOLDERS.some((folder) => path === folder.slice(0, -1) || path.startsWith(folder));
	const reachesTesting = (importer: string, code: string) =>
		[...code.matchAll(IMPORT)].some(([, specifier]) => {
			const path = target(importer, specifier!);
			return !!path && inFolder(path);
		});

	it('are imported by tests only', () => {
		const importers = [...new Glob('src/**/*.{ts,svelte}').scanSync('.')]
			.filter((path) => !path.endsWith('.test.ts') && !inFolder(path))
			.filter((path) => reachesTesting(path, readFileSync(path, 'utf8')));
		expect(importers).toEqual([]);
	});

	it('catch a folder however it is reached', () => {
		const at = 'src/lib/server/domain/contacts/contacts.ts';
		expect(reachesTesting(at, "import { fixedClock } from '../testing';")).toBe(true);
		expect(reachesTesting(at, "import type { X } from '$lib/server/domain/testing/c';")).toBe(true);
		expect(reachesTesting(at, "import { x } from './testing-notes';")).toBe(false);
		expect(reachesTesting(at, "import { routeEvent } from '$lib/server/testing';")).toBe(true);
		expect(reachesTesting('src/routes/x.ts', "import { x } from '../lib/server/testing/r';")).toBe(
			true
		);
	});
});
