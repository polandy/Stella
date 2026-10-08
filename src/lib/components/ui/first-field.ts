/*
 * Which control a freshly opened form should put the cursor in (docs/05 §5.7).
 *
 * Stated here rather than inside `Section.svelte` because getting it wrong fails silently:
 * several of the app's forms open with `<input type="hidden">` rows, and focusing one of
 * those does nothing at all — the form would look like it ignored the click.
 */

/** As much of a control as the choice depends on. */
export interface FieldCandidate {
	/** Lower- or upper-case tag name; only `input` carries a meaningful `type`. */
	tagName: string;
	type?: string;
	disabled?: boolean;
	/** The DOM writes `hidden="until-found"` as a string; anything set at all means hidden. */
	hidden?: boolean | string;
}

/** Every control a form can open on, in document order. */
export const FIELD_SELECTOR = 'input, select, textarea, button, [tabindex]:not([tabindex="-1"])';

/**
 * The first control that can actually take focus, or `null` for a form made of nothing but
 * hidden or disabled ones — in which case the caller leaves focus where the reader put it.
 */
export function firstField<T extends FieldCandidate>(controls: readonly T[]): T | null {
	return controls.find((control) => canTakeFocus(control)) ?? null;
}

function canTakeFocus(control: FieldCandidate): boolean {
	if (control.disabled === true || (control.hidden ?? false) !== false) return false;
	return !(control.tagName.toLowerCase() === 'input' && control.type?.toLowerCase() === 'hidden');
}
