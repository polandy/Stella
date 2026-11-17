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
