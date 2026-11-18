import * as v from 'valibot';
import { FULL_DATE_SHAPE } from '../dates/calendar';
import { MONTH_SHAPE, WHEN_AGE_MAX, WHEN_AGE_MIN, WHEN_KINDS, type WhenKind } from './when';

/* A when as a command carries it (docs/dev/04 §4.11.2); the use-case judges it against the person. */

const age = v.pipe(v.number(), v.integer(), v.minValue(WHEN_AGE_MIN), v.maxValue(WHEN_AGE_MAX));

const SHAPES = {
	from_age: v.object({ kind: v.literal('from_age'), age }),
	at_age: v.object({ kind: v.literal('at_age'), age }),
	christmas_at_age: v.object({ kind: v.literal('christmas_at_age'), age }),
	on_date: v.object({
		kind: v.literal('on_date'),
		on: v.pipe(v.string(), v.regex(FULL_DATE_SHAPE))
	}),
	in_month: v.object({ kind: v.literal('in_month'), on: v.pipe(v.string(), v.regex(MONTH_SHAPE)) }),
	later: v.object({ kind: v.literal('later') })
};

/** A when of one of `kinds`: each record type names the ones it offers. */
export function whenSchemaOf<K extends WhenKind>(kinds: readonly K[]) {
	return v.variant(
		'kind',
		kinds.map((kind) => SHAPES[kind] as (typeof SHAPES)[K])
	);
}

/** A when on a command: absent is *now* on an addition and *as it was* on an edit; null is *now*. */
export function optionalWhenOf<K extends WhenKind>(kinds: readonly K[]) {
	return v.optional(v.nullable(whenSchemaOf(kinds)));
}

export const WhenSchema = whenSchemaOf(WHEN_KINDS);

/** Any when on a command, as `optionalWhenOf` reads it. */
export const optionalWhen = optionalWhenOf(WHEN_KINDS);
