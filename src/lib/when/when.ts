/*
 * When an idea is meant for (docs/dev/02 §2.25.8): the intent, never a worked-out day, so it
 * follows a birthday that is corrected later. Shared by every record that can wait for its time;
 * `null` everywhere means *now*, which is what a record without a when has always meant.
 */

import { FULL_DATE_SHAPE } from '../dates/calendar';

/** The ways a record can wait: from an age on, for one birthday, for a day, or for later. */
export const WHEN_KINDS = ['from_age', 'at_age', 'on_date', 'later'] as const;

export type WhenKind = (typeof WHEN_KINDS)[number];

/** The ages a when can name; a stepper and the payload schema both stop here. */
export const WHEN_AGE_MIN = 1;
export const WHEN_AGE_MAX = 150;

/** A when other than *now*: an age (from it on, or that one birthday), a day, or later. */
export type When =
	| { kind: 'from_age' | 'at_age'; age: number }
	| { kind: 'on_date'; on: string }
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
			return { whenKind: when.kind, whenOn: null, whenAge: when.age };
		case 'on_date':
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
			if (whenAge === null) throw new Error(`A ${whenKind} when without an age`);
			return { kind: whenKind, age: whenAge };
		case 'on_date':
			if (whenOn === null) throw new Error('An on_date when without a day');
			return { kind: whenKind, on: whenOn };
		case 'later':
			return { kind: whenKind };
		default:
			throw new Error(`Not a when: ${String(whenKind)}`);
	}
}

/**
 * A when as a file outside Stella says it, such as an archive: one that does not hold together
 * — an unknown kind, an age out of range, a day not shaped as one — is taken as *now*.
 */
export function whenFromOutside(columns: {
	whenKind: string | null;
	whenOn: string | null;
	whenAge: number | null;
}): When | null {
	const { whenKind, whenOn, whenAge } = columns;
	if (whenKind === 'from_age' || whenKind === 'at_age') {
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
	return whenKind === 'later' ? { kind: whenKind } : null;
}

/** Whether two whens say the same. */
export function sameWhen(a: When | null, b: When | null): boolean {
	const x = whenColumns(a);
	const y = whenColumns(b);
	return x.whenKind === y.whenKind && x.whenOn === y.whenOn && x.whenAge === y.whenAge;
}
