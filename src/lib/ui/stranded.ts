/**
 * Where an address that led nowhere was meant to go, so the error screen can offer the way
 * back to its list (docs/design/screens/across-screens.md): a stale link to a merged or
 * deleted person, a circle that was dissolved, or `/settings/immich` on a Stella without
 * Immich. Any failure other than *not found* is `failed` — the server's own message says why.
 */
export type StrandedPlace = 'person' | 'circle' | 'immich' | 'settings' | 'elsewhere' | 'failed';

export function strandedPlace(status: number, pathname: string): StrandedPlace {
	if (status !== 404) return 'failed';
	const [first, second] = pathname.split('/').filter(Boolean);
	if (first === 'contacts') return 'person';
	if (first === 'circles') return 'circle';
	if (first === 'settings') return second === 'immich' ? 'immich' : 'settings';
	return 'elsewhere';
}
