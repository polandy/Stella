import { describe, expect, it } from 'bun:test';
import { createHttpGraphSource } from './http-source';
import { buildEgoNetwork } from './ego-network';
import { familyNodes, familyEdges, fakeGraphSource } from './fixtures';
import type { Neighborhood } from './types';

/*
 * The fetch-backed GraphDataSource (docs/04 §4.11). A fake fetch lets us prove it maps 404 →
 * null and, crucially, that the isomorphic builders run over it unchanged — the same code
 * path the browser uses for live expansion.
 */

function fetchFor(source = fakeGraphSource(familyNodes, familyEdges)): typeof fetch {
	return (async (input: string | URL | Request) => {
		const url = new URL(String(input), 'http://x');
		const id = url.searchParams.get('id')!;
		const hood = await source.neighborhood(id);
		if (!hood) return new Response(null, { status: 404 });
		return new Response(JSON.stringify(hood), { status: 200 });
	}) as typeof fetch;
}

describe('createHttpGraphSource', () => {
	it('requests the endpoint with the id and parses the neighbourhood', async () => {
		let requested = '';
		const fakeFetch = (async (input: string | URL | Request) => {
			requested = String(input);
			const hood: Neighborhood = {
				center: { id: 'mara', kind: 'person', label: 'Mara' },
				nodes: [{ id: 'jonas', kind: 'person', label: 'Jonas' }],
				edges: [{ id: 'r1', source: 'mara', target: 'jonas', kind: 'relationship' }]
			};
			return new Response(JSON.stringify(hood), { status: 200 });
		}) as typeof fetch;

		const source = createHttpGraphSource({ endpoint: '/graph/api', fetch: fakeFetch });
		const hood = await source.neighborhood('mara');
		expect(requested).toBe('/graph/api?id=mara');
		expect(hood?.nodes[0].id).toBe('jonas');
	});

	it('maps a 404 to null', async () => {
		const fakeFetch = (async () => new Response(null, { status: 404 })) as unknown as typeof fetch;
		const source = createHttpGraphSource({ fetch: fakeFetch });
		expect(await source.neighborhood('nobody')).toBeNull();
	});

	it('throws on a non-ok, non-404 response', async () => {
		const fakeFetch = (async () => new Response(null, { status: 500 })) as unknown as typeof fetch;
		const source = createHttpGraphSource({ fetch: fakeFetch });
		expect(source.neighborhood('x')).rejects.toThrow();
	});

	it('drives buildEgoNetwork exactly like the direct source', async () => {
		const http = createHttpGraphSource({ fetch: fetchFor() });
		const model = await buildEgoNetwork(http, 'mara', 1);
		expect(new Set(model.nodes.map((n) => n.id))).toEqual(
			new Set(['mara', 'jonas', 'lio', 'peter', 'simon', 'sarah', 'tobias', 'kegel', 'walter'])
		);
	});
});
