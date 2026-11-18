/* When a record is meant for (docs/dev/02 §2.25.8); `null` everywhere means *now*. */

import { FULL_DATE_SHAPE } from '../dates/calendar';

/** The ways a record can wait: from an age on, for one birthday, for Christmas at an age, for a day or a month, or later. */
export const WHEN_KINDS = [
	'from_age',
	'at_age',
	'christmas_at_age',
	'on_date',
	'in_month',
	'later'
] as const;

export type WhenKind = (typeof WHEN_KINDS)[number];

/** The ages a when can name; a stepper and the payload schema both stop here. */
export const WHEN_AGE_MIN = 1;
export const WHEN_AGE_MAX = 150;

/** A month as `YYYY-MM`. */
export const MONTH_SHAPE = /^\d{4}-(0[1-9]|1[0-2])$/;

/** The kinds that name an age. */
export const AGE_WHEN_KINDS = ['from_age', 'at_age', 'christmas_at_age'] as const;

export type AgeWhenKind = (typeof AGE_WHEN_KINDS)[number];

/** Whether a kind names an age. */
export const isAgeKind = (kind: string): kind is AgeWhenKind =>
	(AGE_WHEN_KINDS as readonly string[]).includes(kind);

/** A when other than *now*: an age (from it on, that one birthday, or that Christmas), a day, a month, or later. */
export type When =
	| { kind: AgeWhenKind; age: number }
	| { kind: 'on_date'; on: string }
	/** `on` is the month, `YYYY-MM`. */
	| { kind: 'in_month'; on: string }
	| { kind: 'later' };

/** The three columns a record keeps its when in; all null for *now*. */
export interface WhenColumns {
	whenKind: WhenKind | null;
	whenOn: string | null;
	whenAge: number | null;
}

/** The columns that store `when`. */
export function whenColumns(when: When | null): WhenColumns {
	if (when === null) return { whenKind: null, whenOn: null, whenAge: null };
	switch (when.kind) {
		case 'from_age':
		case 'at_age':
		case 'christmas_at_age':
			return { whenKind: when.kind, whenOn: null, whenAge: when.age };
		case 'on_date':
		case 'in_month':
			return { whenKind: when.kind, whenOn: when.on, whenAge: null };
		case 'later':
			return { whenKind: when.kind, whenOn: null, whenAge: null };
	}
}

/** The when stored in these columns. A row the use-cases never write is a fault, said loud. */
export function whenOfColumns(columns: WhenColumns): When | null {
	const { whenKind, whenOn, whenAge } = columns;
	switch (whenKind) {
		case null:
			return null;
		case 'from_age':
		case 'at_age':
		case 'christmas_at_age':
			if (whenAge === null) throw new Error(`A ${whenKind} when without an age`);
			return { kind: whenKind, age: whenAge };
		case 'on_date':
		case 'in_month':
			if (whenOn === null) throw new Error(`An ${whenKind} when without a day`);
			return { kind: whenKind, on: whenOn };
		case 'later':
			return { kind: whenKind };
		default:
			throw new Error(`Not a when: ${String(whenKind)}`);
	}
}

/** A when as a file outside Stella says it, such as an archive; one that does not hold together is *now*. */
export function whenFromOutside(columns: {
	whenKind: string | null;
	whenOn: string | null;
	whenAge: number | null;
}): When | null {
	const { whenKind, whenOn, whenAge } = columns;
	if (whenKind !== null && isAgeKind(whenKind)) {
		const fits =
			whenAge !== null &&
			Number.isInteger(whenAge) &&
			whenAge >= WHEN_AGE_MIN &&
			whenAge <= WHEN_AGE_MAX;
		return fits ? { kind: whenKind, age: whenAge } : null;
	}
	if (whenKind === 'on_date') {
		return whenOn !== null && FULL_DATE_SHAPE.test(whenOn) ? { kind: whenKind, on: whenOn } : null;
	}
	if (whenKind === 'in_month') {
		return whenOn !== null && MONTH_SHAPE.test(whenOn) ? { kind: whenKind, on: whenOn } : null;
	}
	return whenKind === 'later' ? { kind: whenKind } : null;
}

/** Whether two whens say the same. */
export function sameWhen(a: When | null, b: When | null): boolean {
	const x = whenColumns(a);
	const y = whenColumns(b);
	return x.whenKind === y.whenKind && x.whenOn === y.whenOn && x.whenAge === y.whenAge;
}
