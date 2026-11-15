import { TranslatableError } from '../../../i18n/translatable';
import { phrase } from '../../../i18n/phrase';

/*
 * A birth year estimated from an age (docs/dev/02 §2.13.1): kept on the contact as
 * `birth_date = 'YYYY'`, `precision = 'age'` (docs/dev/03 §3.4), one value with no history.
 */

/** The oldest age an estimate may stand for, as the date field takes it. */
const MAX_AGE = 150;
/** A device ahead of the server's clock may already be in the next year. */
const CLOCK_LEAD_MS = 14 * 60 * 60 * 1000;

/** Thrown when an estimated birth year is no year, in the future or past the oldest age. */
export class InvalidBirthEstimateError extends TranslatableError {
	constructor() {
		super(phrase('errors.date.estimateOutOfRange', { max: MAX_AGE }), 'InvalidBirthEstimateError');
	}
}

/** Refuse a year that is not four digits, after this year or more than `MAX_AGE` years back. */
export function checkBirthEstimate(year: string, now: number): void {
	const latest = new Date(now + CLOCK_LEAD_MS).getUTCFullYear();
	const earliest = new Date(now - CLOCK_LEAD_MS).getUTCFullYear() - MAX_AGE;
	if (!/^\d{4}$/.test(year) || Number(year) > latest || Number(year) < earliest) {
		throw new InvalidBirthEstimateError();
	}
}
