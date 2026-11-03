/*
 * Reading one field of an archive document (docs/02 §2.15). The document is a file somebody
 * hands us, so each reader takes what is there in the shape it should have and turns anything
 * else into null — the caller decides whether a row without it is still worth restoring.
 */

export type Row = Record<string, unknown>;

export const record = (value: unknown): Row | null =>
	typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Row) : null;

/** A list of sub-records, skipping anything that is not one. */
export function records(row: Row, key: string): Row[] {
	const value = row[key];
	if (!Array.isArray(value)) return [];
	return value.map(record).filter((entry): entry is Row => entry !== null);
}

/** A list of ids, skipping anything that is not one. */
export function ids(row: Row, key: string): string[] {
	const value = row[key];
	if (!Array.isArray(value)) return [];
	return value.filter((entry): entry is string => typeof entry === 'string' && entry.length > 0);
}

export function str(row: Row, key: string): string | null {
	const value = row[key];
	if (typeof value === 'string') return value.length > 0 ? value : null;
	// YAML numbers and booleans in a text field: keep the text rather than lose the value.
	if (typeof value === 'number' || typeof value === 'boolean') return String(value);
	return null;
}

export function int(row: Row, key: string): number | null {
	const value = row[key];
	return typeof value === 'number' && Number.isFinite(value) ? Math.trunc(value) : null;
}

/** A measure that may carry a fraction, such as a framing's square. */
export function real(row: Row, key: string): number | null {
	const value = row[key];
	return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

export const bool = (row: Row, key: string): boolean => row[key] === true;

/** An ISO instant back to the epoch milliseconds the database stores. */
export function ms(row: Row, key: string): number | null {
	const value = row[key];
	if (value instanceof Date) return value.getTime();
	if (typeof value === 'number' && Number.isFinite(value)) return value;
	const text = str(row, key);
	if (text === null) return null;
	const parsed = Date.parse(text);
	return Number.isNaN(parsed) ? null : parsed;
}

export const visibilityOf = (row: Row): 'shared' | 'private' =>
	str(row, 'visibility') === 'private' ? 'private' : 'shared';
