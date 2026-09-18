import * as v from 'valibot';
import { FULL_DATE_SHAPE, isRealCalendarDay } from '$lib/dates/calendar';
import { CIRCLE_KINDS } from '$lib/server/domain/circles/circles';
import { CONTACT_FIELD_KINDS } from '$lib/server/domain/contact-fields/contact-fields';
import type {
	ApiCircle,
	ApiImportDocument,
	ApiPerson
} from '$lib/server/domain/import/api/document';

/*
 * The import API's front door (docs/02 §2.16.1). The body is untrusted JSON from a script, so
 * its shape is settled here, at the boundary, before the domain sees a typed document. Objects
 * are strict: a field Stella does not know is refused rather than dropped, because `birthday`
 * for `birthDate` would otherwise vanish without a word and the caller would never find out.
 *
 * A problem's `message` is Valibot's and English: it is a diagnostic for whoever writes the
 * script. The contract a program reacts to is the `path` (and the planner's codes).
 */

/** A ref or a source: short, and safe as part of a record id and a URL. */
const HANDLE = /^[A-Za-z0-9_-]{1,64}$/;
/** Enough for any real class list or family, and a stop for a runaway loop in a script. */
const MAX_PEOPLE = 5000;
const MAX_RELATIONSHIPS = 10000;
const MAX_CIRCLES = 200;
const MAX_FIELDS_PER_PERSON = 50;
const MAX_TEXT = 1000;
const MAX_ID = 128;

const handle = v.pipe(v.string(), v.regex(HANDLE, 'Use 1–64 letters, digits, "-" or "_".'));
const text = v.optional(v.nullable(v.pipe(v.string(), v.maxLength(MAX_TEXT))), null);
const recordId = v.pipe(v.string(), v.minLength(1), v.maxLength(MAX_ID));
const realDay = (shape: RegExp, expected: string) =>
	v.optional(
		v.nullable(
			v.pipe(
				v.string(),
				v.regex(shape, `Expected ${expected}.`),
				v.check(isRealCalendarDay, 'That day does not exist.')
			)
		),
		null
	);
const day = realDay(FULL_DATE_SHAPE, 'YYYY-MM-DD');
const birthDate = realDay(
	/^(\d{4}-\d{2}-\d{2}|--\d{2}-\d{2})$/,
	'YYYY-MM-DD, or --MM-DD when the year is unknown'
);

const field = v.strictObject({
	kind: v.picklist(CONTACT_FIELD_KINDS),
	value: v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(MAX_TEXT)),
	label: text
});

interface NameFields {
	displayName: string | null;
	firstName: string | null;
	lastName: string | null;
	nickname: string | null;
}

const hasAName = (p: NameFields) =>
	[p.displayName, p.firstName, p.lastName, p.nickname].some((name) => (name ?? '').trim() !== '');

const newPerson = v.pipe(
	v.strictObject({
		ref: handle,
		displayName: text,
		firstName: text,
		lastName: text,
		nickname: text,
		description: text,
		birthDate,
		fields: v.optional(v.pipe(v.array(field), v.maxLength(MAX_FIELDS_PER_PERSON)), [])
	}),
	v.check(
		(person) => hasAName(person),
		'A person needs a displayName, firstName, lastName or nickname.'
	)
);

const existingPerson = v.strictObject({ ref: handle, existingId: recordId });

const membership = v.strictObject({
	person: handle,
	role: text,
	startDate: day,
	endDate: day
});
const members = v.optional(v.pipe(v.array(membership), v.maxLength(MAX_PEOPLE)), []);

const newCircle = v.strictObject({
	ref: handle,
	name: v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(MAX_TEXT)),
	kind: v.optional(v.nullable(v.picklist(CIRCLE_KINDS)), null),
	description: text,
	startDate: day,
	endDate: day,
	parent: v.optional(v.nullable(handle), null),
	members
});

const existingCircle = v.strictObject({ ref: handle, existingId: recordId, members });

/*
 * People and circles come in two shapes told apart by `existingId`. Picking the shape by that
 * key, instead of a Valibot union, keeps each problem at the field that is wrong rather than
 * reporting that the entry matched neither shape.
 */
const document = v.strictObject({
	source: handle,
	visibility: v.optional(v.nullable(v.picklist(['shared', 'private'])), null),
	people: v.optional(v.pipe(v.array(v.looseObject({})), v.maxLength(MAX_PEOPLE)), []),
	relationships: v.optional(
		v.pipe(
			v.array(
				v.strictObject({
					from: handle,
					to: handle,
					type: v.pipe(v.string(), v.minLength(1), v.maxLength(MAX_ID))
				})
			),
			v.maxLength(MAX_RELATIONSHIPS)
		),
		[]
	),
	circles: v.optional(v.pipe(v.array(v.looseObject({})), v.maxLength(MAX_CIRCLES)), [])
});

/** One problem per value: a day that is not `YYYY-MM-DD` is not also "a day that does not exist". */
const PARSE_CONFIG = { abortPipeEarly: true } as const;

/** One shape problem, at the place it is wrong. */
export interface ApiDocumentProblem {
	code: 'invalid';
	/** `people[2].birthDate`; empty for the body as a whole. */
	path: string;
	message: string;
}

export type ApiDocumentReading =
	{ ok: true; document: ApiImportDocument } | { ok: false; problems: ApiDocumentProblem[] };

/** `people[2].birthDate`, from Valibot's path. */
function pathOf(prefix: string, issue: v.BaseIssue<unknown>): string {
	let path = prefix;
	for (const item of issue.path ?? []) {
		path +=
			typeof item.key === 'number'
				? `[${item.key}]`
				: `${path === '' ? '' : '.'}${String(item.key)}`;
	}
	return path;
}

/** An unknown key is reported where it is, not on the object that holds it. */
function problemsOf(prefix: string, issues: readonly v.BaseIssue<unknown>[]): ApiDocumentProblem[] {
	return issues.map((issue) => {
		const unknownKey =
			issue.kind === 'schema' && issue.type === 'strict_object' && issue.expected === 'never';
		const path = pathOf(prefix, issue);
		return { code: 'invalid', path, message: unknownKey ? 'Unknown field.' : issue.message };
	});
}

/** Parse one entry against its shape, collecting problems under `prefix`. */
function readEntry<S extends v.GenericSchema>(
	schema: S,
	entry: unknown,
	prefix: string,
	problems: ApiDocumentProblem[]
): v.InferOutput<S> | null {
	const result = v.safeParse(schema, entry, PARSE_CONFIG);
	if (result.success) return result.output;
	problems.push(...problemsOf(prefix, result.issues));
	return null;
}

const pointsAtExisting = (entry: object) => 'existingId' in entry;

/**
 * The entries of a list in the body, whatever else is wrong with it, so they are read too. An
 * entry that is not an object is left to the outer reading, which has already named it; its
 * position is kept so every path still points at the right one.
 */
const entriesOf = (body: object, key: string): [object, number][] => {
	const list: unknown = (body as Record<string, unknown>)[key];
	if (!Array.isArray(list)) return [];
	return list.flatMap((entry: unknown, index) =>
		typeof entry === 'object' && entry !== null ? [[entry, index] as [object, number]] : []
	);
};

/** Read a request body into a document, or say everything that is wrong with its shape. */
export function readApiImportDocument(body: unknown): ApiDocumentReading {
	if (typeof body !== 'object' || body === null || Array.isArray(body)) {
		return {
			ok: false,
			problems: [{ code: 'invalid', path: '', message: 'Expected a JSON object.' }]
		};
	}
	const outer = v.safeParse(document, body, PARSE_CONFIG);
	// Problems anywhere in the body are reported together, so the entries are read even when
	// something at the top is wrong — a script fixes its output in one round.
	const problems: ApiDocumentProblem[] = outer.success ? [] : problemsOf('', outer.issues);

	const people: ApiPerson[] = [];
	for (const [entry, index] of entriesOf(body, 'people')) {
		const read: ApiPerson | null = readEntry(
			pointsAtExisting(entry) ? existingPerson : newPerson,
			entry,
			`people[${index}]`,
			problems
		);
		if (read) people.push(read);
	}
	const circles: ApiCircle[] = [];
	for (const [entry, index] of entriesOf(body, 'circles')) {
		const read: ApiCircle | null = readEntry(
			pointsAtExisting(entry) ? existingCircle : newCircle,
			entry,
			`circles[${index}]`,
			problems
		);
		if (read) circles.push(read);
	}
	if (!outer.success || problems.length > 0) return { ok: false, problems: sortedByPath(problems) };

	const { source, visibility, relationships } = outer.output;
	return { ok: true, document: { source, visibility, people, relationships, circles } };
}

/** The body's own order: top-level keys as the document lists them, entries by position. */
const SECTION_ORDER = ['source', 'visibility', 'people', 'relationships', 'circles'];

function sortedByPath(problems: ApiDocumentProblem[]): ApiDocumentProblem[] {
	const rank = (path: string) => {
		const section = SECTION_ORDER.indexOf(/^[a-z]+/i.exec(path)?.[0] ?? '');
		const index = Number(/^\w+\[(\d+)\]/.exec(path)?.[1] ?? -1);
		return [section === -1 ? SECTION_ORDER.length : section, index] as const;
	};
	return [...problems].sort((a, b) => {
		const [sa, ia] = rank(a.path);
		const [sb, ib] = rank(b.path);
		return sa - sb || ia - ib;
	});
}
