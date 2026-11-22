/*
 * What a gift was worth (docs/dev/02 §2.25.16): a whole number, no decimals, in the one currency
 * the instance is configured with. Pure, so the form, the command and the row read it alike.
 */

/** Nine digits: far past any gift, and safe in a SQLite integer and a JSON number. */
export const MAX_VALUE = 999_999_999;

/** A value read back from outside (an archive): only a whole number in range is one, else none. */
export const storedValueOf = (raw: unknown): number | null =>
	typeof raw === 'number' && Number.isInteger(raw) && raw >= 0 && raw <= MAX_VALUE ? raw : null;

/** The amount a form field posted: a whole number, null when blank, `invalid` for anything else. */
export function valueFromForm(raw: string | null | undefined): number | null | 'invalid' {
	const typed = (raw ?? '').replace(/[\s'’]/g, '');
	if (typed === '') return null;
	if (!/^\d{1,9}$/.test(typed)) return 'invalid';
	return Number(typed);
}

/** The amount with the instance's currency after it, as a row shows it. */
export function valueLabel(value: number, currency: string, locale: string): string {
	const amount = new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(value);
	return currency === '' ? amount : `${amount} ${currency}`;
}
