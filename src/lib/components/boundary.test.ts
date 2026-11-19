import { describe, expect, it } from 'bun:test';
import { Glob } from 'bun';
import { readFileSync } from 'node:fs';
import { posix } from 'node:path';

/*
 * A shared building block lives in `ui/`, which reaches into no feature folder; a feature folder
 * does not grow new imports from another one (docs/dev/05 §5.7). The pairs below are the ones
 * that existed when the rule came in: the list only shrinks.
 */

const ROOT = 'src/lib/components/';
const files = [...new Glob(`${ROOT}*/**/*.{ts,svelte}`).scanSync('.')]
	.filter((path) => !path.endsWith('.test.ts'))
	.sort();

const IMPORT = /\bfrom\s+['"]([^'"]+)['"]/g;

const folderOf = (path: string) => path.slice(ROOT.length).split('/')[0]!;

/** The component folder a specifier lands in, or null when it leaves `components/`. */
function folderImported(importer: string, specifier: string): string | null {
	const path = specifier.startsWith('$lib/')
		? `src/lib/${specifier.slice('$lib/'.length)}`
		: specifier.startsWith('.')
			? posix.join(posix.dirname(importer), specifier)
			: null;
	if (!path?.startsWith(ROOT)) return null;
	const rest = path.slice(ROOT.length);
	return rest.includes('/') ? rest.split('/')[0]! : null;
}

function edges(): Map<string, string[]> {
	const found = new Map<string, string[]>();
	for (const path of files) {
		for (const [, specifier] of readFileSync(path, 'utf8').matchAll(IMPORT)) {
			const to = folderImported(path, specifier!);
			const from = folderOf(path);
			if (to === null || to === from || to === 'ui') continue;
			const key = `${from} -> ${to}`;
			found.set(key, [...(found.get(key) ?? []), path]);
		}
	}
	return found;
}

const EXISTING = new Set([
	'circle -> immich',
	'circle -> pwa',
	'circle -> surnames',
	'gifts -> people',
	'gifts -> person',
	'gifts -> when',
	'immich -> people',
	'journal -> immich',
	'journal -> people',
	'person -> gifts',
	'person -> graph',
	'person -> immich',
	'person -> people',
	'person -> pwa',
	'person -> stream',
	'person -> todos',
	'person -> when',
	'plans -> person',
	'plans -> when',
	'shell -> people',
	'stream -> immich',
	'stream -> journal',
	'stream -> memories',
	'stream -> people',
	'stream -> person',
	'stream -> todos',
	'surnames -> people'
]);

describe('component folders', () => {
	it('keeps ui/ free of feature folders', () => {
		const leaks = [...edges()].filter(([key]) => key.startsWith('ui -> '));
		expect(leaks).toEqual([]);
	});

	it('takes no new import from one feature folder into another', () => {
		const fresh = [...edges()].filter(([key]) => !key.startsWith('ui -> ') && !EXISTING.has(key));
		expect(fresh).toEqual([]);
	});

	it('drops a pair from the list once nothing imports it', () => {
		const live = new Set(edges().keys());
		expect([...EXISTING].filter((key) => !live.has(key))).toEqual([]);
	});
});
