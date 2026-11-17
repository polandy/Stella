import * as v from 'valibot';
import { optionalWhenOf } from './schema';
import type { When, WhenKind } from './when';

/* A when as `WhenPicker.svelte` posts it, read into the payload's shape; `WhenSchema` judges it. */

/** The fields the picker posts. */
export const WHEN_FIELDS = { kind: 'whenKind', age: 'whenAge', on: 'whenOn' } as const;

/** The posted when: undefined when the form had no picker, null for *now*. */
export function whenFromForm(read: (key: string) => string | null): unknown {
	const kind = read(WHEN_FIELDS.kind);
	if (kind === null || kind === '') return undefined;
	if (kind === 'now') return null;
	if (kind === 'from_age' || kind === 'at_age') {
		return { kind, age: Number(read(WHEN_FIELDS.age) ?? '') };
	}
	if (kind === 'on_date' || kind === 'in_month') return { kind, on: read(WHEN_FIELDS.on) ?? '' };
	return { kind };
}

/** The posted when, checked as a command of a record offering `kinds` carries it; null when not one. */
export function parsedWhenFromForm(
	read: (key: string) => string | null,
	kinds: readonly WhenKind[]
): { when: When | null | undefined } | null {
	const parsed = v.safeParse(optionalWhenOf(kinds), whenFromForm(read));
	return parsed.success ? { when: parsed.output } : null;
}
