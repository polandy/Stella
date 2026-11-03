import { describe, expect, test } from 'bun:test';
import {
	exportedModel,
	fileNameFor,
	lifeYearsOf,
	lifeYearsWords,
	NAME_PT_FOR_A3,
	printedSize,
	privateCount,
	renderScale
} from './tree-export';
import type { GraphModel, GraphNode } from './model/types';
import type { Translate } from '../i18n/translate';

const person = (id: string, extra: Partial<GraphNode> = {}): GraphNode => ({
	id,
	kind: 'person',
	label: id,
	...extra
});

const family: GraphModel = {
	nodes: [
		person('anna'),
		person('lukas', { private: true }),
		person('peter'),
		{ id: 'ski', kind: 'circle', label: 'Ski course', private: true }
	],
	edges: [
		{ id: 'e1', source: 'anna', target: 'peter', kind: 'relationship' },
		{ id: 'e2', source: 'lukas', target: 'peter', kind: 'relationship' },
		{ id: 'e3', source: 'ski', target: 'anna', kind: 'membership' }
	]
};

describe('exportedModel', () => {
	test('leaves private people and circles out, with every line to them', () => {
		const out = exportedModel(family, false);
		expect(out.nodes.map((n) => n.id)).toEqual(['anna', 'peter']);
		expect(out.edges.map((e) => e.id)).toEqual(['e1']);
	});

	test('keeps them when the reader asks', () => {
		expect(exportedModel(family, true)).toEqual(family);
	});

	test('counts the private ones a switch would bring in', () => {
		expect(privateCount(family)).toBe(2);
	});
});

describe('lifeYearsOf', () => {
	test('a living person with a known birth year', () => {
		expect(lifeYearsOf(person('a', { born: 1941 }))).toEqual({ kind: 'born', year: 1941 });
	});

	test('a person who died, both years known', () => {
		expect(lifeYearsOf(person('a', { born: 1938, died: 2019, deceased: true }))).toEqual({
			kind: 'span',
			born: 1938,
			died: 2019
		});
	});

	test('a person who died, only the birth year known', () => {
		expect(lifeYearsOf(person('a', { born: 1938, deceased: true }))).toEqual({
			kind: 'span',
			born: 1938,
			died: null
		});
	});

	test('only the death year known', () => {
		expect(lifeYearsOf(person('a', { died: 2019, deceased: true }))).toEqual({
			kind: 'died',
			year: 2019
		});
	});

	test('nothing known, or a circle, says nothing', () => {
		expect(lifeYearsOf(person('a'))).toBeNull();
		expect(lifeYearsOf(person('a', { deceased: true }))).toBeNull();
		expect(lifeYearsOf({ id: 'c', kind: 'circle', label: 'c', born: 2000 })).toBeNull();
	});
});

describe('lifeYearsWords', () => {
	const t = ((key: string, p?: Record<string, unknown>) =>
		`${key}${JSON.stringify(p ?? {})}`) as unknown as Translate;

	test('each kind reads through its own phrase', () => {
		expect(lifeYearsWords(t, { kind: 'born', year: 1941 })).toBe('graph.export.born{"year":1941}');
		expect(lifeYearsWords(t, { kind: 'died', year: 2019 })).toBe('graph.export.died{"year":2019}');
		expect(lifeYearsWords(t, { kind: 'span', born: 1938, died: 2019 })).toBe(
			'graph.export.lived{"born":1938,"died":2019}'
		);
		expect(lifeYearsWords(t, { kind: 'span', born: 1938, died: null })).toBe(
			'graph.export.livedUntilUnknown{"born":1938}'
		);
	});
});

describe('printedSize', () => {
	test('a wide tree is scaled down to the printable width of the page', () => {
		// A4 landscape less 10 mm each side leaves 277 × 190 mm.
		const size = printedSize({ width: 2770, height: 500 }, 'a4');
		expect(size.widthMm).toBeCloseTo(277);
		expect(size.heightMm).toBeCloseTo(50);
	});

	test('a tall tree is held by the height instead', () => {
		const size = printedSize({ width: 500, height: 1900 }, 'a4');
		expect(size.heightMm).toBeCloseTo(190);
	});

	test('a small tree is enlarged at most to twice its size on screen', () => {
		const size = printedSize({ width: 200, height: 100 }, 'a4');
		// A CSS pixel is 25.4 / 96 mm.
		expect(size.widthMm).toBeCloseTo(200 * (25.4 / 96) * 2);
	});

	test('names print in points from the 11 px canvas names', () => {
		const size = printedSize({ width: 2770, height: 500 }, 'a4');
		// 0.1 mm per pixel → 1.1 mm → about 3.1 pt.
		expect(size.namePt).toBeCloseTo(1.1 / (25.4 / 72), 1);
	});

	test('A3 prints the same tree larger', () => {
		const tree = { width: 4000, height: 1200 };
		expect(printedSize(tree, 'a3').namePt).toBeGreaterThan(printedSize(tree, 'a4').namePt);
	});

	test('the hint to choose A3 starts below a readable size', () => {
		expect(NAME_PT_FOR_A3).toBeGreaterThan(5);
		expect(NAME_PT_FOR_A3).toBeLessThan(9);
	});
});

describe('renderScale', () => {
	test('a picture renders at twice its size on screen', () => {
		expect(renderScale({ width: 800, height: 600 }, 'png', 'a4')).toBe(2);
	});

	test('a print renders sharp enough for 300 dpi on the page', () => {
		const tree = { width: 2770, height: 500 };
		// 277 mm at 300 dpi is about 3271 pixels across.
		expect(renderScale(tree, 'print', 'a4') * tree.width).toBeCloseTo((277 / 25.4) * 300, 0);
	});

	test('never asks a canvas for more than a phone browser can draw', () => {
		const huge = { width: 6000, height: 4000 };
		const scale = renderScale(huge, 'print', 'a3');
		expect(huge.width * scale * huge.height * scale).toBeLessThanOrEqual(16_000_000);
	});

	test('a tiny tree still renders at least at its own size', () => {
		expect(renderScale({ width: 10, height: 10 }, 'print', 'a4')).toBeLessThanOrEqual(8);
		expect(renderScale({ width: 20000, height: 20000 }, 'png', 'a4')).toBeGreaterThan(0);
	});
});

describe('fileNameFor', () => {
	test('the title becomes a plain file name', () => {
		expect(fileNameFor('Family of Anna Example')).toBe('family-of-anna-example.png');
	});

	test('letters of every language stay', () => {
		expect(fileNameFor('Familie von Jürgen Müller!')).toBe('familie-von-jürgen-müller.png');
	});

	test('an empty title falls back to a name', () => {
		expect(fileNameFor('  ?? ')).toBe('family-tree.png');
	});
});
