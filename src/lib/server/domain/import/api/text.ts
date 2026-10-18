/** A document's optional text as stored: trimmed, and null when nothing is left. */
export const orNull = (value: string | null): string | null => {
	const trimmed = (value ?? '').trim();
	return trimmed.length > 0 ? trimmed : null;
};
