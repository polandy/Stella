import type { GraphDataSource, Neighborhood } from './types';

/*
 * A GraphDataSource that fetches neighbourhoods from the server's JSON endpoint. Because the
 * builders (buildEgoNetwork / expandNode / findConnectionPath) are isomorphic, the very same
 * pure code that runs on the server during SSR also drives in-browser expansion and path
 * search — the browser just swaps this fetch-backed source for the Drizzle one. Access scoping
 * still happens server-side; a 404 means "not visible or absent" and maps to null.
 */

export interface HttpGraphSourceOptions {
	/** Endpoint that answers `?id=<nodeId>` with a Neighborhood JSON (or 404). */
	endpoint?: string;
	/** Injectable fetch (SvelteKit's `fetch` during load; global otherwise). */
	fetch?: typeof fetch;
}

export function createHttpGraphSource(options: HttpGraphSourceOptions = {}): GraphDataSource {
	const endpoint = options.endpoint ?? '/graph/api';
	const doFetch = options.fetch ?? fetch;

	return {
		async neighborhood(nodeId: string): Promise<Neighborhood | null> {
			const res = await doFetch(`${endpoint}?id=${encodeURIComponent(nodeId)}`);
			if (res.status === 404) return null;
			if (!res.ok) throw new Error(`Graph source request failed (${res.status}).`);
			return (await res.json()) as Neighborhood;
		}
	};
}
