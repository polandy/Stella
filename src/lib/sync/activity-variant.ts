/*
 * How the app shows that it is working (docs/05 §5.7). The shapes are being compared against
 * each other, so the choice is a name rather than a scattering of class names, and the URL may
 * carry it (`?bar=pill`) while the workbench is open.
 */

/** `bar`: a line along the top. `pill`: a label under the top edge. `corner`: one by the toasts. */
export const ACTIVITY_VARIANTS = ['bar', 'pill', 'corner'] as const;

export type ActivityVariant = (typeof ACTIVITY_VARIANTS)[number];

export const DEFAULT_ACTIVITY_VARIANT: ActivityVariant = 'bar';

/** Reads a variant off the URL; anything the app does not know is simply the default. */
export function parseActivityVariant(value: string | null): ActivityVariant {
	return (ACTIVITY_VARIANTS as readonly string[]).includes(value ?? '')
		? (value as ActivityVariant)
		: DEFAULT_ACTIVITY_VARIANT;
}
