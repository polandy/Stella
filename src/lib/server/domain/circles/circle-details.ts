import { TranslatableError } from '../../../i18n/translatable';
import { phrase } from '../../../i18n/phrase';

/*
 * What a circle says about itself — name, kind, colour, description, period — read and checked
 * once for both creating and editing it (docs/02 §2.4.2), so the two forms never disagree on
 * what a valid circle is.
 */

export const CIRCLE_KINDS = [
	'friends',
	'family',
	'school',
	'class',
	'course',
	'club',
	'team',
	'work',
	'neighborhood',
	'other'
] as const;
export type CircleKind = (typeof CIRCLE_KINDS)[number];

export const CIRCLE_COLORS = [
	'rosewater',
	'flamingo',
	'pink',
	'mauve',
	'red',
	'maroon',
	'peach',
	'yellow',
	'green',
	'teal',
	'sky',
	'sapphire',
	'blue',
	'lavender'
] as const;
export type CircleColor = (typeof CIRCLE_COLORS)[number];

export function resolveCircleKind(kind: string | null | undefined): CircleKind {
	const trimmed = (kind ?? '').trim();
	if (trimmed === '') return 'other';
	if ((CIRCLE_KINDS as readonly string[]).includes(trimmed)) return trimmed as CircleKind;
	throw new Error(`Unknown circle kind: ${trimmed}`);
}

export function resolveCircleColor(color: string | null | undefined): CircleColor {
	const trimmed = (color ?? '').trim();
	if (trimmed === '') return 'blue';
	if ((CIRCLE_COLORS as readonly string[]).includes(trimmed)) return trimmed as CircleColor;
	throw new Error(`Unknown circle colour: ${trimmed}`);
}

/** What a circle says about itself, as the create and edit forms set it. */
export interface CircleDetails {
	name: string;
	description: string | null;
	kind: CircleKind;
	color: CircleColor;
	startDate: string | null;
	endDate: string | null;
}

/** The details as a form posts them: free text, checked by `readCircleDetails`. */
export interface CircleDetailsInput {
	name: string;
	kind?: string | null;
	color?: string | null;
	description?: string | null;
	startDate?: string | null;
	endDate?: string | null;
}

/** A circle is found by its name, so it cannot have none. */
export class BlankCircleNameError extends TranslatableError {
	constructor() {
		super(phrase('errors.circle.needName'), 'BlankCircleNameError');
	}
}

/** A period that ends before it starts was mistyped; storing it would sort the circle wrongly. */
export class CirclePeriodBackwardsError extends TranslatableError {
	constructor() {
		super(phrase('errors.circle.periodBackwards'), 'CirclePeriodBackwardsError');
	}
}

/** The circle is not there for this viewer: never visible to them, or deleted meanwhile. */
export class CircleGoneError extends TranslatableError {
	constructor() {
		super(phrase('errors.circle.notFound'), 'CircleGoneError');
	}
}

const orNull = (value?: string | null): string | null => {
	const trimmed = (value ?? '').trim();
	return trimmed.length > 0 ? trimmed : null;
};

/**
 * Whether `end` lies before `start`. Both are ISO dates, but an imported one may stop at the
 * month or the year (docs/03 `circle`), so they are compared at the coarser of the two
 * precisions: `2025` does not end before `2025-08-18`.
 */
export function endsBeforeItStarts(start: string, end: string): boolean {
	const precision = Math.min(start.length, end.length);
	return end.slice(0, precision) < start.slice(0, precision);
}

/** The details as stored: trimmed, blanks defaulted or null. Throws on what cannot be stored. */
export function readCircleDetails(input: CircleDetailsInput): CircleDetails {
	const name = input.name.trim();
	if (name === '') throw new BlankCircleNameError();
	const startDate = orNull(input.startDate);
	const endDate = orNull(input.endDate);
	if (startDate !== null && endDate !== null && endsBeforeItStarts(startDate, endDate)) {
		throw new CirclePeriodBackwardsError();
	}
	return {
		name,
		kind: resolveCircleKind(input.kind),
		color: resolveCircleColor(input.color),
		description: orNull(input.description),
		startDate,
		endDate
	};
}
