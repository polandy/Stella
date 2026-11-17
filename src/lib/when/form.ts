import * as v from 'valibot';
import { optionalWhen } from './schema';
import type { When } from './when';

/*
 * A when as the picker posts it (`WhenPicker.svelte`): `whenKind` with `now` for *now*, the age
 * or the day beside it. Read into the payload's shape, untrusted still — `WhenSchema` judges it.
 */

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
	if (kind === 'on_date') return { kind, on: read(WHEN_FIELDS.on) ?? '' };
	return { kind };
}

/** The posted when, checked as a command carries it; null when it is not one. */
export function parsedWhenFromForm(
	read: (key: string) => string | null
): { when: When | null | undefined } | null {
	const parsed = v.safeParse(optionalWhen, whenFromForm(read));
	return parsed.success ? { when: parsed.output } : null;
}
