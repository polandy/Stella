import { DEMO_ADMIN_EMAIL } from '../db/demo-seed';
import type { FakeImmichGroupPhotos, FakeImmichLibrary, FakeImmichPerson } from './fake-gateway';

/*
 * The demo household's Immich (`IMMICH_DEMO=true`): faces named like the people the demo seed
 * creates, so *Find in Immich* has someone to find, and each has as many photos as its count for
 * the strip to show. The key belongs to the demo admin, as a household's key belongs to its
 * admin (docs/04 ADR-102). One face is hidden and one unnamed, as in a real
 * library; neither is ever offered. Two share a name and one has a first name only, so the
 * matching list has a maybe of each kind; Sandra's and Rosa's double names are only half there.
 * A few more are nobody in Stella yet, for *New from Immich*.
 */

/** A face of the demo library: a fixed id, a name, a photo count and a tile colour. */
const face = (
	id: string,
	name: string,
	assets: number,
	color: string,
	hidden = false
): FakeImmichPerson => ({
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
		together: demoTogether(),
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
			face('d0000000-0000-4000-8000-00000000000e', 'Timo', 58, '#dd7878'),
			// For *New from Immich*: named faces nobody in Stella holds. Ursula and Thomas have
			// namesakes in Stella to compare with first; Andrea and Pius go straight to the form.
			face('d0000000-0000-4000-8000-00000000000f', 'Grosi Ursula', 420, '#40a02b'),
			face('d0000000-0000-4000-8000-000000000010', 'Thomas W.', 12, '#df8e1d'),
			face('d0000000-0000-4000-8000-000000000011', 'Andrea Meier', 77, '#8839ef'),
			face('d0000000-0000-4000-8000-000000000012', 'Pius', 5, '#179299')
		]
	};
}

const MARKUS = 'd0000000-0000-4000-8000-000000000001';
const SANDRA = 'd0000000-0000-4000-8000-000000000002';
const LENA = 'd0000000-0000-4000-8000-000000000003';
const NOAH = 'd0000000-0000-4000-8000-000000000004';
const ELIAS = 'd0000000-0000-4000-8000-000000000005';
const HANS = 'd0000000-0000-4000-8000-000000000006';
const ROSA = 'd0000000-0000-4000-8000-000000000007';

/**
 * The photos the Brunners share, so *You and Sandra* and *Together* on a relationship row have
 * something to show (docs/02 §2.24.8): the couple, the family, a parent with each
 * child, the grandparents. Ids under `e…-9000-…`, apart from every face's.
 */
function demoTogether(): FakeImmichGroupPhotos[] {
	const group = (
		n: number,
		personIds: string[],
		assets: number,
		color: string
	): FakeImmichGroupPhotos => ({
		id: `e0000000-0000-4000-9000-${n.toString(16).padStart(12, '0')}`,
		personIds,
		assets,
		color
	});
	return [
		group(1, [MARKUS, SANDRA], 48, '#7287fd'),
		group(2, [MARKUS, SANDRA, LENA, NOAH, ELIAS], 120, '#04a5e5'),
		group(3, [SANDRA, LENA], 36, '#dd7878'),
		group(4, [MARKUS, NOAH], 30, '#179299'),
		group(5, [SANDRA, ELIAS], 22, '#fe640b'),
		group(6, [HANS, ROSA], 40, '#e64553'),
		group(7, [HANS, ROSA, MARKUS], 15, '#8839ef')
	];
}
