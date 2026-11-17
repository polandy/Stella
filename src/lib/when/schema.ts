import * as v from 'valibot';
import { FULL_DATE_SHAPE } from '../dates/calendar';
import { WHEN_AGE_MAX, WHEN_AGE_MIN } from './when';

/* A when as a command carries it (docs/dev/04 §4.11.2); the use-case judges it against the person. */

const age = v.pipe(v.number(), v.integer(), v.minValue(WHEN_AGE_MIN), v.maxValue(WHEN_AGE_MAX));

export const WhenSchema = v.variant('kind', [
	v.object({ kind: v.picklist(['from_age', 'at_age']), age }),
	v.object({ kind: v.literal('on_date'), on: v.pipe(v.string(), v.regex(FULL_DATE_SHAPE)) }),
	v.object({ kind: v.literal('later') })
]);

/** A when on a command: absent is *now* on an addition and *as it was* on an edit; null is *now*. */
export const optionalWhen = v.optional(v.nullable(WhenSchema));
