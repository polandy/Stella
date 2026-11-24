/*
 * Which `docs/dev/features` subsections no e2e header drives, for `scripts/spec-coverage.sh`
 * (docs/dev/08 §8.4). Report only: a gap is a prompt to read a section, never a failing check.
 */

/** One features file's Markdown, named as the report prints it. */
export interface FeatureFile {
	readonly file: string;
	readonly markdown: string;
}

/** One e2e spec's source, named as the report prints it. */
export interface SpecFile {
	readonly file: string;
	readonly source: string;
}

/** One numbered subsection (`### 2.x.y` or `#### 2.x.y.z`, any leading number) with its text. */
export interface FeatureSubsection {
	readonly file: string;
	readonly id: string;
	readonly heading: string;
	readonly body: string;
}

/** One subsection the report lists: no e2e header cites it and it does not call itself unit. */
export interface CoverageGap {
	readonly file: string;
	readonly id: string;
	readonly heading: string;
}

const SUBSECTION_HEADING = /^#{3,4}\s+(\d+(?:\.\d+)+)\s+(.*)$/;
const CLOSING_HEADING = /^#{1,3}\s/;
const FIRST_TEST = /^[ \t]*test(?:\.\w+)?\s*\(/m;
const CITATION = /§(\d+(?:\.\d+)+)/g;
const RANGE = /§(\d+(?:\.\d+)+)\s*[–-]\s*§?(\d+(?:\.\d+)*)/g;
const UNIT_MARK = /(?:\*unit\*|_unit_)/i;

/** Every numbered `###`/`####` subsection of one features file, in document order. */
export function featureSubsections(file: string, markdown: string): FeatureSubsection[] {
	const out: FeatureSubsection[] = [];
	let open: { id: string; heading: string; body: string[] } | null = null;
	const close = (): void => {
		if (!open) return;
		out.push({ file, id: open.id, heading: open.heading, body: open.body.join('\n').trim() });
		open = null;
	};
	for (const line of markdown.split('\n')) {
		const subsection = SUBSECTION_HEADING.exec(line);
		if (subsection) {
			close();
			open = { id: subsection[1], heading: subsection[2].trim(), body: [] };
		} else if (CLOSING_HEADING.test(line)) {
			close();
		} else if (open) {
			open.body.push(line);
		}
	}
	close();
	return out;
}

/**
 * The `§` ids an e2e spec's header cites. A range (`§2.26.6–7`, `§2.2.1–2.2.3`, `§2.9.1–§2.9.3`)
 * counts every section between its ends; a short end replaces the start's last parts.
 */
export function headerCitations(source: string): Set<string> {
	const at = source.search(FIRST_TEST);
	const header = (at === -1 ? source : source.slice(0, at))
		.replace(/^[ \t]*(?:\*|\/\/)[ \t]?/gm, '')
		.replace(/\s+/g, ' ');
	const ids = new Set<string>();
	for (const full of header.matchAll(CITATION)) ids.add(full[1]);
	for (const range of header.matchAll(RANGE)) {
		for (const id of expandRange(range[1], rangeEnd(range[1], range[2]))) ids.add(id);
	}
	return ids;
}

/** Whether the subsection marks its behaviour as held by unit tests: an emphasised *unit*. */
export function markedUnit(subsection: FeatureSubsection): boolean {
	return UNIT_MARK.test(`${subsection.heading}\n${subsection.body}`);
}

/**
 * Every subsection no e2e header cites and that is not marked unit, in document order: feature
 * number, then section. A header citing a numbered part counts for the section that holds it.
 */
export function coverageGaps(
	features: readonly FeatureFile[],
	specs: readonly SpecFile[]
): CoverageGap[] {
	const covered = new Set<string>();
	for (const spec of specs) {
		for (const id of headerCitations(spec.source)) {
			const parts = id.split('.');
			for (let n = parts.length; n > 0; n--) covered.add(parts.slice(0, n).join('.'));
		}
	}
	const gaps: CoverageGap[] = [];
	for (const file of features) {
		for (const subsection of featureSubsections(file.file, file.markdown)) {
			if (covered.has(subsection.id) || markedUnit(subsection)) continue;
			gaps.push({ file: subsection.file, id: subsection.id, heading: subsection.heading });
		}
	}
	return gaps.sort(
		(a, b) =>
			compareNumbers(featureOrder(a.file), featureOrder(b.file)) ||
			compareNumbers(numbers(a.id), numbers(b.id))
	);
}

/** The leading `2.x` number of a features file, so 2.2 sorts before 2.10. */
function featureOrder(file: string): number[] {
	const name = file.split('/').pop() ?? '';
	const match = /^(\d+(?:\.\d+)*)/.exec(name);
	return match ? numbers(match[1]) : [];
}

function numbers(id: string): number[] {
	return id.split('.').map(Number);
}

function compareNumbers(a: readonly number[], b: readonly number[]): number {
	for (let i = 0; i < Math.max(a.length, b.length); i++) {
		const diff = (a[i] ?? 0) - (b[i] ?? 0);
		if (diff !== 0) return diff;
	}
	return 0;
}

/** A range's end as a full id: a shorter end replaces the start's last parts (`2.9.2–4`). */
function rangeEnd(start: string, end: string): string {
	const from = start.split('.');
	const to = end.split('.');
	return to.length >= from.length
		? end
		: [...from.slice(0, from.length - to.length), ...to].join('.');
}

/** The ids a range covers; a backwards one only its start, never an end the header did not mean. */
function expandRange(start: string, end: string): string[] {
	const from = numbers(start);
	const to = numbers(end);
	if (compareNumbers(to, from) <= 0) return [start];
	const sameParent =
		from.length === to.length && from.slice(0, -1).every((part, i) => part === to[i]);
	if (!sameParent) return [start, end];
	const ids: string[] = [];
	for (let last = from[from.length - 1]; last <= to[to.length - 1]; last++) {
		ids.push([...from.slice(0, -1), last].join('.'));
	}
	return ids;
}
