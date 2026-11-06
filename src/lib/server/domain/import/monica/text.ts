/** Monica's optional text as stored: trimmed, and null when nothing is left. */
export const orNull = (value: string | null | undefined): string | null => {
	const trimmed = (value ?? '').trim();
	return trimmed.length > 0 ? trimmed : null;
};

/** Humanise Monica's snake_case activity/life-event keys: `ate_restaurant` → "ate restaurant". */
export const humanise = (key: string) => key.replace(/_/g, ' ');
