import { expect, test, type Locator, type Page } from '@playwright/test';
import { openPerson, signIn } from './app';
import { clickNode, drawnNode, filterMenu, firstClickableNode, ringsOnCanvas, settled } from './graph-canvas';
import { LINK, personIdOf, seedHousehold } from './seed';

/*
 * How dense the relationship map reads (docs/05 §5.8, docs/02 §2.7): the "+N" on a node that
 * can still grow, the Spacing choice, line names pausing on a busy map, the deceased mark and
 * what the keyboard cursor says. Written after the owner tried them in the running app
 * (docs/08 §8.4.1).
 *
 * A canvas has no DOM, so these read the renderer's own state through the instance Cytoscape
 * registers on its container — the classes and data the stylesheet draws from, and the style
 * it computed. What only shows as pixels (contrast, the halo against the dashed ring, names
 * dropping out when zoomed far out, rows of newcomers on a big fan) is held by the unit tests
 * of `theme.ts`, `stylesheet.ts` and `placement.ts` instead.
 */

const HANS = 'demo-c-hans';
const LENA = 'demo-c-lena';

/** What the renderer holds about one node, as the stylesheet sees it. */
interface NodeFacts {
	id: string;
	label: string;
	kind: string;
	/** People or circles an expand would bring in — the "+N". */
	more: number;
	badged: boolean;
	drawn: boolean;
	cursor: boolean;
}

/** Every node on the canvas, read off the running Cytoscape core. */
async function nodes(page: Page): Promise<NodeFacts[]> {
	return page.evaluate(() => {
		type Node = {
			id(): string;
			data(key: string): unknown;
			hasClass(name: string): boolean;
		};
		let el: HTMLElement | null = document.querySelector('canvas');
		while (el && !('_cyreg' in el)) el = el.parentElement;
		if (!el) return [];
		const cy = (el as unknown as { _cyreg: { cy: { nodes(): { map<R>(fn: (n: Node) => R): R[] } } } })._cyreg
			.cy;
		return cy.nodes().map((n) => ({
			id: n.id(),
			label: String(n.data('label') ?? ''),
			kind: String(n.data('kind') ?? ''),
			more: Number(n.data('more') ?? 0),
			badged: n.hasClass('has-more'),
			drawn: !n.hasClass('filtered-out'),
			cursor: n.hasClass('cursor')
		}));
	});
}

const factsOf = async (page: Page, id: string) => (await nodes(page)).find((n) => n.id === id);

/** One computed style value of a node, as the renderer will draw it. */
async function nodeStyle(page: Page, id: string, property: string): Promise<string> {
	return page.evaluate(
		([nodeId, name]) => {
			let el: HTMLElement | null = document.querySelector('canvas');
			while (el && !('_cyreg' in el)) el = el.parentElement;
			const cy = (el as unknown as { _cyreg: { cy: { $id(id: string): { style(p: string): unknown } } } })
				._cyreg.cy;
			return String(cy.$id(nodeId).style(name));
		},
		[id, property] as const
	);
}

/** The drawn lines, with whether their name is showing and what the controller marked on them. */
async function lines(page: Page) {
	return page.evaluate(() => {
		type Edge = {
			id(): string;
			data(key: string): string;
			hasClass(name: string): boolean;
			style(p: string): unknown;
			visible(): boolean;
		};
		let el: HTMLElement | null = document.querySelector('canvas');
		while (el && !('_cyreg' in el)) el = el.parentElement;
		if (!el) return [];
		const cy = (el as unknown as { _cyreg: { cy: { edges(): { map<R>(fn: (e: Edge) => R): R[] } } } })._cyreg
			.cy;
		return cy
			.edges()
			.map((e) => ({
				id: e.id(),
				source: e.data('source'),
				target: e.data('target'),
				// Filtered out, or a derived line the entered links already explain: not drawn.
				drawn: e.visible(),
				hovered: e.hasClass('hovered'),
				highlighted: e.hasClass('highlight'),
				named: Number(e.style('text-opacity')) > 0
			}))
			.filter((e) => e.drawn);
	});
}

/** The mean length of the drawn lines between people, in the renderer's model coordinates. */
async function meanLineLength(page: Page): Promise<number> {
	return page.evaluate(() => {
		type El = {
			data(key: string): string;
			hasClass(name: string): boolean;
			position(): { x: number; y: number };
			isParent(): boolean;
		};
		let el: HTMLElement | null = document.querySelector('canvas');
		while (el && !('_cyreg' in el)) el = el.parentElement;
		const cy = (
			el as unknown as {
				_cyreg: { cy: { edges(): { map<R>(fn: (e: El) => R): R[] }; $id(id: string): El } };
			}
		)._cyreg.cy;
		const lengths = cy
			.edges()
			.map((e) => {
				if (e.hasClass('filtered-out')) return null;
				const [a, b] = [cy.$id(e.data('source')), cy.$id(e.data('target'))];
				if (a.isParent() || b.isParent()) return null;
				const [p, q] = [a.position(), b.position()];
				return Math.hypot(p.x - q.x, p.y - q.y);
			})
			.filter((l): l is number => l !== null);
		return lengths.reduce((sum, l) => sum + l, 0) / lengths.length;
	});
}

/** Opens the explorer centred on somebody and waits for its first arrangement. */
async function openMap(page: Page, centre: string): Promise<void> {
	await page.goto(`/graph?center=${centre}`);
	await expect(page.locator('canvas').first()).toBeVisible();
	await settled(page);
}

/** Selects a person through the search field and expands them from the peek panel. */
async function expand(page: Page, person: NodeFacts): Promise<void> {
	await page.getByLabel('Find a person').fill(person.label);
	await page.getByTestId('graph-suggestions').getByRole('button', { name: person.label }).first().click();
	const peek = page.getByRole('complementary');
	await expect(peek.getByText(person.label).first()).toBeVisible();
	await peek.getByRole('button', { name: 'Expand connections' }).click();
	// The "+N" counted exactly who was missing, so once they are in, it is gone.
	await expect.poll(async () => (await factsOf(page, person.id))?.badged).toBe(false);
	await settled(page);
}

/** The hint under the Labels switch in the Filter menu. */
const labelsHint = (menu: Locator) => menu.getByRole('menuitemcheckbox', { name: /^Labels/ });

test.beforeEach(async ({ page }) => {
	await signIn(page);
});

test('a "+N" counts who an expand brings in, moves to the newcomers, and follows the filters', async ({
	page
}) => {
	await openMap(page, HANS);
	const before = await nodes(page);
	// Every badge is a count, and only a node with something behind it wears one.
	for (const n of before) expect(n.badged, n.id).toBe(n.more > 0);
	const hub = before.filter((n) => n.drawn && n.kind === 'person').sort((a, b) => b.more - a.more)[0];
	expect(hub.more).toBeGreaterThan(0);

	// The Family kind off: the count is taken under the filters, so the relatives an expand
	// would no longer bring in drop out of it. Counted against everybody instead, the same
	// switch would raise it, since the relatives it hides from the map would count as missing.
	const menu = await filterMenu(page);
	await menu.getByRole('menuitemcheckbox', { name: 'Family', exact: true }).click();
	await expect.poll(async () => (await factsOf(page, hub.id))?.more ?? 0).toBeLessThan(hub.more);
	await menu.getByRole('menuitemcheckbox', { name: 'Family', exact: true }).click();
	await expect.poll(async () => (await factsOf(page, hub.id))?.more).toBe(hub.more);
	await page.keyboard.press('Escape');
	await expect(menu).toHaveCount(0);

	await expand(page, hub);
	const after = await nodes(page);
	const known = new Set(before.map((n) => n.id));
	const newcomers = after.filter((n) => !known.has(n.id));
	// Exactly as many came in as the badge said would.
	expect(newcomers.length).toBe(hub.more);
	// And the badges move outwards with the map: a newcomer with people behind them wears one.
	expect(newcomers.some((n) => n.badged)).toBe(true);
	for (const n of after) expect(n.badged, n.id).toBe(n.more > 0);
});

test('on a person’s page nobody on the last ring wears a "+N", though the explorer gives them one', async ({
	page
}) => {
	await openPerson(page, /Lena Brunner/);
	const map = page.getByRole('group', { name: 'The people around Lena Brunner' });
	await expect(map.locator('canvas').first()).toBeVisible();
	await map.scrollIntoViewIfNeeded();
	await settled(page);

	// One hop out, the map can still grow, and says so.
	const before = await nodes(page);
	const rings = await ringsOnCanvas(page, LENA);
	const badgedNear = before.filter((n) => n.badged && rings.get(n.id) === 1).map((n) => n.id);
	const near = await firstClickableNode(page, badgedNear);
	if (!near) throw new Error(`Nobody one hop out with a "+N" was free to click: ${badgedNear.join(', ')}`);
	const person = before.find((n) => n.id === near)!;

	await clickNode(page, near);
	await map.getByRole('complementary').getByRole('button', { name: 'Expand connections' }).click();
	await expect.poll(async () => (await factsOf(page, near))?.badged).toBe(false);
	await settled(page);

	// Who came in stands on the last ring this map draws, so nothing more is offered there.
	// Counted among the drawn: this map opens with Circles filtered out, and so does the "+N".
	const known = new Set(before.map((n) => n.id));
	const newcomers = (await nodes(page)).filter((n) => !known.has(n.id) && n.drawn);
	expect(newcomers.length).toBe(person.more);
	for (const n of newcomers) expect(n.badged, n.id).toBe(false);

	// The control: the explorer, which has no last ring, gives some of the same people a "+N".
	await openMap(page, LENA);
	await expand(page, (await factsOf(page, near))!);
	const there = await nodes(page);
	expect(there.some((n) => newcomers.some((c) => c.id === n.id) && n.badged)).toBe(true);
});

test('Spacing sets people closer or further apart on Free, and this browser keeps it', async ({ page }) => {
	await openMap(page, HANS);
	const comfortable = await meanLineLength(page);
	let menu = await filterMenu(page);
	const option = (name: string) => menu.getByRole('menuitemradio', { name, exact: true });
	await expect(option('Comfortable')).toHaveAttribute('aria-checked', 'true');
	await expect(option('Compact')).toHaveAttribute('aria-checked', 'false');

	await option('Compact').click();
	await expect(option('Compact')).toHaveAttribute('aria-checked', 'true');
	await expect.poll(() => meanLineLength(page)).toBeLessThan(comfortable);

	await option('Spacious').click();
	await expect(option('Spacious')).toHaveAttribute('aria-checked', 'true');
	await expect(option('Comfortable')).toHaveAttribute('aria-checked', 'false');
	await expect.poll(() => meanLineLength(page)).toBeGreaterThan(comfortable);

	await page.reload();
	await settled(page);
	menu = await filterMenu(page);
	await expect(option('Spacious')).toHaveAttribute('aria-checked', 'true');
	await expect(option('Comfortable')).toHaveAttribute('aria-checked', 'false');
});

test('past 40 lines the names pause, the hint says so, and pointing or selecting names theirs', async ({
	page
}) => {
	await openMap(page, HANS);
	let menu = await filterMenu(page);
	// The positive control: a small map names every line and the hint says what the switch does.
	await expect(labelsHint(menu)).toContainText('Name every line with its relationship');
	expect((await lines(page)).every((line) => line.named)).toBe(true);
	await page.keyboard.press('Escape');

	// Grow the map from its biggest hubs until it holds more than 40 lines.
	const expanded = new Set<string>();
	while ((await lines(page)).length <= 40) {
		const next = (await nodes(page))
			.filter((n) => n.drawn && n.kind === 'person' && n.more > 0 && !expanded.has(n.id))
			.sort((a, b) => b.more - a.more)[0];
		if (!next) throw new Error('The demo household ran out of people to expand before 40 lines.');
		expanded.add(next.id);
		await expand(page, next);
	}

	menu = await filterMenu(page);
	await expect(labelsHint(menu)).toContainText('Paused while more than 40 lines are shown');
	await page.keyboard.press('Escape');
	await expect(menu).toHaveCount(0);

	// The person selected last has their own lines named; the rest are quiet.
	await expect.poll(async () => (await lines(page)).filter((l) => l.highlighted).every((l) => l.named)).toBe(true);
	const now = await lines(page);
	expect(now.some((l) => l.highlighted)).toBe(true);
	expect(now.filter((l) => !l.highlighted && !l.hovered).every((l) => !l.named)).toBe(true);

	// Pointing at a person names their lines without selecting them.
	const ids = (await nodes(page)).filter((n) => n.drawn && n.kind === 'person').map((n) => n.id);
	const target = await firstClickableNode(page, ids);
	if (!target) throw new Error('No person on the busy map was free to point at.');
	const { point } = await drawnNode(page, target);
	await page.mouse.move(point!.x, point!.y);
	await expect
		.poll(async () => {
			const theirs = (await lines(page)).filter((l) => l.source === target || l.target === target);
			return theirs.length > 0 && theirs.every((l) => l.hovered && l.named);
		})
		.toBe(true);
});

test('somebody who has died keeps full strength on the map, marked by a double ring', async ({ page }) => {
	const people = ['Aurelio Fontanella', 'Teodora Fontanella', 'Livio Fontanella'];
	await seedHousehold(
		page,
		people,
		[
			{ from: 'Aurelio Fontanella', to: 'Livio Fontanella', type: LINK.parentOf },
			{ from: 'Teodora Fontanella', to: 'Livio Fontanella', type: LINK.parentOf }
		],
		{},
		[],
		[],
		['Aurelio Fontanella']
	);
	const [aurelio, teodora] = [personIdOf('Aurelio Fontanella'), personIdOf('Teodora Fontanella')];
	await openMap(page, personIdOf('Livio Fontanella'));
	await expect.poll(async () => (await factsOf(page, aurelio))?.drawn).toBe(true);

	expect(await nodeStyle(page, aurelio, 'border-style')).toBe('double');
	expect(Number(await nodeStyle(page, aurelio, 'opacity'))).toBe(1);
	// The living parent beside him is the control: the ring is his mark, not everyone's.
	expect(await nodeStyle(page, teodora, 'border-style')).not.toBe('double');
});

test('the keyboard cursor reads out how many more a node would open up', async ({ page }) => {
	await openMap(page, HANS);
	const canvas = page.getByRole('application');
	const said = page.locator('[aria-live="polite"]').filter({ has: page.locator('xpath=self::p') }).first();

	// Arrive from the keyboard, which is what shows the cursor: a click would focus the canvas
	// without one.
	await page.keyboard.press('Tab');
	await canvas.focus();
	await expect(canvas).toBeFocused();
	await expect.poll(async () => (await nodes(page)).some((n) => n.cursor)).toBe(true);

	// Walk until the cursor has stood on somebody with more and somebody without.
	const heard = new Map<string, { label: string; more: number; text: string }>();
	const keys = ['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp'];
	for (let step = 0; step < 24; step++) {
		const under = (await nodes(page)).find((n) => n.cursor);
		if (under) {
			// The announcement follows the cursor; wait for it to name who is under it now.
			await expect(said).toContainText(under.label);
			heard.set(under.id, { label: under.label, more: under.more, text: (await said.textContent()) ?? '' });
		}
		const values = [...heard.values()];
		if (values.some((h) => h.more > 0) && values.some((h) => h.more === 0)) break;
		await page.keyboard.press(keys[step % keys.length]);
		await expect.poll(async () => (await nodes(page)).some((n) => n.cursor)).toBe(true);
	}

	const withMore = [...heard.values()].find((h) => h.more > 0);
	const without = [...heard.values()].find((h) => h.more === 0);
	expect(withMore, 'the cursor never reached a node with a "+N"').toBeTruthy();
	expect(withMore!.text).toContain(`${withMore!.label}, ${withMore!.more} more to open up`);
	expect(without, 'the cursor never reached a node without a "+N"').toBeTruthy();
	expect(without!.text).toContain(without!.label);
	expect(without!.text).not.toContain('more to open up');
});
