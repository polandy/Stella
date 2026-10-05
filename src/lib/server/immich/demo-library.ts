import { DEMO_ADMIN_EMAIL } from '../db/demo-seed';
import type { FakeImmichLibrary, FakeImmichPerson } from './fake-gateway';

/*
 * The demo household's Immich (`IMMICH_DEMO=true`): faces named like the people the demo seed
 * creates, so *Find in Immich* has someone to find, and each has as many photos as its count for
 * the strip to show. The key belongs to the demo admin, as a household's key belongs to its
 * admin (docs/concepts/immich.md §9.2). One face is hidden and one unnamed, as in a real
 * library; neither is ever offered. Two share a name and one has a first name only, so the
 * matching list has a maybe of each kind; Sandra's and Rosa's double names are only half there.
 */

/** A face of the demo library: a fixed id, a name, a photo count and a tile colour. */
const face = (id: string, name: string, assets: number, color: string, hidden = false): FakeImmichPerson => ({
	id,
	name,
	assets,
	color,
	hidden
});

/** A fresh copy each call, so nothing one server changes can leak into another's. */
export function demoImmichLibrary(): FakeImmichLibrary {
	return {
		version: { major: 3, minor: 2, patch: 4 },
		owner: { name: 'Demo', email: DEMO_ADMIN_EMAIL },
		people: [
			face('d0000000-0000-4000-8000-000000000001', 'Markus Brunner', 2841, '#1e66f5'),
			face('d0000000-0000-4000-8000-000000000002', 'Sandra Brunner', 2310, '#8839ef'),
			face('d0000000-0000-4000-8000-000000000003', 'Lena Brunner', 1764, '#ea76cb'),
			face('d0000000-0000-4000-8000-000000000004', 'Noah Brunner', 1502, '#40a02b'),
			face('d0000000-0000-4000-8000-000000000005', 'Elias Brunner', 893, '#df8e1d'),
			face('d0000000-0000-4000-8000-000000000006', 'Hans Brunner', 312, '#179299'),
			face('d0000000-0000-4000-8000-000000000007', 'Rosa Brunner', 287, '#d20f39'),
			face('d0000000-0000-4000-8000-000000000008', 'Thomas Widmer', 96, '#209fb5'),
			face('d0000000-0000-4000-8000-000000000009', 'Mia Widmer', 1, '#fe640b'),
			face('d0000000-0000-4000-8000-00000000000a', 'Corinne Keller', 154, '#7287fd', true),
			face('d0000000-0000-4000-8000-00000000000b', '', 41, '#6c6f85'),
			// For *Find your people*: two faces with one name, side by side, and one named by a first
			// name alone — both asked about rather than linked in one tap.
			face('d0000000-0000-4000-8000-00000000000c', 'Luca Widmer', 210, '#04a5e5'),
			face('d0000000-0000-4000-8000-00000000000d', 'Luca Widmer', 3, '#e64553'),
			face('d0000000-0000-4000-8000-00000000000e', 'Timo', 58, '#dd7878')
		]
	};
}
