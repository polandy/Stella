/**
 * The `takenAt` field of an upload form (docs/02 §2.14): null when the picture said nothing.
 * Whatever is there goes on to the use-case to be judged, so a field that is not text becomes
 * text that will not read — refused, rather than quietly dropped.
 */
export function takenAtField(form: FormData): string | null {
	const value = form.get('takenAt');
	if (value === null) return null;
	return typeof value === 'string' ? value : '';
}
