import { describe, expect, it } from 'bun:test';
import {
	coverageGaps,
	featureSubsections,
	headerCitations,
	markedUnit,
	type FeatureFile,
	type SpecFile
} from './spec-coverage';

const feature = (markdown: string): FeatureFile => ({
	file: 'docs/dev/features/2.9-search.md',
	markdown
});

const spec = (source: string): SpecFile => ({ file: 'e2e/search.spec.ts', source });

describe('feature subsections', () => {
	it('reads each ### section with the text up to the next heading', () => {
		const sections = featureSubsections(
			'docs/dev/features/2.9-search.md',
			`## 2.9 Search

Intro.

### 2.9.1 What it finds

Full text and names.

### 2.9.2 What it leaves out

Private records.

## 2.10 Next
`
		);
		expect(sections.map((s) => [s.id, s.heading])).toEqual([
			['2.9.1', 'What it finds'],
			['2.9.2', 'What it leaves out']
		]);
		expect(sections[0].body).toContain('Full text and names.');
		expect(sections[0].body).not.toContain('Private records.');
	});

	it('takes the file it belongs to along', () => {
		const [subsection] = featureSubsections('docs/dev/features/2.9-search.md', '### 2.9.1 A');
		expect(subsection.file).toBe('docs/dev/features/2.9-search.md');
	});

	it('reads numbered #### subsections too, the ### intro up to the first', () => {
		const sections = featureSubsections(
			'docs/dev/features/2.2-contacts.md',
			`### 2.2.4 Last names for several people at once

Intro.

#### 2.2.4.1 Where a proposal comes from

Proposal.

#### 2.2.4.2 The list

List.
`
		);
		expect(sections.map((s) => s.id)).toEqual(['2.2.4', '2.2.4.1', '2.2.4.2']);
		expect(sections[0].body).toContain('Intro.');
		expect(sections[0].body).not.toContain('Proposal.');
		expect(sections[1].heading).toBe('Where a proposal comes from');
	});

	it('reads a subsection whose number does not start with 2, and none from a bare number', () => {
		const sections = featureSubsections('f.md', '### 3.10.2 Schema\n\n### 4 Plain\n\nText.\n');
		expect(sections.map((s) => s.id)).toEqual(['3.10.2']);
		expect(sections[0].body).toBe('');
	});

	it('keeps an unnumbered #### inside its ### subsection', () => {
		const [section] = featureSubsections(
			'f.md',
			'### 2.4.1 Kin\n\n#### On the person page\n\nThe merge is *unit*-tested.\n'
		);
		expect(section.body).toContain('The merge is *unit*-tested.');
		expect(markedUnit(section)).toBe(true);
	});
});

describe('the citations an e2e header makes', () => {
	it('reads a plain § reference from the header, before the first test', () => {
		const ids = headerCitations(
			'/*\n * Search (docs/dev/02 §2.9).\n */\nimport { test } from "x";\ntest("x", () => {});\n'
		);
		expect([...ids]).toEqual(['2.9']);
	});

	it('ignores a reference inside a case, which the header does not own', () => {
		const ids = headerCitations(
			'/*\n * The card (docs/dev/02 §2.9).\n */\ntest("x", () => {\n\t// §2.9.2 is a neighbour\n});\n'
		);
		expect(ids.has('2.9.2')).toBe(false);
	});

	it('expands a bare-numbered range §2.9.2–4', () => {
		const ids = headerCitations('// Two and three (docs/dev/02 §2.9.2–4).\n');
		expect([...ids].sort()).toEqual(['2.9.2', '2.9.3', '2.9.4']);
	});

	it('expands a range whose end is written out in full, without a second §', () => {
		const ids = headerCitations('// One to three (docs/dev/02 §2.2.1–2.2.3).\n');
		expect([...ids].sort()).toEqual(['2.2.1', '2.2.2', '2.2.3']);
	});

	it('expands a multi-digit range by number, 2.25.9 to 2.25.11', () => {
		const ids = headerCitations('// Gifts (docs/dev/02 §2.25.9–11).\n');
		expect([...ids].sort()).toEqual(['2.25.10', '2.25.11', '2.25.9']);
	});

	it('reads a backwards range as its start alone, inventing no end', () => {
		const ids = headerCitations('// Gifts (docs/dev/02 §2.25.13–5).\n');
		expect([...ids]).toEqual(['2.25.13']);
	});

	it('reads a short dotted end against the start’s last parts', () => {
		const ids = headerCitations('// Across (docs/dev/02 §2.25.13–26.2).\n');
		expect([...ids].sort()).toEqual(['2.25.13', '2.26.2']);
	});

	it('cites both ends of a range across two parents, nothing between', () => {
		const ids = headerCitations('// Across (docs/dev/02 §2.9.4–§2.10.1).\n');
		expect([...ids].sort()).toEqual(['2.10.1', '2.9.4']);
	});

	it('expands a range split across the comment’s lines', () => {
		const ids = headerCitations(
			'/*\n * One to three (docs/dev/02 §2.9.1–\n * §2.9.3).\n */\nimport { test } from "x";\n'
		);
		expect([...ids].sort()).toEqual(['2.9.1', '2.9.2', '2.9.3']);
	});
});

describe('a subsection marked unit', () => {
	it('says so for an emphasised *unit* or _unit_', () => {
		for (const mark of ['*unit*', '_unit_', '*Unit*']) {
			const [sub] = featureSubsections('f.md', `### 2.9.1 A\n\nThe merge is ${mark}-tested.\n`);
			expect(markedUnit(sub)).toBe(true);
		}
	});

	it('says nothing for the bare word, so "not unit-tested" stays a gap', () => {
		for (const text of ['This is not unit-tested.', 'Pure and unit-testable.', 'A unit of work.']) {
			const [sub] = featureSubsections('f.md', `### 2.9.1 A\n\n${text}\n`);
			expect(markedUnit(sub)).toBe(false);
		}
	});

	it('says nothing for prose that merely contains the letters', () => {
		const [sub] = featureSubsections('f.md', '### 2.9.1 A\n\nAn opportunity for the community.\n');
		expect(markedUnit(sub)).toBe(false);
	});
});

describe('the gaps', () => {
	const features: FeatureFile[] = [
		feature(
			`## 2.9 Search

### 2.9.1 What it finds

### 2.9.2 What it leaves out

The rule is *unit*-tested.

### 2.9.4 Not tested yet

This is not unit-tested.

### 2.9.3 Not planned
`
		)
	];

	it('lists the uncited subsections, a unit-marked one left out', () => {
		const gaps = coverageGaps(features, [spec('/*\n * Search (docs/dev/02 §2.9.1).\n */\n')]);
		expect(gaps.map((gap) => gap.id)).toEqual(['2.9.3', '2.9.4']);
	});

	it('lists every subsection when no spec cites anything, and nothing without features', () => {
		expect(coverageGaps(features, []).map((gap) => gap.id)).toEqual(['2.9.1', '2.9.3', '2.9.4']);
		expect(coverageGaps([], [spec('// §2.9.1\n')])).toEqual([]);
	});

	it('lets a cited descendant cover its ancestor subsection', () => {
		const contact: FeatureFile = {
			file: 'docs/dev/features/2.2-contacts.md',
			markdown: '### 2.2.4 Last names\n\n#### 2.2.4.1 Where\n\n#### 2.2.4.2 The list\n'
		};
		const gaps = coverageGaps([contact], [spec('/*\n * List (docs/dev/02 §2.2.4.2).\n */\n')]);
		expect(gaps.map((gap) => gap.id)).toEqual(['2.2.4.1']);
	});

	it('orders by file then by the section’s own numbers', () => {
		const other: FeatureFile = {
			file: 'docs/dev/features/2.1-x.md',
			markdown: '### 2.1.10 A\n\n### 2.1.2 B\n'
		};
		const gaps = coverageGaps([feature('### 2.9.3 A\n\n'), other], []);
		expect(gaps.map((gap) => `${gap.file}#${gap.id}`)).toEqual([
			'docs/dev/features/2.1-x.md#2.1.2',
			'docs/dev/features/2.1-x.md#2.1.10',
			'docs/dev/features/2.9-search.md#2.9.3'
		]);
	});

	it('orders files by their feature number, so 2.2 comes before 2.10', () => {
		const later: FeatureFile = {
			file: 'docs/dev/features/2.10-privacy-model.md',
			markdown: '### 2.10.1 A\n\n'
		};
		const earlier: FeatureFile = {
			file: 'docs/dev/features/2.2-contacts.md',
			markdown: '### 2.2.1 B\n\n'
		};
		const gaps = coverageGaps([later, earlier], []);
		expect(gaps.map((gap) => gap.file)).toEqual([
			'docs/dev/features/2.2-contacts.md',
			'docs/dev/features/2.10-privacy-model.md'
		]);
	});
});
