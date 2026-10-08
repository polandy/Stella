import { describe, expect, it } from 'bun:test';
import { Glob } from 'bun';
import { readFileSync } from 'node:fs';
import { posix } from 'node:path';
import ts from 'typescript';

/*
 * AR-06's guardrail (docs/concepts/architecture-review-2026-10.md §6): the bounded contexts
 * under `domain/` depend on each other one way only. A cycle — `contacts` reading a port of
 * `relationships` while `relationships` reads one of `contacts` — means neither can be read or
 * changed without the other. A type-only import counts as much as a value one: it is the same
 * coupling, only erased at runtime. Where two contexts need each other, the one that is read
 * declares the narrow port it needs itself, and the other side's adapter fulfils it
 * structurally (docs/08 §8.3).
 *
 * Tests are left out: a test may reach for another context's fakes without the code doing so.
 */

const DOMAIN = 'src/lib/server/domain/';
const SOURCE = new Glob(`${DOMAIN}**/*.ts`);

/**
 * Edges `from → to` still allowed although they close a cycle. It only shrinks: a fix deletes
 * its line, and a line whose import is gone fails the last case below.
 */
const KNOWN_CYCLE_EDGES: readonly string[] = [];

/** Every module `code` refers to: imports, re-exports, `import type`, `import()` and `import('…').T`. */
function specifiers(code: string): string[] {
	return ts.preProcessFile(code, true, true).importedFiles.map((file) => file.fileName);
}

/** The domain folder a file or specifier lands in, or null when it lands outside `domain/`. */
function contextOf(importer: string, specifier: string): string | null {
	let path: string;
	if (specifier.startsWith('$lib/')) path = `src/lib/${specifier.slice('$lib/'.length)}`;
	else if (specifier.startsWith('.')) path = posix.join(posix.dirname(importer), specifier);
	else return null;
	if (!path.startsWith(DOMAIN)) return null;
	const rest = path.slice(DOMAIN.length);
	if (rest.includes('/')) return rest.slice(0, rest.indexOf('/'));
	// `../media` is the folder's index; a file at the top of `domain/` belongs to no context.
	return /\.[jt]s$/.test(rest) ? null : rest;
}

/** The context edges `from → to` of the given files, each with the files that draw it. */
function contextEdges(files: Record<string, string>): Map<string, string[]> {
	const edges = new Map<string, string[]>();
	for (const [path, code] of Object.entries(files)) {
		// `.` is the importer's own folder, so this is the context the file belongs to.
		const from = contextOf(path, '.');
		if (from === null) continue;
		for (const specifier of specifiers(code)) {
			const to = contextOf(path, specifier);
			if (to === null || to === from) continue;
			const key = `${from} → ${to}`;
			edges.set(key, [...new Set([...(edges.get(key) ?? []), path])]);
		}
	}
	return edges;
}

/** The strongly connected groups of more than one context — each one a cycle (Tarjan). */
function cycles(edges: Iterable<string>): string[][] {
	const next = new Map<string, string[]>();
	for (const edge of edges) {
		const [from, to] = edge.split(' → ') as [string, string];
		next.set(from, [...(next.get(from) ?? []), to]);
		if (!next.has(to)) next.set(to, []);
	}
	const index = new Map<string, number>();
	const low = new Map<string, number>();
	const stack: string[] = [];
	const found: string[][] = [];
	const visit = (node: string) => {
		index.set(node, index.size);
		low.set(node, index.get(node)!);
		stack.push(node);
		for (const to of next.get(node)!) {
			if (!index.has(to)) {
				visit(to);
				low.set(node, Math.min(low.get(node)!, low.get(to)!));
			} else if (stack.includes(to)) {
				low.set(node, Math.min(low.get(node)!, index.get(to)!));
			}
		}
		if (low.get(node) !== index.get(node)) return;
		const group: string[] = [];
		let member: string;
		do {
			member = stack.pop()!;
			group.push(member);
		} while (member !== node);
		if (group.length > 1) found.push(group.sort());
	};
	for (const node of [...next.keys()].sort()) if (!index.has(node)) visit(node);
	return found.sort();
}

/** The edges inside a cycle, with the files that draw them — what a failure has to name. */
function cycleEdges(edges: Map<string, string[]>): Record<string, string[]> {
	const open = [...edges.keys()].filter((edge) => !KNOWN_CYCLE_EDGES.includes(edge));
	const offending: Record<string, string[]> = {};
	for (const group of cycles(open)) {
		for (const edge of open) {
			const [from, to] = edge.split(' → ') as [string, string];
			if (group.includes(from) && group.includes(to)) offending[edge] = edges.get(edge)!;
		}
	}
	return offending;
}

const domainFiles = Object.fromEntries(
	[...SOURCE.scanSync('.')]
		.filter((path) => !path.endsWith('.test.ts'))
		.sort()
		.map((path) => [path, readFileSync(path, 'utf8')])
);

describe('the domain contexts', () => {
	it('import each other one way only: no cycle between domain/* folders', () => {
		expect(cycleEdges(contextEdges(domainFiles))).toEqual({});
	});

	it('read an import however it is written, type-only included', () => {
		const at = `${DOMAIN}contacts/x.ts`;
		const flagged = [
			"import { a } from '../media/avatars';",
			"import type { A } from '../media/avatars';",
			"import {\n\ttype A,\n\tb\n} from '../media/avatars';",
			"export { a } from '../media/avatars';",
			"export type { A } from '../media/avatars';",
			"export * from '../media';",
			"const m = await import('../media/avatars');",
			"type A = import('../media/avatars').A;",
			"import { a } from '$lib/server/domain/media/avatars';",
			"import '../media/avatars';"
		];
		const allowed = [
			"import { a } from './contacts';",
			"import { a } from '../../access/visibility';",
			"import { a } from '../../../people/display-name';",
			"import { a } from '$lib/server/db/media';",
			"// import { a } from '../media/avatars';",
			'const s = "from \'../media/avatars\'";'
		];
		const reaches = (code: string) => contextEdges({ [at]: code }).has('contacts → media');
		expect(flagged.filter((code) => !reaches(code))).toEqual([]);
		expect(allowed.filter((code) => reaches(code))).toEqual([]);
	});

	it('flag a cycle of two or more, never a one-way chain', () => {
		expect(cycles(['a → b', 'b → a', 'c → a'])).toEqual([['a', 'b']]);
		expect(cycles(['a → b', 'b → c', 'c → a', 'd → a'])).toEqual([['a', 'b', 'c']]);
		expect(cycles(['a → b', 'b → c', 'a → c'])).toEqual([]);
	});

	it('keep no exception whose import is gone', () => {
		const edges = contextEdges(domainFiles);
		expect(KNOWN_CYCLE_EDGES.filter((edge) => !edges.has(edge))).toEqual([]);
	});
});
