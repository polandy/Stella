#!/usr/bin/env bun
/*
 * Splits the person page into section components and action modules (PR #211).
 *
 *   bun scripts/split-person-page.ts [ref]      # ref defaults to origin/main
 *
 * The split is meant to be *regenerated*, not hand-merged: while other pull requests still edit
 * the monolithic `contacts/[id]/+page.svelte` and `+page.server.ts`, the way to land it is to let
 * them merge, then run this against the new main and commit what it writes. It reads both files
 * as they are at `ref` and overwrites the route's `+page.svelte` and `+page.server.ts`, and
 * writes `load.ts`, `review-path.ts`, `actions/*.ts` and `src/lib/components/person/*`.
 *
 * Every moved line is copied from the old files, never retyped. Pieces are found by what they
 * say, not by line number, so edits elsewhere in the files do not move them:
 *
 * - a script statement is named by a line unique to it and runs to where its brackets close,
 *   together with the comment directly above it;
 * - an action is named by its key in the `actions` object;
 * - a markup block is an element, `{#if}` or `{#snippet}` named by a unique line in or on it,
 *   and runs to its matching close tag, together with an HTML comment directly above it when
 *   asked for.
 *
 * Markup is dedented by a uniform number of tabs per block and never reformatted line by line.
 * Only the glue — imports, props, the components' tags — is written here.
 *
 * It fails loud rather than guess: a name that matches no line or more than one stops it, and
 * so does any non-blank line of the old files that went nowhere (beyond their imports and the
 * few lines the glue rewrites). A pull request that added a new action, card or statement
 * therefore stops the run and names the line; add it to the matching module below and run again.
 * Imports are hand-written per file, so one a pull request added shows up in `bun run check`.
 *
 * Once the split has landed on main there is nothing left for this to read, and it can go.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

const ROOT = join(import.meta.dir, '..');
const ROUTE = 'src/routes/(app)/contacts/[id]';
const COMP = 'src/lib/components/person';
const ref = process.argv[2] ?? 'origin/main';

function fail(message: string): never {
	console.error(`split-person-page: ${message}`);
	process.exit(1);
}

/** One of the two old files, and which of its lines have gone somewhere. */
interface Source {
	name: string;
	lines: readonly string[];
	used: Set<number>;
	/** Indent of a top-level statement: inside `<script>`, or at the file's own top level. */
	topIndent: number;
}

/** Inclusive, zero-based. */
interface Range {
	start: number;
	end: number;
}

function load(path: string, topIndent: number): Source {
	const shown = Bun.spawnSync(['git', '-C', ROOT, 'show', `${ref}:${path}`]);
	if (shown.exitCode !== 0) fail(`cannot read ${path} at ${ref}: ${shown.stderr.toString()}`);
	return { name: path, lines: shown.stdout.toString().split('\n'), used: new Set(), topIndent };
}

const svelte = load(`${ROUTE}/+page.svelte`, 1);
const server = load(`${ROUTE}/+page.server.ts`, 0);

const indentOf = (line: string) => line.length - line.trimStart().length;
const isBlank = (line: string) => line.trim() === '';

/** The one line `matches` names, within `within` if given. */
function unique(src: Source, what: string, matches: (line: string) => boolean, within?: Range): number {
	const from = within?.start ?? 0;
	const to = within?.end ?? src.lines.length - 1;
	const hits: number[] = [];
	for (let i = from; i <= to; i++) if (matches(src.lines[i]!)) hits.push(i);
	if (hits.length !== 1) {
		fail(`${src.name}: expected one line ${what}, found ${hits.length}${hits.length ? ` (lines ${hits.map((h) => h + 1).join(', ')})` : ''}`);
	}
	return hits[0]!;
}

const containing = (src: Source, text: string, within?: Range) =>
	unique(src, `containing ${JSON.stringify(text)}`, (line) => line.includes(text), within);
const startingWith = (src: Source, text: string, within?: Range) =>
	unique(src, `starting with ${JSON.stringify(text)}`, (line) => line.trimStart().startsWith(text), within);

// ---------------------------------------------------------------------------------------------
// Script statements
// ---------------------------------------------------------------------------------------------

const isTsComment = (line: string) => /^(\/\/|\/\*|\*)/.test(line.trim());

/** The first line of the comment directly above `start`, or `start` itself. */
function tsCommentAbove(src: Source, start: number): number {
	let at = start;
	while (at > 0 && isTsComment(src.lines[at - 1]!)) at--;
	return at;
}

/** The bracket depth a line adds, comments and string literals left out. */
function depthChange(line: string, inBlockComment: { open: boolean }): number {
	let text = line;
	if (inBlockComment.open) {
		const close = text.indexOf('*/');
		if (close < 0) return 0;
		inBlockComment.open = false;
		text = text.slice(close + 2);
	}
	text = text.replace(/\/\*.*?\*\//g, '');
	const open = text.indexOf('/*');
	if (open >= 0) {
		inBlockComment.open = true;
		text = text.slice(0, open);
	}
	text = text.replace(/\/\/.*$/, '').replace(/'(?:\\.|[^'\\])*'|"(?:\\.|[^"\\])*"/g, '');
	let depth = 0;
	for (const ch of text) {
		if ('([{'.includes(ch)) depth++;
		else if (')]}'.includes(ch)) depth--;
	}
	return depth;
}

/** Where the statement starting at `start` ends: its brackets closed and the line finished. */
function statementEnd(src: Source, start: number): number {
	const comment = { open: false };
	let depth = 0;
	for (let i = start; i < src.lines.length; i++) {
		depth += depthChange(src.lines[i]!, comment);
		const tail = src.lines[i]!.trimEnd();
		if (depth === 0 && /(;|\}|\},)$/.test(tail)) return i;
		if (depth < 0) fail(`${src.name}:${start + 1}: brackets close before the statement ends`);
	}
	return fail(`${src.name}:${start + 1}: statement never ends`);
}

/** The top-level statement a line belongs to: up to the nearest line that can start one. */
function statementStart(src: Source, inside: number): number {
	for (let i = inside; i >= 0; i--) {
		const line = src.lines[i]!;
		if (isBlank(line) || isTsComment(line)) continue;
		if (indentOf(line) === src.topIndent && !/^[)\]}]/.test(line.trim())) return i;
	}
	return fail(`${src.name}:${inside + 1}: no statement starts above`);
}

/** The statement holding the one line containing `key`, with the comment above it. */
function stmt(src: Source, key: string): Range {
	const start = statementStart(src, containing(src, key));
	return { start: tsCommentAbove(src, start), end: statementEnd(src, start) };
}

/** From the first statement through the last, and everything between them. */
const span = (src: Source, first: string, last: string): Range => ({
	start: stmt(src, first).start,
	end: stmt(src, last).end
});

/** Just the comment above a statement. */
function commentOf(src: Source, key: string): Range {
	const start = statementStart(src, containing(src, key));
	const top = tsCommentAbove(src, start);
	if (top === start) fail(`${src.name}: no comment above ${JSON.stringify(key)}`);
	return { start: top, end: start - 1 };
}

/** One action of the `actions` object, with its comment. */
function action(name: string): Range {
	const start = startingWith(server, `${name}: async (`);
	return { start: tsCommentAbove(server, start), end: statementEnd(server, start) };
}

// ---------------------------------------------------------------------------------------------
// Markup blocks
// ---------------------------------------------------------------------------------------------

/** Where a block opened on `start` closes, counting `open` against `close` on every line. */
function closeOf(src: Source, start: number, open: RegExp, close: RegExp): number {
	let depth = 0;
	let inComment = false;
	for (let i = start; i < src.lines.length; i++) {
		let text = src.lines[i]!;
		if (inComment) {
			const end = text.indexOf('-->');
			if (end < 0) continue;
			inComment = false;
			text = text.slice(end + 3);
		}
		text = text.replace(/<!--.*?-->/g, '');
		const opens = text.indexOf('<!--');
		if (opens >= 0) {
			inComment = true;
			text = text.slice(0, opens);
		}
		depth += (text.match(open) ?? []).length - (text.match(close) ?? []).length;
		if (depth === 0) return i;
	}
	return fail(`${src.name}:${start + 1}: block never closes`);
}

const tagOpen = (tag: string) => new RegExp(`<${tag}(?=[\\s>]|$)`, 'g');
const tagClose = (tag: string) => new RegExp(`</${tag}>`, 'g');

/** The `<tag>` element opening on `start`. */
const element = (src: Source, start: number, tag: string): Range => ({
	start,
	end: closeOf(src, start, tagOpen(tag), tagClose(tag))
});

/** The `<Section>` whose opening tag holds the one line containing `key`. */
function section(src: Source, key: string): Range {
	let start = containing(src, key);
	while (start >= 0 && !src.lines[start]!.trimStart().startsWith('<Section')) start--;
	if (start < 0) fail(`${src.name}: no <Section above ${JSON.stringify(key)}`);
	return element(src, start, 'Section');
}

/** The `{#if}` block opened by the one line starting with `key`. */
const ifBlock = (src: Source, key: string, within?: Range): Range => {
	const start = startingWith(src, key, within);
	return { start, end: closeOf(src, start, /\{#if /g, /\{\/if\}/g) };
};

/** The lines inside a block, without its opening and closing lines. */
const inner = (block: Range): Range => ({ start: block.start + 1, end: block.end - 1 });

/** The `{#snippet}` opened by the one line starting with `key`, within `within`. */
const snippet = (src: Source, key: string, within: Range): Range => {
	const start = startingWith(src, key, within);
	return { start, end: closeOf(src, start, /\{#snippet /g, /\{\/snippet\}/g) };
};

/** A block together with the HTML comments directly above it. */
function withComment(src: Source, block: Range): Range {
	let start = block.start;
	while (start > 0 && src.lines[start - 1]!.trim().endsWith('-->')) {
		let top = start - 1;
		while (top >= 0 && !src.lines[top]!.includes('<!--')) top--;
		if (top < 0) fail(`${src.name}:${start}: comment never opens`);
		start = top;
	}
	return { start, end: block.end };
}

// ---------------------------------------------------------------------------------------------
// Emitting
// ---------------------------------------------------------------------------------------------

interface Replacement {
	range: Range;
	/** Lines at the indentation of the block they stand in, before the dedent. */
	lines: string[];
}

/**
 * The block's lines, verbatim, marked as gone somewhere. Replacements stand in for sub-blocks
 * (which must be emitted elsewhere to count), and `dedent` takes a uniform number of tabs off.
 */
function emit(
	src: Source,
	block: Range,
	options: { dedent?: number | 'auto'; replace?: Replacement[] } = {}
): string {
	const replacements = [...(options.replace ?? [])].sort((a, b) => a.range.start - b.range.start);
	const out: string[] = [];
	for (let i = block.start; i <= block.end; i++) {
		const replacement = replacements.find((r) => r.range.start === i);
		if (replacement) {
			out.push(...replacement.lines);
			i = replacement.range.end;
			continue;
		}
		if (replacements.some((r) => i > r.range.start && i <= r.range.end)) continue;
		src.used.add(i);
		out.push(src.lines[i]!);
	}
	let dedent = options.dedent ?? 0;
	if (dedent === 'auto') {
		const indents = out.filter((l) => !isBlank(l)).map((l) => l.length - l.replace(/^\t*/, '').length);
		dedent = Math.min(...indents);
	}
	const by = dedent;
	return out
		.map((line) => {
			if (isBlank(line)) return line.replace(/^\t*/, (tabs) => tabs.slice(Math.min(tabs.length, by)));
			const tabs = line.length - line.replace(/^\t*/, '').length;
			if (tabs < by) fail(`${src.name}: cannot dedent ${JSON.stringify(line)} by ${by}`);
			return line.slice(by);
		})
		.join('\n');
}

/** Lines the glue rewrites rather than moves: counted as handled. */
function retire(src: Source, range: Range) {
	for (let i = range.start; i <= range.end; i++) src.used.add(i);
}

/** Replaces exactly one occurrence, or stops: a quiet miss would ship the old text. */
function replaceOnce(text: string, from: string, to: string): string {
	const at = text.indexOf(from);
	if (at < 0 || text.indexOf(from, at + 1) >= 0) fail(`expected one ${JSON.stringify(from)}`);
	return text.slice(0, at) + to + text.slice(at + from.length);
}

const written: string[] = [];
function write(path: string, text: string) {
	const full = join(ROOT, path);
	mkdirSync(dirname(full), { recursive: true });
	writeFileSync(full, text.replace(/\n+$/, '') + '\n');
	written.push(path);
}

const S = (block: Range, options?: Parameters<typeof emit>[2]) => emit(svelte, block, options);
const T = (block: Range) => emit(server, block);
const s = (key: string) => stmt(svelte, key);

// ---------------------------------------------------------------------------------------------
// Pieces several components share
// ---------------------------------------------------------------------------------------------

const I18N = () => S(span(svelte, 'const i18n = useI18n();', 'const c = $derived(data.contact);'));
const SAVED = () => S(s('const saved = (name: SectionName)'));
const SAVED_THEN = () => S(s('const savedThen = (close'));
const SHOWN = () => S(span(svelte, 'const removals = useRemovals();', 'const shown = <T'));
const KIND_LABEL = () => S(s('const kindLabel = ('));

/*
 * The page held one open state for five sections; each section now holds its own, under the
 * same name, so the moved `saved('tags')` and `bind:open={openSection.tags}` read as before.
 */
const openSectionLine = s('let openSection = $state(');
const openComment = commentOf(svelte, 'let openSection = $state(');
retire(svelte, openSectionLine);
retire(svelte, s('type SectionName = keyof typeof openSection'));
function openState(key: string): string {
	// Only the comment's first sentence: the rest is about the story card.
	const first = svelte.lines.slice(openComment.start, openComment.start + 2);
	if (!first[1]?.endsWith('used to cause.')) fail('the open-state comment changed; check openState()');
	return `${first.join('\n')}\n\tlet openSection = $state({ ${key}: false });\n\ttype SectionName = keyof typeof openSection;`;
}
const notesOpenComment = () => S(openComment);

const PENDING = `\t// The shell's one activity indicator, which every change to the graph reports to (docs/05 §5.7).
\tconst graphPending = usePending();`;

const relSection = section(svelte, "id={sectionAnchor('relationships')}");
const relList = ifBlock(svelte, '{#if visibleRelationships.length > 0}', relSection);
const kinPanels: Range = {
	start: withComment(svelte, ifBlock(svelte, '{#if data.proposals.length > 0}', relSection)).start,
	end: ifBlock(svelte, '{#if data.derivedKin.length > 0}', relSection).end
};
const relEditor = snippet(svelte, '{#snippet editor()}', relSection);
const storySection = section(svelte, "id={sectionAnchor('story')}");
const notesSection = section(svelte, "id={sectionAnchor('notes')}");
const photosSection = section(svelte, "id={sectionAnchor('photos')}");
const mentionsSection = withComment(svelte, section(svelte, "id={sectionAnchor('mentions')}"));
const header = withComment(svelte, element(svelte, startingWith(svelte, '<header '), 'header'));
const profileCard = element(svelte, containing(svelte, '<section class="flex flex-col rounded-app bg-card p-4 shadow-card">'), 'section');
const fieldsRow = section(svelte, "title={t('contact.section.contact')}");
const datesRow = section(svelte, "title={t('contact.section.dates')}");
const circlesRow = section(svelte, "title={t('contact.section.circles')}");
const tagsRow = section(svelte, "title={t('contact.section.tags')}");
const recordActions = inner(element(svelte, containing(svelte, '<div class="mt-3 flex flex-col gap-3 border-t border-border-subtle pt-3">'), 'div'));
const main = element(svelte, startingWith(svelte, '<main '), 'main');

// ---------------------------------------------------------------------------------------------
// Types and the shared input class
// ---------------------------------------------------------------------------------------------

write(`${COMP}/types.ts`, `import type { RelationshipCategory } from '$lib/relationships/categories';
import type { Exclusion } from '$lib/relationships/exclusions';
import type { RelationshipTypeOption } from '$lib/relationships/type-options';
import type { ActionData, PageData } from '../../../routes/(app)/contacts/[id]/$types';

/*
 * The person page's sections (docs/05 §5.5) are that one page cut at its seams, so they read
 * the page's own data and form result rather than restating every shape: what its \`load\` and
 * actions produce stays the single definition, and a section reading something \`load\` no
 * longer sends fails \`bun run check\` instead of rendering nothing.
 */

/** What the person page's \`load\` hands its sections. */
export type PersonPageData = PageData;

/** The result of the page's last form action, carrying each section's error. */
export type PersonForm = ActionData;

/** The relationship picker's entries: every type, read from each of its sides. */
export type RelationshipChoices = RelationshipTypeOption<PersonPageData['relationshipTypes'][number]>[];

/** What the household's records rule out for one picker entry and target, or null. */
export type ExclusionOf = (
	option: { type: { key: string; category: RelationshipCategory }; side: 'forward' | 'reverse' },
	targetId: string | null | undefined,
	exceptId?: string | null
) => Exclusion | null;
`);

write(`${COMP}/inputs.ts`, replaceOnce(S(s('const INPUT ='), { dedent: 1 }), 'const INPUT', 'export const INPUT'));

// ---------------------------------------------------------------------------------------------
// The hero
// ---------------------------------------------------------------------------------------------

write(`${COMP}/PersonHeader.svelte`, `<script lang="ts">
	import FormError from '$lib/components/FormError.svelte';
	import AvatarUploader from '$lib/components/AvatarUploader.svelte';
	import Button from '$lib/components/Button.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import InlineEdit from '$lib/components/InlineEdit.svelte';
	import { dayLabel } from '$lib/dates/labels';
	import { useI18n } from '$lib/i18n/context.svelte';
	import type { PersonForm, PersonPageData } from './types';

	// The person page's hero (docs/05 §5.5): who this is, and the two things you came to do.
	let {
		data,
		form,
		metLine,
		isSelf,
		archived,
		logContact
	}: {
		data: PersonPageData;
		form: PersonForm;
		/** How this person came into the household's life, as one line, or null. */
		metLine: string | null;
		isSelf: boolean;
		archived: boolean;
		/** Opens the story card's own form, wherever the reader is. */
		logContact: () => void;
	} = $props();

${I18N()}
${S(s('const archivedOn = $derived('))}
</script>

${S(header, { dedent: 1 })}
`);

// ---------------------------------------------------------------------------------------------
// The profile card and its rows
// ---------------------------------------------------------------------------------------------

write(`${COMP}/ContactFieldsRow.svelte`, `<script lang="ts">
	import Button from '$lib/components/Button.svelte';
	import KeptChip from '$lib/components/KeptChip.svelte';
	import RemoveButton from '$lib/components/RemoveButton.svelte';
	import Section from '$lib/components/Section.svelte';
	import { enhance } from '$app/forms';
	import { isContactFieldKind } from '$lib/contact-fields/kinds';
	import { useI18n } from '$lib/i18n/context.svelte';
	import { hasMessage } from '$lib/i18n/translate';
	import { keepable } from '$lib/pwa/keepable';
	import { isKept, type KeptOf } from '$lib/pwa/outbox';
	import { outbox } from '$lib/pwa/outbox.svelte';
	import { useRemovals } from '$lib/undo/context.svelte';
	import { removalKey, type RemovalKind } from '$lib/undo/keys';
	import { savedEnhance } from '$lib/undo/saved';
	import { INPUT } from './inputs';
	import type { PersonForm, PersonPageData } from './types';

	// The profile's ways to reach someone (docs/02 §2.2): a row of the person page's profile card.
	let { data, form }: { data: PersonPageData; form: PersonForm } = $props();

${I18N()}

${KIND_LABEL()}

${SHOWN()}
${S(s('const visibleFields = '))}

${openState('contact')}
${SAVED()}
${SAVED_THEN()}
${S(s('const keptFields = '))}
${S(s('const fieldForm = '))}
</script>

${S(fieldsRow, { dedent: 'auto' })}
`);

write(`${COMP}/ImportantDatesRow.svelte`, `<script lang="ts">
	import Button from '$lib/components/Button.svelte';
	import DateField from '$lib/components/DateField.svelte';
	import KeptChip from '$lib/components/KeptChip.svelte';
	import RemoveButton from '$lib/components/RemoveButton.svelte';
	import Section from '$lib/components/Section.svelte';
	import { enhance } from '$app/forms';
	import { isImportantDateKind } from '$lib/dates/kinds';
	import { dayLabel } from '$lib/dates/labels';
	import { useI18n } from '$lib/i18n/context.svelte';
	import { hasMessage } from '$lib/i18n/translate';
	import { keepable } from '$lib/pwa/keepable';
	import { isKept, type KeptOf } from '$lib/pwa/outbox';
	import { outbox } from '$lib/pwa/outbox.svelte';
	import { useRemovals } from '$lib/undo/context.svelte';
	import { removalKey, type RemovalKind } from '$lib/undo/keys';
	import { savedEnhance } from '$lib/undo/saved';
	import { INPUT } from './inputs';
	import type { PersonForm, PersonPageData } from './types';

	// The profile's dates (docs/02 §2.13): a row of the person page's profile card.
	let { data, form }: { data: PersonPageData; form: PersonForm } = $props();

${I18N()}

${KIND_LABEL()}

${SHOWN()}
${S(s('const visibleDates = '))}

${S(s('const hasDates = '))}

${openState('dates')}
${SAVED()}
${SAVED_THEN()}
${S(commentOf(svelte, 'const keptFields = '))}
${S(s('const keptDates = '))}
${S(s('const dateForm = '))}
</script>

${S(datesRow, { dedent: 'auto' })}
`);

write(`${COMP}/CirclesRow.svelte`, `<script lang="ts">
	import { circleNameKey } from '$lib/circles/name-key';
	import Button from '$lib/components/Button.svelte';
	import KeptChip from '$lib/components/KeptChip.svelte';
	import RemoveButton from '$lib/components/RemoveButton.svelte';
	import Section from '$lib/components/Section.svelte';
	import { enhance } from '$app/forms';
	import { accentDotStyle } from '$lib/design/tokens';
	import { useI18n } from '$lib/i18n/context.svelte';
	import { keepable } from '$lib/pwa/keepable';
	import { isKept, type KeptOf } from '$lib/pwa/outbox';
	import { outbox } from '$lib/pwa/outbox.svelte';
	import { useRemovals } from '$lib/undo/context.svelte';
	import { removalKey } from '$lib/undo/keys';
	import { savedEnhance } from '$lib/undo/saved';
	import { INPUT } from './inputs';
	import type { PersonForm, PersonPageData } from './types';

	// The circles someone belongs to (docs/02 §2.7): a row of the person page's profile card.
	let { data, form }: { data: PersonPageData; form: PersonForm } = $props();

${I18N()}

${S(s('const removals = useRemovals();'))}
${S(s('const visibleCircles = '))}

${S(s('const circleSummary = '))}

${openState('circles')}
${S({ start: s('let joiningCircleName = ').start, end: s('if (!openSection.circles) joiningCircleName').end })}
${SAVED()}
${SAVED_THEN()}
${S(commentOf(svelte, 'const keptTags = '))}
${S(s('const keptCircles = '))}
${S(s('const circleForm = '))}
</script>

${S(circlesRow, { dedent: 'auto' })}
`);

write(`${COMP}/TagsRow.svelte`, `<script lang="ts">
	import Button from '$lib/components/Button.svelte';
	import KeptChip from '$lib/components/KeptChip.svelte';
	import RemoveButton from '$lib/components/RemoveButton.svelte';
	import Section from '$lib/components/Section.svelte';
	import { enhance } from '$app/forms';
	import { accentChipStyle } from '$lib/design/tokens';
	import { useI18n } from '$lib/i18n/context.svelte';
	import { keepable } from '$lib/pwa/keepable';
	import { isKept, type KeptOf } from '$lib/pwa/outbox';
	import { outbox } from '$lib/pwa/outbox.svelte';
	import { useRemovals } from '$lib/undo/context.svelte';
	import { removalKey, type RemovalKind } from '$lib/undo/keys';
	import { savedEnhance } from '$lib/undo/saved';
	import { INPUT } from './inputs';
	import type { PersonForm, PersonPageData } from './types';

	// Someone's tags (docs/02 §2.8): a row of the person page's profile card.
	let { data, form }: { data: PersonPageData; form: PersonForm } = $props();

${I18N()}

${SHOWN()}
${S(s('const visibleTags = '))}

${S(commentOf(svelte, 'const circleSummary = '))}
${S(s('const tagSummary = '))}

${openState('tags')}
${SAVED()}
${SAVED_THEN()}
${S(s('const keptTags = '))}
${S(s('const tagForm = '))}
</script>

${S(tagsRow, { dedent: 'auto' })}
`);

write(`${COMP}/RecordActions.svelte`, `<script lang="ts">
	import FormError from '$lib/components/FormError.svelte';
	import Button from '$lib/components/Button.svelte';
	import PersonSearchSelect from '$lib/components/PersonSearchSelect.svelte';
	import { enhance } from '$app/forms';
	import { useI18n } from '$lib/i18n/context.svelte';
	import { useRemovals } from '$lib/undo/context.svelte';
	import { savedEnhance } from '$lib/undo/saved';
	import type { PersonForm, PersonPageData } from './types';

	// The record-keeping actions at the foot of the profile card (docs/02 §2.2, §2.1.3).
	let {
		data,
		form,
		otherContacts,
		isSelf,
		archived
	}: {
		data: PersonPageData;
		form: PersonForm;
		/** Everyone visible but this person: whom a duplicate can be. */
		otherContacts: PersonPageData['people'];
		isSelf: boolean;
		archived: boolean;
	} = $props();

${I18N()}
	const removals = useRemovals();

${S(s('const savedArchive = '))}
${S(span(svelte, 'let confirmingDelete = ', 'let mergeTargetId = '))}
</script>

${S(recordActions, { dedent: 'auto' })}
`);

write(`${COMP}/PersonProfile.svelte`, `<script lang="ts">
	import GenderRow from '$lib/components/GenderRow.svelte';
	import Section from '$lib/components/Section.svelte';
	import { useI18n } from '$lib/i18n/context.svelte';
	import CirclesRow from './CirclesRow.svelte';
	import ContactFieldsRow from './ContactFieldsRow.svelte';
	import ImportantDatesRow from './ImportantDatesRow.svelte';
	import RecordActions from './RecordActions.svelte';
	import TagsRow from './TagsRow.svelte';
	import type { PersonForm, PersonPageData } from './types';

	// Who someone is, quietly: the person page's one profile card (docs/05 §5.5).
	let {
		data,
		form,
		otherContacts,
		metLine,
		isSelf,
		archived
	}: {
		data: PersonPageData;
		form: PersonForm;
		otherContacts: PersonPageData['people'];
		metLine: string | null;
		isSelf: boolean;
		archived: boolean;
	} = $props();

${I18N()}
</script>

${S(profileCard, {
	dedent: 3,
	replace: [
		{ range: fieldsRow, lines: ['\t\t\t\t<ContactFieldsRow {data} {form} />'] },
		{ range: datesRow, lines: ['\t\t\t\t<ImportantDatesRow {data} {form} />'] },
		{ range: circlesRow, lines: ['\t\t\t\t<CirclesRow {data} {form} />'] },
		{ range: tagsRow, lines: ['\t\t\t\t<TagsRow {data} {form} />'] },
		{ range: recordActions, lines: ['\t\t\t\t\t<RecordActions {data} {form} {otherContacts} {isSelf} {archived} />'] }
	]
})}
`);

// ---------------------------------------------------------------------------------------------
// Relationships
// ---------------------------------------------------------------------------------------------

write(`${COMP}/RelationshipsSection.svelte`, `<script lang="ts">
	import Button from '$lib/components/Button.svelte';
	import KeptItem from '$lib/components/KeptItem.svelte';
	import PersonSearchSelect from '$lib/components/PersonSearchSelect.svelte';
	import Section from '$lib/components/Section.svelte';
	import { sectionAnchor } from '$lib/contacts/sections';
	import { useI18n } from '$lib/i18n/context.svelte';
	import { isKept, type KeptOf } from '$lib/pwa/outbox';
	import { outbox } from '$lib/pwa/outbox.svelte';
	import { exclusionFor, type Exclusion } from '$lib/relationships/exclusions';
	import type { RelationshipCategory } from '$lib/relationships/categories';
	import { relationshipTypeLabel } from '$lib/relationships/labels';
	import { relationshipTypeOptions } from '$lib/relationships/type-options';
	import type { SelectablePerson } from '$lib/people/select';
	import { useRemovals } from '$lib/undo/context.svelte';
	import { removalKey, type RemovalKind } from '$lib/undo/keys';
	import { untrack } from 'svelte';
	import AddRelationshipForm from './AddRelationshipForm.svelte';
	import KinPanels from './KinPanels.svelte';
	import RelationshipList from './RelationshipList.svelte';
	import type { PersonForm, PersonPageData } from './types';

	/*
	 * Who someone is connected to (docs/02 §2.4): the person page's first card. It holds the
	 * add form's state, so what was being entered outlives closing the form, as it did when the
	 * page held it; the map and list, the worked-out kin and the form itself are its children.
	 */
	let {
		data,
		form,
		otherContacts
	}: {
		data: PersonPageData;
		form: PersonForm;
		/** Candidate targets for a new relationship: everyone visible but this person. */
		otherContacts: PersonPageData['people'];
	} = $props();

${I18N()}

${S(s('let relateOpen = '))}

${SHOWN()}
${S(s('const visibleRelationships = '))}

${S(s('let relationshipTargetId = '))}
${S(s('function closeRelate()'))}
${S(span(svelte, 'const relationshipChoices = ', 'function keptLinkLabel('))}
${S(span(svelte, 'let relationshipChoice = ', 'let pickedTarget = '))}
${S(span(svelte, 'const exclusionOf = (', 'const nameOfContact = '))}
${S(span(svelte, 'let tracingPath = ', 'const pathTarget = '))}
</script>

${S(relSection, {
	dedent: 3,
	replace: [
		{
			range: relList,
			lines: [
				'\t\t\t\t\t<RelationshipList',
				'\t\t\t\t\t\t{data}',
				'\t\t\t\t\t\t{visibleRelationships}',
				'\t\t\t\t\t\t{relationshipChoices}',
				'\t\t\t\t\t\t{exclusionOf}',
				'\t\t\t\t\t\t{nameOfContact}',
				'\t\t\t\t\t\tbind:relateOpen',
				'\t\t\t\t\t/>'
			]
		},
		{ range: kinPanels, lines: ['\t\t\t\t\t<KinPanels {data} />'] },
		{
			range: inner(relEditor),
			lines: [
				'\t\t\t\t\t\t<AddRelationshipForm',
				'\t\t\t\t\t\t\t{data}',
				'\t\t\t\t\t\t\t{otherContacts}',
				'\t\t\t\t\t\t\t{relationshipChoices}',
				'\t\t\t\t\t\t\t{exclusionOf}',
				'\t\t\t\t\t\t\t{nameOfContact}',
				'\t\t\t\t\t\t\t{closeRelate}',
				'\t\t\t\t\t\t\t{keptLinkLabel}',
				'\t\t\t\t\t\t\tbind:relationshipTargetId',
				'\t\t\t\t\t\t\tbind:relationshipChoice',
				'\t\t\t\t\t\t\tbind:pickedTarget',
				'\t\t\t\t\t\t/>'
			]
		}
	]
})}
`);

write(`${COMP}/RelationshipList.svelte`, `<script lang="ts">
	import Button from '$lib/components/Button.svelte';
	import EmptyState from '$lib/components/EmptyState.svelte';
	import DateField from '$lib/components/DateField.svelte';
	import RelationshipMap from '$lib/components/graph/RelationshipMap.svelte';
	import RemoveButton from '$lib/components/RemoveButton.svelte';
	import { enhance } from '$app/forms';
	import { dayLabel } from '$lib/dates/labels';
	import { categoryVar } from '$lib/design/tokens';
	import { withoutRelationships } from '$lib/graph/model/without-pending';
	import { useI18n } from '$lib/i18n/context.svelte';
	import {
		exclusionLabel,
		relationshipRowLabel,
		relationshipStatusLabel,
		relationshipTypeLabel
	} from '$lib/relationships/labels';
	import { groupByExclusion } from '$lib/relationships/picker-groups';
	import { FORMER_RELATIONSHIP_STATUS, RELATIONSHIP_STATUSES } from '$lib/relationships/status';
	import { isChoiceOfLink } from '$lib/relationships/type-options';
	import { usePending } from '$lib/sync/context.svelte';
	import { trackPending } from '$lib/sync/pending';
	import { useRemovals } from '$lib/undo/context.svelte';
	import { removalKey } from '$lib/undo/keys';
	import { savedEnhance } from '$lib/undo/saved';
	import { INPUT } from './inputs';
	import type { ExclusionOf, PersonPageData, RelationshipChoices } from './types';

	// The relationships card's map and its rows, each correctable in place (docs/02 §2.4).
	let {
		data,
		visibleRelationships,
		relationshipChoices,
		exclusionOf,
		nameOfContact,
		relateOpen = $bindable()
	}: {
		data: PersonPageData;
		/** The person's links, less any on its way out (docs/02 §2.23). */
		visibleRelationships: PersonPageData['relationships'];
		relationshipChoices: RelationshipChoices;
		exclusionOf: ExclusionOf;
		/** Whoever a reason is about; both people are on the page already. */
		nameOfContact: (contactId: string) => string;
		/** Whether the card's add form is open; the empty state offers to open it. */
		relateOpen: boolean;
	} = $props();

${I18N()}
	const removals = useRemovals();
${S(s('const graphPending = usePending();'))}

${S(span(svelte, 'const photoById = ', 'const egoNodes = '))}

${S(s('let editingRelationship = '))}
${S(s('const savedRelationshipEdit = '))}
</script>

${S(relList, { dedent: 'auto' })}
`);

write(`${COMP}/KinPanels.svelte`, `<script lang="ts">
	import Button from '$lib/components/Button.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import KinSuggestions from '$lib/components/KinSuggestions.svelte';
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import { useI18n } from '$lib/i18n/context.svelte';
	import { claimEndpoints, confirmedClaimFor, directClaimFor } from '$lib/kinship/claims';
	import { directClaimLabel, kinshipLabel } from '$lib/kinship/labels';
	import { usePending } from '$lib/sync/context.svelte';
	import { trackPending } from '$lib/sync/pending';
	import { useRemovals } from '$lib/undo/context.svelte';
	import type { PersonPageData } from './types';

	/*
	 * What the relationships card works out rather than holds (docs/02 §2.4.1): the links the
	 * one just added implies, the on-demand review, and the kin derived from the entered links.
	 */
	let { data }: { data: PersonPageData } = $props();

${I18N()}
	const removals = useRemovals();
${PENDING}

${S(s('const confirmKin = '))}
</script>

${S(kinPanels, { dedent: 'auto' })}
`);

write(`${COMP}/AddRelationshipForm.svelte`, `<script lang="ts">
	import Button from '$lib/components/Button.svelte';
	import DateField from '$lib/components/DateField.svelte';
	import PersonSearchSelect from '$lib/components/PersonSearchSelect.svelte';
	import { enhance } from '$app/forms';
	import { goto } from '$app/navigation';
	import { proposeHref } from '$lib/contacts/propose';
	import { useI18n } from '$lib/i18n/context.svelte';
	import type { SelectablePerson } from '$lib/people/select';
	import { keepable } from '$lib/pwa/keepable';
	import {
		exclusionLabel,
		relationshipStatusLabel,
		relationshipTypeLabel,
		towardsSubject
	} from '$lib/relationships/labels';
	import { firstPickable, groupByExclusion } from '$lib/relationships/picker-groups';
	import { sinceDateFromBirth } from '$lib/relationships/since';
	import { CURRENT_RELATIONSHIP_STATUS, RELATIONSHIP_STATUSES } from '$lib/relationships/status';
	import { usePending } from '$lib/sync/context.svelte';
	import { trackPending } from '$lib/sync/pending';
	import { useRemovals } from '$lib/undo/context.svelte';
	import { savedEnhance } from '$lib/undo/saved';
	import { INPUT } from './inputs';
	import type { ExclusionOf, PersonPageData, RelationshipChoices } from './types';

	/*
	 * The relationships card's add form (docs/02 §2.4). What is being entered — the other end,
	 * the picked entry — is bound to the card, which outlives this form being opened and closed.
	 */
	let {
		data,
		otherContacts,
		relationshipChoices,
		exclusionOf,
		nameOfContact,
		closeRelate,
		keptLinkLabel,
		relationshipTargetId = $bindable(),
		relationshipChoice = $bindable(),
		pickedTarget = $bindable()
	}: {
		data: PersonPageData;
		otherContacts: PersonPageData['people'];
		relationshipChoices: RelationshipChoices;
		exclusionOf: ExclusionOf;
		nameOfContact: (contactId: string) => string;
		/** Closes the form and lets go of the other end. */
		closeRelate: () => void;
		/** "Child of Bert Brunner", for a kept link. */
		keptLinkLabel: (typeChoice: string, targetId: string) => string;
		/** The other end of the new relationship, as the person picker holds it. */
		relationshipTargetId: string[];
		/** Empty until the picker is touched, which means it stands on its first entry. */
		relationshipChoice: string;
		/** Someone named through the picker itself, not in \`otherContacts\` yet. */
		pickedTarget: SelectablePerson | undefined;
	} = $props();

${I18N()}
	const removals = useRemovals();
${PENDING}
${SAVED_THEN()}

${
	// A prop read once would keep the first \`closeRelate\`; read it when the save lands instead.
	replaceOnce(S(s('const savedRelationship = ')), ', closeRelate));', ', () => closeRelate()));')
}
${S(s('const relationshipForm = '))}
${S(s('const relationshipTarget = $derived'))}
${S(span(svelte, 'const blockedChoice = ', 'const suggestedSince = '))}
</script>

${S(inner(relEditor), { dedent: 'auto' })}
`);

// ---------------------------------------------------------------------------------------------
// Story, notes, photos, mentions
// ---------------------------------------------------------------------------------------------

write(`${COMP}/StorySection.svelte`, `<script lang="ts">
	import Button from '$lib/components/Button.svelte';
	import DateField from '$lib/components/DateField.svelte';
	import KeptItem from '$lib/components/KeptItem.svelte';
	import PersonSearchSelect from '$lib/components/PersonSearchSelect.svelte';
	import Section from '$lib/components/Section.svelte';
	import StoryTimeline from '$lib/components/StoryTimeline.svelte';
	import { enhance } from '$app/forms';
	import { goto } from '$app/navigation';
	import type { JsonCommand } from '$lib/commands/commands';
	import { contactSectionPath, sectionAnchor } from '$lib/contacts/sections';
	import { dayLabel } from '$lib/dates/labels';
	import { useI18n } from '$lib/i18n/context.svelte';
	import {
		INTERACTION_KINDS,
		isInteractionKind,
		KIND_PRESENTATION,
		type InteractionKind
	} from '$lib/interactions/kinds';
	import { keepable } from '$lib/pwa/keepable';
	import { isKept, type KeptOf } from '$lib/pwa/outbox';
	import { outbox } from '$lib/pwa/outbox.svelte';
	import { useRemovals } from '$lib/undo/context.svelte';
	import { savedEnhance } from '$lib/undo/saved';
	import type { SubmitFunction } from '@sveltejs/kit';
	import { ulid } from 'ulid';
	import { INPUT } from './inputs';
	import type { PersonForm, PersonPageData } from './types';

	// What has happened with someone (docs/02 §2.23): the person page's story card and its log form.
	let {
		data,
		form,
		otherContacts,
		logOpen = $bindable()
	}: {
		data: PersonPageData;
		form: PersonForm;
		/** Whom else a touchpoint can name: everyone visible but this person. */
		otherContacts: PersonPageData['people'];
		/** Whether the log form is open; the hero's "Log contact" opens it too. */
		logOpen: boolean;
	} = $props();

${I18N()}
${S(s('const today = '))}
	const removals = useRemovals();
${SAVED_THEN()}

${S(s('let participantIds = '))}

${S(span(svelte, 'const keptLogs = ', 'const logForm: SubmitFunction'))}
</script>

${S(storySection, { dedent: 'auto' })}
`);

write(`${COMP}/NotesSection.svelte`, `<script lang="ts">
	import Button from '$lib/components/Button.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import KeptItem from '$lib/components/KeptItem.svelte';
	import MentionTextarea from '$lib/components/MentionTextarea.svelte';
	import Section from '$lib/components/Section.svelte';
	import { enhance } from '$app/forms';
	import { sectionAnchor } from '$lib/contacts/sections';
	import { useI18n } from '$lib/i18n/context.svelte';
	import { asTyped } from '$lib/mentions/picks';
	import { keepable } from '$lib/pwa/keepable';
	import { isKept, type KeptOf } from '$lib/pwa/outbox';
	import { outbox } from '$lib/pwa/outbox.svelte';
	import { useRemovals } from '$lib/undo/context.svelte';
	import { savedEnhance } from '$lib/undo/saved';
	import type { SubmitFunction } from '@sveltejs/kit';
	import { ulid } from 'ulid';
	import { INPUT } from './inputs';
	import type { PersonForm, PersonPageData } from './types';

	// What was written down about someone (docs/02 §2.5): the person page's notes card.
	let {
		data,
		form,
		otherContacts
	}: {
		data: PersonPageData;
		form: PersonForm;
		/** Whom a note can @-mention: everyone visible but this person. */
		otherContacts: PersonPageData['people'];
	} = $props();

${I18N()}
	const removals = useRemovals();

${notesOpenComment()}
	let openSection = $state({ note: false });
	type SectionName = keyof typeof openSection;
${S({ start: s('let noteVisibility = ').start, end: s('if (!openSection.note && editingNote)').end })}
${SAVED()}
${SAVED_THEN()}
${S(span(svelte, 'function clearNote()', 'const keepNote = '))}
${S(s('const noteForm: SubmitFunction'))}
</script>

${S(notesSection, { dedent: 'auto' })}
`);

const lightbox = withComment(svelte, ifBlock(svelte, '{#if openedPhoto}'));

write(`${COMP}/PhotosSection.svelte`, `<script lang="ts">
	import Button from '$lib/components/Button.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import KeptItem from '$lib/components/KeptItem.svelte';
	import Section from '$lib/components/Section.svelte';
	import { invalidateAll } from '$app/navigation';
	import type { JsonCommand } from '$lib/commands/commands';
	import { sectionAnchor } from '$lib/contacts/sections';
	import { dayLabel } from '$lib/dates/labels';
	import { useI18n } from '$lib/i18n/context.svelte';
	import { processImage } from '$lib/image/process-image';
	import { thumbnailUrl } from '$lib/media/urls';
	import { isKept, type KeptOf, type KeptPhoto } from '$lib/pwa/outbox';
	import { outbox } from '$lib/pwa/outbox.svelte';
	import { reachability } from '$lib/pwa/reachability.svelte';
	import { photoAfterKey } from '$lib/ui/photo-walk';
	import { tick } from 'svelte';
	import { ulid } from 'ulid';
	import { INPUT } from './inputs';
	import PhotoLightbox from './PhotoLightbox.svelte';
	import type { PersonForm, PersonPageData } from './types';

	// What was taken (docs/02 §2.14): the person page's gallery card and its lightbox.
	let { data, form }: { data: PersonPageData; form: PersonForm } = $props();

${I18N()}

${S(span(svelte, 'let picked = ', 'const photoDate = '))}

${S(span(svelte, 'const keptGallery = ', 'async function uploadPhotos('))}

${S(span(svelte, 'const thumbnails: HTMLButtonElement[]', 'function closePhoto()'))}
</script>

${S(photosSection, { dedent: 'auto' })}

<PhotoLightbox {data} {openedPhoto} {photoDate} {closePhoto} {onPhotoKeydown} />
`);

write(`${COMP}/PhotoLightbox.svelte`, `<script lang="ts">
	import Button from '$lib/components/Button.svelte';
	import FrameAsAvatar from '$lib/components/FrameAsAvatar.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import { useI18n } from '$lib/i18n/context.svelte';
	import { mediaUrl } from '$lib/media/urls';
	import { INPUT } from './inputs';
	import type { PersonPageData } from './types';

	let {
		data,
		openedPhoto,
		photoDate,
		closePhoto,
		onPhotoKeydown
	}: {
		data: PersonPageData;
		/** The gallery photo being looked at, or null with the lightbox closed. */
		openedPhoto: PersonPageData['gallery'][number] | null;
		/** When a gallery photo was added, in the viewer's language (docs/02 §2.14). */
		photoDate: (createdAt: number) => string;
		/** Closes the lightbox and hands focus back to the photo's thumbnail. */
		closePhoto: () => void;
		/** The arrow keys walk the grid. */
		onPhotoKeydown: (event: KeyboardEvent) => void;
	} = $props();

${I18N()}
</script>

${S(lightbox, { dedent: 0 })}
`);

write(`${COMP}/MentionsSection.svelte`, `<script lang="ts">
	import Icon from '$lib/components/Icon.svelte';
	import Section from '$lib/components/Section.svelte';
	import { sectionAnchor } from '$lib/contacts/sections';
	import { dayLabel } from '$lib/dates/labels';
	import { useI18n } from '$lib/i18n/context.svelte';
	import type { PersonPageData } from './types';

	let { data }: { data: PersonPageData } = $props();

${I18N()}
</script>

${S(mentionsSection, { dedent: 'auto' })}
`);

// ---------------------------------------------------------------------------------------------
// The route: a thin composition
// ---------------------------------------------------------------------------------------------

const pageProps = s('let { data, form }: { data: PageData; form: ActionData }');
const pageComment = commentOf(svelte, 'let { data, form }: { data: PageData; form: ActionData }');
if (svelte.lines[pageComment.end]!.trim() !== '*/') fail("the page's own comment changed; check the route below");

write(`${ROUTE}/+page.svelte`, `<script lang="ts">
	import MentionsSection from '$lib/components/person/MentionsSection.svelte';
	import NotesSection from '$lib/components/person/NotesSection.svelte';
	import PersonHeader from '$lib/components/person/PersonHeader.svelte';
	import PersonProfile from '$lib/components/person/PersonProfile.svelte';
	import PhotosSection from '$lib/components/person/PhotosSection.svelte';
	import RelationshipsSection from '$lib/components/person/RelationshipsSection.svelte';
	import StorySection from '$lib/components/person/StorySection.svelte';
	import { useI18n } from '$lib/i18n/context.svelte';
	import type { ActionData, PageData } from './$types';

${S({ start: pageComment.start, end: pageComment.end - 1 })}
	 *
	 * Each card is its own component under \`$lib/components/person/\`; this page lays them out
	 * and holds only what more than one of them shares.
${S({ start: pageComment.end, end: pageProps.end })}
${S(s('const otherContacts = '))}

${I18N()}

${S(s('let logOpen = '))}

${S(s('function logContact()'))}

${S(s('const metLine = '))}

${S(span(svelte, 'const archived = ', 'const isSelf = '))}
</script>

${S({ start: containing(svelte, '<svelte:head>'), end: containing(svelte, '<svelte:head>') })}

${S(main, {
	replace: [
		{ range: header, lines: ['\t<PersonHeader {data} {form} {metLine} {isSelf} {archived} {logContact} />'] },
		{ range: profileCard, lines: ['\t\t\t<PersonProfile {data} {form} {otherContacts} {metLine} {isSelf} {archived} />'] },
		{ range: relSection, lines: ['\t\t\t<RelationshipsSection {data} {form} {otherContacts} />'] },
		{ range: storySection, lines: ['\t\t\t<StorySection {data} {form} {otherContacts} bind:logOpen />'] },
		{ range: notesSection, lines: ['\t\t\t<NotesSection {data} {form} {otherContacts} />'] },
		{ range: photosSection, lines: ['\t\t\t<PhotosSection {data} {form} />'] },
		{ range: mentionsSection, lines: ['\t\t\t<MentionsSection {data} />'] }
	]
})}
`);

// ---------------------------------------------------------------------------------------------
// Server: load and actions
// ---------------------------------------------------------------------------------------------

write(
	`${ROUTE}/review-path.ts`,
	replaceOnce(
		replaceOnce(T(span(server, 'const REVIEW_PARAM = ', 'const reviewPath = ')), 'const REVIEW_PARAM', 'export const REVIEW_PARAM'),
		'const reviewPath',
		'export const reviewPath'
	)
);

/*
 * Out of `+page.server.ts`, an annotated `load` would type `PageData` as the annotation rather
 * than as what it returns; `satisfies` checks it the same way and keeps the return type.
 */
let loadBody = T(stmt(server, 'export const load: PageServerLoad = '));
loadBody = replaceOnce(loadBody, 'export const load: PageServerLoad = async (', 'export const load = (async (');
if (!loadBody.endsWith('\n};')) fail('load no longer ends with `};`');
loadBody = loadBody.slice(0, -'\n};'.length) + '\n}) satisfies PageServerLoad;';

write(`${ROUTE}/load.ts`, `import { error, redirect } from '@sveltejs/kit';
import { CONTACT_FIELD_KINDS } from '$lib/contact-fields/kinds';
import { parseProposePair } from '$lib/contacts/propose';
import { listContactFields } from '$lib/server/domain/contact-fields/contact-fields';
import {
	listCirclesForContact,
	listRoleSuggestionsByCircleName
} from '$lib/server/domain/circles/circles';
import { getContact } from '$lib/server/domain/contacts/contacts';
import { listImportantDates } from '$lib/server/domain/dates/important-dates';
import { IMPORTANT_DATE_KINDS } from '$lib/dates/kinds';
import { INTERACTION_KINDS, lastContactedOn } from '$lib/server/domain/interactions/interactions';
import { authorNames } from '$lib/server/domain/household/members';
import { listStoryPage } from '$lib/server/domain/story/story';
import { listGallery } from '$lib/server/domain/media/gallery';
import { contactSectionPath, sectionForLegacyTab } from '$lib/contacts/sections';
import { personMap } from '$lib/graph/model/person-map';
import { listMentionedIn } from '$lib/server/domain/mentions/mentioned-in';
import { listNotesForContact } from '$lib/server/domain/notes/notes';
import { readFamilyOf } from '$lib/server/domain/relationships/family';
import { listTagsForContact, TAG_COLORS } from '$lib/server/domain/tags/tags';
import {
	getContactDeps,
	getContactFieldDeps,
	getCircleDeps,
	getImportantDateDeps,
	getInteractionDeps,
	getNoteDeps,
	getGalleryDeps,
	getFamilyReadDeps,
	getPhotos,
	getRelationshipTypes,
	getStoryDeps,
	getTagDeps,
	getMemberDeps,
	getMentionedInDeps
} from '$lib/server/services';
import type { Viewer } from '$lib/server/access/visibility';
import { say, translator } from '$lib/server/i18n/say';
import { allOf } from '$lib/async/all-of';
import {
	birthdayOf,
	declinedBy,
	circleNamesIn,
	fieldView,
	mentionedInView,
	noteView,
	peopleNamedIn,
	withReasonsSaid,
	type PersonViewContext
} from './person-view';
import { REVIEW_PARAM } from './review-path';
import { entryIdsOf, nameLookup, photosByEntry, STORY_PAGE_SIZE, toStoryItem } from './story-view';
import type { PageServerLoad } from './$types';

${loadBody}

${T(stmt(server, 'function readPersonPage('))}
`);

interface ActionsModule {
	file: string;
	name: string;
	imports: string;
	doc: string;
	helpers?: Range[];
	schemas?: Range[];
	actions: string[];
}

function actionsModule(module: ActionsModule) {
	let out = `${module.imports.trim()}\nimport type { Actions } from '../$types';\n\n`;
	if (module.helpers?.length) out += `${module.helpers.map(T).join('\n\n')}\n\n`;
	if (module.schemas?.length) out += `${module.schemas.map(T).join('\n\n')}\n\n`;
	out += `${module.doc}\nexport const ${module.name} = {\n${module.actions.map((name) => T(action(name))).join('\n\n')}\n} satisfies Actions;\n`;
	write(`${ROUTE}/actions/${module.file}`, out);
}

const COMMAND_IMPORTS = `
import { dispatchCommand } from '$lib/server/domain/commands/dispatch';
import { parseCommand } from '$lib/server/commands/parse';
import { ulidGenerator } from '$lib/server/id';
import { systemClock } from '$lib/server/clock';`;

actionsModule({
	file: 'profile.ts',
	name: 'profileActions',
	imports: `
import { error, fail, redirect } from '@sveltejs/kit';
import * as v from 'valibot';
import { GENDERS } from '$lib/people/gender';
import {
	editProfile,
	EmptyContactNameError,
	InvalidGenderError,
	setGender,
	getContact
} from '$lib/server/domain/contacts/contacts';
import { InvalidAvatarError, setContactAvatar } from '$lib/server/domain/media/avatars';
import { getAvatarDeps, getContactDeps } from '$lib/server/services';
import { say, translator } from '$lib/server/i18n/say';`,
	doc: '/** The hero: name, description, face, and the gender on the profile card (docs/02 §2.2). */',
	schemas: [span(server, 'const EditProfileSchema = ', 'const GenderSchema = ')],
	actions: ['editProfile', 'setGender', 'setAvatar']
});

actionsModule({
	file: 'record.ts',
	name: 'recordActions',
	imports: `
import { error, fail, redirect } from '@sveltejs/kit';
import * as v from 'valibot';
import { requireAdmin } from '$lib/server/auth/guards';
import {
	archiveContact,
	deleteContact,
	mergeContacts,
	restoreContact
} from '$lib/server/domain/contacts/contacts';
import { pruneOrphanTags } from '$lib/server/domain/tags/tags';
import {
	getContactDeps,
	getDeleteContactDeps,
	getSelfContactDeps,
	getTagDeps
} from '$lib/server/services';
import {
	setSelfContact,
	UnknownSelfContactError
} from '$lib/server/domain/household/self-contact';
import { say, translator } from '$lib/server/i18n/say';`,
	doc: '/** The record itself, from the foot of the profile card (docs/02 §2.2, §2.1.3). */',
	actions: ['merge', 'delete', 'archive', 'setSelf', 'restore']
});

actionsModule({
	file: 'relationships.ts',
	name: 'relationshipActions',
	imports: `${COMMAND_IMPORTS}
import { fail, redirect } from '@sveltejs/kit';
import * as v from 'valibot';
import { RELATIONS } from '$lib/suggestions/types';
import { proposeHref } from '$lib/contacts/propose';
import { decodeRelationshipChoice } from '$lib/relationships/type-options';
import { contactSectionPath } from '$lib/contacts/sections';
import {
	ContradictoryRelationshipError,
	DuplicateRelationshipError,
	editRelationship,
	InvalidRelationshipDetailsError,
	removeRelationship,
	RelationshipExcludedError
} from '$lib/server/domain/relationships/relationships';
import {
	acceptClaim,
	declineClaim,
	restoreClaim
} from '$lib/server/relationships/suggestion-answers';
import { getCommandDeps, getRelationshipDeps } from '$lib/server/services';
import { say, translator } from '$lib/server/i18n/say';
import { reviewPath } from '../review-path';`,
	doc: '/** The relationships card: links, their corrections, and the answers to suggestions (docs/02 §2.4). */',
	helpers: [stmt(server, 'async function parseAnswer(')],
	schemas: [
		span(server, 'const RelationshipDetailsSchema = ', 'const EditRelationshipSchema = '),
		span(server, 'const AnswerSuggestionSchema = ', 'const AddProposedSchema = ')
	],
	actions: [
		'addRelationship',
		'editRelationship',
		'removeRelationship',
		'addProposedRelationship',
		'dismissSuggestion',
		'restoreSuggestion'
	]
});

actionsModule({
	file: 'notes.ts',
	name: 'noteActions',
	imports: `${COMMAND_IMPORTS}
import { fail, redirect } from '@sveltejs/kit';
import * as v from 'valibot';
import { getCommandDeps } from '$lib/server/services';
import { say, translator } from '$lib/server/i18n/say';`,
	doc: '/** The notes card (docs/02 §2.5). */',
	schemas: [stmt(server, 'const AddNoteSchema = ')],
	actions: ['addNote']
});

actionsModule({
	file: 'fields.ts',
	name: 'fieldActions',
	imports: `${COMMAND_IMPORTS}
import { error, fail, redirect } from '@sveltejs/kit';
import * as v from 'valibot';
import { CONTACT_FIELD_KINDS } from '$lib/contact-fields/kinds';
import { getContact } from '$lib/server/domain/contacts/contacts';
import { getCommandDeps, getContactDeps, getContactFields } from '$lib/server/services';
import { say, translator } from '$lib/server/i18n/say';`,
	doc: "/** The profile card's ways to reach someone (docs/02 §2.2). */",
	schemas: [stmt(server, 'const AddFieldSchema = ')],
	actions: ['addField', 'removeField']
});

actionsModule({
	file: 'dates.ts',
	name: 'dateActions',
	imports: `${COMMAND_IMPORTS}
import { error, fail, redirect } from '@sveltejs/kit';
import * as v from 'valibot';
import { getContact } from '$lib/server/domain/contacts/contacts';
import { IMPORTANT_DATE_KINDS } from '$lib/dates/kinds';
import { getCommandDeps, getContactDeps, getImportantDates } from '$lib/server/services';
import { say, translator } from '$lib/server/i18n/say';`,
	doc: "/** The profile card's dates (docs/02 §2.13). */",
	schemas: [stmt(server, 'const AddDateSchema = ')],
	actions: ['addDate', 'removeDate']
});

actionsModule({
	file: 'story.ts',
	name: 'storyActions',
	imports: `${COMMAND_IMPORTS}
import { error, fail, redirect } from '@sveltejs/kit';
import * as v from 'valibot';
import { getContact } from '$lib/server/domain/contacts/contacts';
import { deleteInteraction, INTERACTION_KINDS } from '$lib/server/domain/interactions/interactions';
import { deleteJournalEntry } from '$lib/server/domain/journal/journal';
import { contactSectionPath } from '$lib/contacts/sections';
import {
	getCommandDeps,
	getContactDeps,
	getInteractionDeps,
	getJournalDeps
} from '$lib/server/services';
import { say, translator } from '$lib/server/i18n/say';`,
	doc: '/** The story card: touchpoints logged, and entries taken back (docs/02 §2.23). */',
	schemas: [stmt(server, 'const LogInteractionSchema = ')],
	actions: ['logInteraction', 'removeInteraction', 'removeJournalEntry']
});

actionsModule({
	file: 'tags.ts',
	name: 'tagActions',
	imports: `${COMMAND_IMPORTS}
import { error, fail, redirect } from '@sveltejs/kit';
import * as v from 'valibot';
import { getContact } from '$lib/server/domain/contacts/contacts';
import { TAG_COLORS, unassignTag } from '$lib/server/domain/tags/tags';
import { getCommandDeps, getContactDeps, getTagDeps } from '$lib/server/services';
import { say, translator } from '$lib/server/i18n/say';`,
	doc: "/** The profile card's tags (docs/02 §2.8). */",
	schemas: [stmt(server, 'const AddTagSchema = ')],
	actions: ['addTag', 'removeTag']
});

actionsModule({
	file: 'photos.ts',
	name: 'photoActions',
	imports: `
import { dispatchCommand } from '$lib/server/domain/commands/dispatch';
import { parseCommand, parsePhotoCommand } from '$lib/server/commands/parse';
import { ulidGenerator } from '$lib/server/id';
import { systemClock } from '$lib/server/clock';
import { error, fail, redirect } from '@sveltejs/kit';
import * as v from 'valibot';
import { getContact } from '$lib/server/domain/contacts/contacts';
import { InvalidAvatarError } from '$lib/server/domain/media/avatars';
import {
	captionGalleryPhoto,
	CaptionTooLongError,
	pinGalleryPhoto,
	removeGalleryPhoto,
	setGalleryPhotoVisibility
} from '$lib/server/domain/media/gallery';
import { frameAsAvatar } from '$lib/server/domain/media/framing';
import { contactSectionPath } from '$lib/contacts/sections';
import {
	getCommandDeps,
	getContactDeps,
	getFramingDeps,
	getGalleryDeps
} from '$lib/server/services';
import { say, translator } from '$lib/server/i18n/say';`,
	doc: '/** The gallery card and its lightbox (docs/02 §2.14). */',
	schemas: [span(server, 'const VisibilitySchema = ', 'const PhotoPinSchema = ')],
	actions: ['addGalleryPhotos', 'captionPhoto', 'setPhotoVisibility', 'pinPhoto', 'framePhotoAsAvatar', 'removePhoto']
});

actionsModule({
	file: 'circles.ts',
	name: 'circleActions',
	imports: `${COMMAND_IMPORTS}
import { error, fail, redirect } from '@sveltejs/kit';
import { getContact } from '$lib/server/domain/contacts/contacts';
import { removeMember } from '$lib/server/domain/circles/circles';
import { getCircleDeps, getCommandDeps, getContactDeps } from '$lib/server/services';
import { say, translator } from '$lib/server/i18n/say';`,
	doc: "/** The profile card's circles (docs/02 §2.7). */",
	actions: ['joinCircle', 'leaveCircle']
});

write(`${ROUTE}/+page.server.ts`, `import { circleActions } from './actions/circles';
import { dateActions } from './actions/dates';
import { fieldActions } from './actions/fields';
import { noteActions } from './actions/notes';
import { photoActions } from './actions/photos';
import { profileActions } from './actions/profile';
import { recordActions } from './actions/record';
import { relationshipActions } from './actions/relationships';
import { storyActions } from './actions/story';
import { tagActions } from './actions/tags';
import type { Actions } from './$types';

/*
 * The person page (docs/02 §2.2, docs/05 §5.5). What it reads is \`load.ts\`; what its forms
 * post is grouped in \`actions/\` the way the page groups its cards, so each card's actions sit
 * in one short file rather than in one long list.
 */
export { load } from './load';

export const actions = {
	...profileActions,
	...recordActions,
	...relationshipActions,
	...noteActions,
	...fieldActions,
	...dateActions,
	...storyActions,
	...tagActions,
	...photoActions,
	...circleActions
} satisfies Actions;
`);

// ---------------------------------------------------------------------------------------------
// Nothing left behind
// ---------------------------------------------------------------------------------------------

/** The old files' imports and wiring, which the glue above rewrites per file. */
const lastImport = (src: Source, text: string) => ({ start: 0, end: containing(src, text) });
retire(svelte, lastImport(svelte, "import type { ActionData, PageData } from './$types';"));
for (const tag of ['<script lang="ts">', '</script>']) retire(svelte, { start: startingWith(svelte, tag), end: startingWith(svelte, tag) });
retire(server, lastImport(server, "import type { Actions, PageServerLoad } from './$types';"));
const actionsObject = startingWith(server, 'export const actions: Actions = {');
retire(server, { start: actionsObject, end: actionsObject });
retire(server, { start: statementEnd(server, actionsObject), end: statementEnd(server, actionsObject) });

let leftBehind = 0;
for (const src of [svelte, server]) {
	src.lines.forEach((line, i) => {
		if (isBlank(line) || src.used.has(i)) return;
		leftBehind++;
		console.error(`${src.name}:${i + 1}: went nowhere: ${line.trim()}`);
	});
}
if (leftBehind > 0) fail(`${leftBehind} line(s) of the old files went nowhere; add them to a module above`);

console.log(`split the person page at ${ref} into ${written.length} files:`);
for (const path of written) console.log(`  ${path}`);
