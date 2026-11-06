import { describe, expect, it } from 'bun:test';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';

/*
 * docs/04 §4.3 is the map agents find code by (CLAUDE.md); a folder missing from it is a feature
 * nobody finds (review TD-04). The tree is read by its indentation, two spaces a level, so a
 * name listed under another parent does not count.
 */
const repoRoot = join(import.meta.dir, '..');

async function mappedPaths(): Promise<Set<string>> {
	const doc = await Bun.file(
		join(repoRoot, 'docs/architecture/4.3-application-structure.md')
	).text();
	const tree = doc.slice(
		doc.indexOf('```\nsrc/') + 4,
		doc.indexOf('```', doc.indexOf('```\nsrc/') + 4)
	);
	const paths = new Set<string>();
	const parents: string[] = [];
	for (const line of tree.split('\n')) {
		const entry = line.split('#')[0];
		if (!entry.trim()) continue;
		const depth = (entry.length - entry.trimStart().length) / 2;
		parents.length = depth;
		for (const name of entry.trim().split(/,\s*/)) {
			paths.add([...parents, name.replace(/\/$/, '')].join('/'));
		}
		parents[depth] = entry.trim().replace(/\/$/, '');
	}
	return paths;
}

const mappedFolders = [
	'src/lib',
	'src/lib/server',
	'src/lib/server/domain',
	'src/lib/components',
	'src/routes',
	'src/routes/(app)'
];

describe('docs/04 §4.3 code tree', () => {
	it.each(mappedFolders.map((folder) => [folder]))(
		'names every folder under %s',
		async (folder) => {
			const paths = await mappedPaths();
			const missing = readdirSync(join(repoRoot, folder), { withFileTypes: true })
				.filter((entry) => entry.isDirectory())
				.map((entry) => `${folder}/${entry.name}`)
				.filter((path) => !paths.has(path));
			expect(missing).toEqual([]);
		}
	);
});
