import { expect, test, type Page } from '@playwright/test';
import { signIn } from './app';
import {
	arrangeBy,
	clickFrame,
	clickNode,
	filterMenu,
	kinshipLineId,
	settled,
	stateOf
} from './graph-canvas';
import { circleIdOf, LINK, personIdOf, seedHousehold } from './seed';

/*
 * Grouping a circle's members by role on the map (docs/02 §2.7, docs/05 §5.8). Written after
 * the maintainer tried it in the running app (docs/08 §8.4.1).
 *
 * Read-only against the demo household, save the last case, which seeds its own family: the
 * others centre Lena and open her Turnverein, whose two
 * "Aktive" — Sandra and Franziska, friends with each other — are the only role held twice.
 * Lena (Kinderriege) and Beat (Leiter) hold theirs alone and stay ordinary nodes; Sandra is
 * Lena's mother, a link from inside the group to somebody outside it.
 */

const LENA = 'demo-c-lena';
const TURNVEREIN = 'demo-circle-turnverein';
const SANDRA = 'demo-c-sandra';
const FRANZISKA = 'demo-c-franziska';
const BEAT = 'demo-c-beat';
const AKTIVE = `rolegroup:${TURNVEREIN}:=Aktive`;

/** What the renderer holds about the grouping right now, read off the running core. */
async function groupingOnCanvas(page: Page) {
	return page.evaluate(
		({ group, circle, a, b, outsider, alone }) => {
			type Collection = {
				empty(): boolean;
				length: number;
				style(name: string): string;
				data(key: string): string;
				parent(): Collection;
				id(): string;
				filter(fn: (e: Collection) => boolean): Collection;
			};
			let el: HTMLElement | null = document.querySelector('canvas');
			while (el && !('_cyreg' in el)) el = el.parentElement;
			const cy = (
				el as unknown as {
					_cyreg: { cy: { $id(id: string): Collection; edges(): Collection } };
				}
			)._cyreg.cy;
			const parentOf = (id: string) => {
				const parent = cy.$id(id).parent();
				return parent.empty() ? null : parent.id();
			};
			const between = (x: string, y: string) =>
				cy
					.edges()
					.filter(
						(e) =>
							(e.data('source') === x && e.data('target') === y) ||
							(e.data('source') === y && e.data('target') === x)
					);
			const shown = (edges: Collection) =>
				edges.filter((e) => e.style('display') !== 'none').length;
			return {
				frame: !cy.$id(group).empty(),
				parents: { a: parentOf(a), b: parentOf(b), alone: parentOf(alone) },
				/** Lines from the circle to the group, and to each member, that are actually drawn. */
				circleToGroup: shown(between(circle, group)),
				circleToMembers: shown(between(circle, a)) + shown(between(circle, b)),
				/** The friendship between the two members, drawn or tucked away. */
				inner: shown(between(a, b)),
				/** A member's links to somebody outside the group, drawn to the member herself. */
				outside: shown(between(a, outsider))
			};
		},
		{ group: AKTIVE, circle: TURNVEREIN, a: SANDRA, b: FRANZISKA, outsider: LENA, alone: BEAT }
	);
}

/** Lena's map with her Turnverein opened, every role of it on the canvas. */
async function openTurnverein(page: Page) {
	await page.goto(`/graph?center=${LENA}`);
	await settled(page);
	await clickNode(page, TURNVEREIN);
	const peek = page.getByRole('complementary');
	await expect(peek.getByText('Turnverein Länggasse')).toBeVisible();
	await peek.getByRole('button', { name: 'Expand connections' }).click();
	await expect.poll(() => stateOf(page, FRANZISKA)).toBe('drawn');
	await peek.getByRole('button', { name: 'Close' }).click();
	await settled(page);
}

async function toggle(page: Page, name: string) {
	const menu = await filterMenu(page);
	await menu.getByRole('menuitemcheckbox', { name: new RegExp(`^${name}`) }).click();
	await page.keyboard.press('Escape');
	await settled(page);
}

test.beforeEach(async ({ page }) => {
	await signIn(page);
});

test('stands a role’s people in one group, on one line to the circle, their link between them drawn', async ({
	page
}) => {
	await openTurnverein(page);

	// Off by default: each member on a line of their own, nobody framed.
	const before = await groupingOnCanvas(page);
	expect(before).toMatchObject({ frame: false, parents: { a: null, b: null }, circleToMembers: 2 });
	expect(before.outside, 'Sandra is Lena’s mother').toBeGreaterThan(0);
	const menu = await filterMenu(page);
	await expect(menu.getByRole('menuitemcheckbox', { name: /^Group by role/ })).toHaveAttribute(
		'aria-checked',
		'false'
	);
	await page.keyboard.press('Escape');

	await toggle(page, 'Group by role');

	await expect
		.poll(() => groupingOnCanvas(page))
		.toEqual({
			frame: true,
			// A role held once — Beat, the one Leiter — stays an ordinary node.
			parents: { a: AKTIVE, b: AKTIVE, alone: null },
			circleToGroup: 1,
			circleToMembers: 0,
			inner: 1,
			// The link out of the group still runs to Sandra, not to the frame.
			outside: before.outside
		});
});

test('tucks the links within a group away when that switch is off', async ({ page }) => {
	await openTurnverein(page);
	await toggle(page, 'Group by role');
	await expect.poll(async () => (await groupingOnCanvas(page)).inner).toBe(1);

	await toggle(page, 'Links within groups');

	await expect.poll(async () => (await groupingOnCanvas(page)).inner).toBe(0);
	// Still there to be shown: tapping Sandra names her friendship again. Nobody else stands
	// under her group's frame, so the tap reaches her wherever the layout put the group.
	await clickNode(page, SANDRA);
	await expect(page.getByRole('complementary').getByText('Sandra Brunner-Keller')).toBeVisible();
	await expect.poll(async () => (await groupingOnCanvas(page)).inner).toBe(1);
});

/**
 * Everyone drawn who is not in a group but reaches into a group's frame, as `frame ⊃ node`:
 * such a node hides a member's name and takes their tap. Model boxes, names included.
 */
async function underFrames(page: Page): Promise<string[]> {
	return page.evaluate(() => {
		type Box = { x1: number; y1: number; x2: number; y2: number };
		type Node = {
			id(): string;
			isParent(): boolean;
			isChild(): boolean;
			visible(): boolean;
			boundingBox(o: object): Box;
		};
		let el: HTMLElement | null = document.querySelector('canvas');
		while (el && !('_cyreg' in el)) el = el.parentElement;
		const cy = (el as unknown as { _cyreg: { cy: { nodes(): { toArray(): Node[] } } } })._cyreg.cy;
		const nodes = cy
			.nodes()
			.toArray()
			.filter((n) => n.visible());
		const box = (n: Node) => n.boundingBox({ includeLabels: true, includeOverlays: false });
		const meet = (a: Box, b: Box) => a.x1 < b.x2 && b.x1 < a.x2 && a.y1 < b.y2 && b.y1 < a.y2;
		return nodes
			.filter((f) => f.isParent())
			.flatMap((frame) =>
				nodes
					.filter((n) => !n.isParent() && !n.isChild() && meet(box(frame), box(n)))
					.map((n) => `${frame.id()} ⊃ ${n.id()}`)
			);
	});
}

test('leaves nobody outside a group standing under its frame', async ({ page }) => {
	await openTurnverein(page);
	await toggle(page, 'Group by role');
	await expect.poll(async () => (await groupingOnCanvas(page)).frame).toBe(true);

	// Settled, so this is where everyone came to rest, not a moment of the glide there.
	await settled(page);
	expect(await underFrames(page)).toEqual([]);
});

test('a tapped group lists its people and can be shown individually', async ({ page }) => {
	await openTurnverein(page);
	await toggle(page, 'Group by role');
	await expect.poll(async () => (await groupingOnCanvas(page)).frame).toBe(true);

	await clickFrame(page, AKTIVE);

	const peek = page.getByTestId('group-peek');
	await expect(peek.getByText('Aktive · 2')).toBeVisible();
	await expect(peek.getByText('in Turnverein Länggasse')).toBeVisible();
	await expect(peek.getByRole('link', { name: /Sandra Brunner-Keller/ })).toBeVisible();
	await expect(peek.getByRole('link', { name: /Franziska Widmer/ })).toBeVisible();
	await expect(peek.getByRole('link', { name: 'Open the circle' })).toHaveAttribute(
		'href',
		`/circles/${TURNVEREIN}`
	);

	await peek.getByRole('button', { name: 'Show individually' }).click();

	await expect
		.poll(() => groupingOnCanvas(page))
		.toMatchObject({
			frame: false,
			parents: { a: null, b: null },
			circleToMembers: 2
		});
	await expect(peek).toHaveCount(0);
});

test('leaves the family tree ungrouped, and groups again on leaving it', async ({ page }) => {
	await openTurnverein(page);
	await toggle(page, 'Group by role');
	await expect.poll(async () => (await groupingOnCanvas(page)).frame).toBe(true);

	await arrangeBy(page, 'Tree');
	await settled(page);

	await expect
		.poll(() => groupingOnCanvas(page))
		.toMatchObject({
			frame: false,
			parents: { a: null, b: null }
		});
	// The tree draws a circle's lines only around the person the reader selects (docs/05 §5.8):
	// Sandra's to the club, not Franziska's.
	await clickNode(page, SANDRA);
	await expect
		.poll(async () => {
			const seen = await groupingOnCanvas(page);
			return { a: seen.parents.a, circleToMembers: seen.circleToMembers };
		})
		.toEqual({ a: null, circleToMembers: 1 });

	await arrangeBy(page, 'By circle');
	await settled(page);

	await expect
		.poll(async () => (await groupingOnCanvas(page)).parents)
		.toMatchObject({
			a: AKTIVE,
			b: AKTIVE
		});
});

test('remembers the switch on this device', async ({ page }) => {
	await openTurnverein(page);
	await toggle(page, 'Group by role');

	await page.reload();
	await settled(page);

	const menu = await filterMenu(page);
	await expect(menu.getByRole('menuitemcheckbox', { name: /^Group by role/ })).toHaveAttribute(
		'aria-checked',
		'true'
	);
});

/*
 * A derived kinship line the map leaves off, because the chain of entered links it abbreviates
 * is drawn, is never counted in a bundle between two groups (docs/02 §2.7) — the count would
 * name lines the map does not draw. This case brings its own household, seeded through the
 * archive as its setting, with names the demo household and the other specs do not use:
 * Brigitte is the mother of Cla and Dario and Arnold's sister, so Arnold is their uncle through
 * a chain that is on the map. In the Schachklub, Arnold and Brigitte are the Trainer, the
 * children the Junioren — two groups, with Brigitte's parent links and Arnold's uncle lines
 * both running between them.
 */
const ARNOLD = 'Arnold Vonlanthen';
const BRIGITTE = 'Brigitte Vonlanthen';
const CLA = 'Cla Vonlanthen';
const DARIO = 'Dario Vonlanthen';
const SCHACHKLUB = 'Schachklub Aarberg';
const CLUB = circleIdOf(SCHACHKLUB);
const TRAINER = `rolegroup:${CLUB}:=Trainer`;
const JUNIOREN = `rolegroup:${CLUB}:=Junioren`;

/** The bundles the renderer draws between two groups, by kind, with the count each carries. */
async function bundlesBetween(page: Page, x: string, y: string) {
	return page.evaluate(
		({ x, y }) => {
			type Edge = { data(key: string): string | number; visible(): boolean };
			let el: HTMLElement | null = document.querySelector('canvas');
			while (el && !('_cyreg' in el)) el = el.parentElement;
			const cy = (
				el as unknown as {
					_cyreg: { cy: { edges(s: string): { toArray(): Edge[] } } };
				}
			)._cyreg.cy;
			return cy
				.edges('edge.bundle')
				.toArray()
				.filter(
					(e) =>
						e.visible() &&
						((e.data('source') === x && e.data('target') === y) ||
							(e.data('source') === y && e.data('target') === x))
				)
				.map((e) => `${e.data('kind')} × ${e.data('count')}`)
				.sort();
		},
		{ x, y }
	);
}

/** Whether the renderer shows this line right now: held, not filtered out, not tucked away. */
async function lineShown(page: Page, id: string) {
	return page.evaluate((edgeId) => {
		type Edge = { empty(): boolean; visible(): boolean };
		let el: HTMLElement | null = document.querySelector('canvas');
		while (el && !('_cyreg' in el)) el = el.parentElement;
		const cy = (el as unknown as { _cyreg: { cy: { $id(id: string): Edge } } })._cyreg.cy;
		const edge = cy.$id(edgeId);
		return !edge.empty() && edge.visible();
	}, id);
}

test('counts no derived kinship line the map leaves off in a bundle between two groups', async ({
	page
}) => {
	await seedHousehold(
		page,
		[ARNOLD, BRIGITTE, CLA, DARIO],
		[
			{ from: BRIGITTE, to: ARNOLD, type: LINK.siblingOf },
			{ from: BRIGITTE, to: CLA, type: LINK.parentOf },
			{ from: BRIGITTE, to: DARIO, type: LINK.parentOf }
		],
		{ [ARNOLD]: 'male', [BRIGITTE]: 'female' },
		[
			{
				name: SCHACHKLUB,
				members: [
					{ person: ARNOLD, role: 'Trainer' },
					{ person: BRIGITTE, role: 'Trainer' },
					{ person: CLA, role: 'Junioren' },
					{ person: DARIO, role: 'Junioren' }
				]
			}
		]
	);
	await page.goto(`/graph?center=${personIdOf(BRIGITTE)}`);
	await settled(page);
	await clickNode(page, CLUB);
	const peek = page.getByRole('complementary');
	await expect(peek.getByText(SCHACHKLUB)).toBeVisible();
	await peek.getByRole('button', { name: 'Expand connections' }).click();
	await peek.getByRole('button', { name: 'Close' }).click();
	await settled(page);

	await toggle(page, 'Group by role');

	// Brigitte's two parent links travel as one bundle — the sign the groups are drawn and the
	// bundles between them counted. Arnold's uncle lines, their chain through her on the map,
	// make no bundle of their own.
	await expect.poll(() => bundlesBetween(page, TRAINER, JUNIOREN)).toEqual(['relationship × 2']);

	// Selecting Arnold names his lines, the uncle lines among them, as without groups.
	const uncleOfCla = kinshipLineId(personIdOf(ARNOLD), personIdOf(CLA));
	const uncleOfDario = kinshipLineId(personIdOf(ARNOLD), personIdOf(DARIO));
	expect(await lineShown(page, uncleOfCla)).toBe(false);
	await page.getByLabel('Find a person').fill(ARNOLD);
	await page.getByTestId('graph-suggestions').getByRole('button', { name: ARNOLD }).click();
	await expect(peek.getByText(ARNOLD)).toBeVisible();
	await expect.poll(() => lineShown(page, uncleOfCla)).toBe(true);
	expect(await lineShown(page, uncleOfDario)).toBe(true);
	await peek.getByRole('button', { name: 'Close' }).click();

	// Asked for every kinship line, the map draws them — and bundles them, with their count.
	await toggle(page, 'All kinship lines');
	await expect
		.poll(() => bundlesBetween(page, TRAINER, JUNIOREN))
		.toEqual(['kinship × 2', 'relationship × 2']);
});
