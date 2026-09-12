import { expect, test, type Page } from '@playwright/test';
import { signIn } from './app';

/*
 * The explorer's toolbar and peek panel (docs/05 §5.8). Written after the screen was seen in
 * the running app (docs/08 §8.4.1). What the canvas draws is held by `theme.test.ts` and
 * `elements.test.ts`; this covers what surrounds it.
 */

test.beforeEach(async ({ page }) => {
	await signIn(page);
});

test('the filter chips are the legend, and there is no second one', async ({ page }) => {
	await page.goto('/graph?center=demo-c-hans');
	await expect(page.locator('canvas').first()).toBeVisible();

	for (const label of ['Family', 'Romantic', 'Social', 'Work', 'Circles', 'Kinship']) {
		await expect(page.getByRole('button', { name: label })).toHaveAttribute('aria-pressed', 'true');
	}
	await expect(page.getByText('Connections', { exact: true })).toHaveCount(0);

	await page.getByRole('button', { name: 'Family' }).click();
	await expect(page.getByRole('button', { name: 'Family' })).toHaveAttribute('aria-pressed', 'false');
});

test('opens the peek panel on the centred person with their face, name and a way to their page', async ({ page }) => {
	await page.goto('/graph?center=demo-c-hans');
	const canvas = page.locator('canvas').first();
	await expect(canvas).toBeVisible();

	// The centre node sits in the middle of the canvas once the layout has settled.
	await expect(async () => {
		const box = await canvas.boundingBox();
		if (!box) throw new Error('no canvas');
		await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
		await expect(page.getByRole('complementary').getByText('Hans Brunner')).toBeVisible({ timeout: 800 });
	}).toPass();

	const peek = page.getByRole('complementary');
	await expect(peek.getByText('HB')).toBeVisible();
	await expect(peek.getByRole('button', { name: 'Close' })).toBeVisible();
	await peek.getByRole('link', { name: 'Open profile' }).click();
	await expect(page).toHaveURL(/\/contacts\/demo-c-hans$/);
});

/*
 * Derived kinship on the canvas (docs/02 §2.7, §2.4.1). Written after the screen was seen in
 * the running app (docs/08 §8.4.1).
 *
 * A canvas has no DOM to address, so these read the renderer's own state through the instance
 * Cytoscape registers on its container: which nodes it holds, which it has filtered out, and
 * where it has drawn them. That is the renderer answering — not the model being re-read — and
 * it makes clicking a named person deterministic instead of a guess at a coordinate.
 */

/** The slice of the Cytoscape instance the tests below read from the page. */
interface CyForTests {
	$id(id: string): {
		empty(): boolean;
		hasClass(name: string): boolean;
		renderedPosition(): { x: number; y: number };
	};
	$(selector: string): { map(fn: (edge: { data(key: string): string }) => string): string[] };
}

type NodeState = 'absent' | 'filtered-out' | 'drawn';

interface DrawnNode {
	state: NodeState;
	/** Page coordinates of the node's centre, or null when it is not drawn. */
	point: { x: number; y: number } | null;
}

/** What the renderer is doing with one node right now. */
async function drawnNode(page: Page, id: string): Promise<DrawnNode> {
	return page.evaluate((nodeId) => {
		let el: HTMLElement | null = document.querySelector('canvas');
		while (el && !('_cyreg' in el)) el = el.parentElement;
		const cy = el ? (el as unknown as { _cyreg: { cy: CyForTests } })._cyreg.cy : null;
		if (!cy || !el) return { state: 'absent' as const, point: null };
		const node = cy.$id(nodeId);
		if (node.empty()) return { state: 'absent' as const, point: null };
		const box = el.getBoundingClientRect();
		const p = node.renderedPosition();
		return node.hasClass('filtered-out')
			? { state: 'filtered-out' as const, point: null }
			: { state: 'drawn' as const, point: { x: box.x + p.x, y: box.y + p.y } };
	}, id);
}

const stateOf = async (page: Page, id: string) => (await drawnNode(page, id)).state;

/** Clicks a node where the renderer has actually drawn it. */
async function clickNode(page: Page, id: string): Promise<void> {
	const { point } = await drawnNode(page, id);
	if (!point) throw new Error(`the explorer is not drawing ${id}, so it cannot be clicked`);
	await page.mouse.click(point.x, point.y);
}

/** The names on the lines the renderer is currently emphasising. */
async function highlightedLabels(page: Page): Promise<string[]> {
	return page.evaluate(() => {
		let el: HTMLElement | null = document.querySelector('canvas');
		while (el && !('_cyreg' in el)) el = el.parentElement;
		const cy = el ? (el as unknown as { _cyreg: { cy: CyForTests } })._cyreg.cy : null;
		return cy ? cy.$('edge.highlight').map((edge) => edge.data('label')) : [];
	});
}

test('draws the relatives nobody entered, and the Kinship chip takes them away', async ({ page }) => {
	// Lena's cousin Timo is tied to her by nothing stored: he is in her neighbourhood only
	// because the cousin line is worked out, through the grandparents they share.
	await page.goto('/graph?center=demo-c-lena');
	await expect(page.locator('canvas').first()).toBeVisible();
	await expect(async () => expect(await stateOf(page, 'demo-c-timo')).toBe('drawn')).toPass();

	await page.getByRole('button', { name: 'Kinship' }).click();
	await expect(page.getByRole('button', { name: 'Kinship' })).toHaveAttribute('aria-pressed', 'false');
	await expect(async () => expect(await stateOf(page, 'demo-c-timo')).toBe('filtered-out')).toPass();
	// Her father stays: he is there through an entered relationship, not a derived one.
	expect(await stateOf(page, 'demo-c-markus')).toBe('drawn');

	await page.getByRole('button', { name: 'Kinship' }).click();
	await expect(async () => expect(await stateOf(page, 'demo-c-timo')).toBe('drawn')).toPass();
});

test('a connection path answers with the people in between, not with the derived shortcut', async ({ page }) => {
	await page.goto('/graph?center=demo-c-lena');
	await expect(page.locator('canvas').first()).toBeVisible();
	await expect(async () => expect(await stateOf(page, 'demo-c-timo')).toBe('drawn')).toPass();

	// Reachable with the peek panel open — the toolbar keeps clear of it.
	await page.getByRole('button', { name: 'Connection path' }).click();
	const prompt = page.getByTestId('path-prompt');
	await expect(prompt).toHaveText('Pick two people to trace how they’re connected.');

	await expect(async () => {
		await clickNode(page, 'demo-c-lena');
		await expect(prompt).toHaveText('Now pick the second person…', { timeout: 1000 });
	}).toPass();
	await expect(async () => {
		await clickNode(page, 'demo-c-timo');
		await expect(prompt).toContainText('→', { timeout: 1000 });
	}).toPass();

	// The cousin line would make this a single hop; the answer names the grandfather instead.
	await expect(prompt).toHaveText('Lena Brunner → Hans Brunner → Timo Brunner');
});

test('names the lines around the selected person, and only while they are selected', async ({ page }) => {
	// The explorer opens with the centred person selected, so her lines carry their names at once.
	await page.goto('/graph?center=demo-c-lena');
	await expect(page.locator('canvas').first()).toBeVisible();

	await expect(async () => expect(await highlightedLabels(page)).toContain('Cousin')).toPass();
	const labels = await highlightedLabels(page);
	expect(labels).toContain('Cousin'); // worked out
	expect(labels).toContain('Parent of'); // entered

	await page.getByRole('complementary').getByRole('button', { name: 'Close' }).click();
	await expect(async () => expect(await highlightedLabels(page)).toEqual([])).toPass();
});

/*
 * The toolbar's search (docs/05 §5.8). On a narrow window the chip row wraps under the field,
 * and the suggested names were painted behind the chips — so this reads what is actually on
 * top at each name's own position, not merely whether the list is in the DOM.
 */

/** The owner of the topmost element at each page point — a positive reading, never a nothing. */
async function ownersAt(page: Page, points: { x: number; y: number }[]): Promise<string[]> {
	return page.evaluate(
		(pts) =>
			pts.map(({ x, y }) => {
				const el = document.elementFromPoint(x, y);
				if (!el) return 'nothing';
				if (el.closest('[data-testid="graph-suggestions"]')) return 'suggestions';
				const button = el.closest('button');
				return button ? `chip: ${button.textContent?.trim()}` : el.tagName.toLowerCase();
			}),
		points
	);
}

test('keeps the suggested names on top when the filter chips wrap under the search field', async ({
	page
}) => {
	await page.setViewportSize({ width: 640, height: 800 });
	await page.goto('/graph?center=demo-c-hans');
	await expect(page.locator('canvas').first()).toBeVisible();

	const field = page.getByLabel('Find a person');
	await field.fill('bru');
	const list = page.getByTestId('graph-suggestions');
	await expect(list.getByRole('button', { name: 'Hans Brunner' })).toBeVisible();

	// The chips have to overlap the list here, or the rest of this proves nothing.
	const fieldBox = await field.boundingBox();
	const chipBox = await page.getByRole('button', { name: 'Family' }).boundingBox();
	const listBox = await list.boundingBox();
	if (!fieldBox || !chipBox || !listBox) throw new Error('the toolbar has no layout');
	expect(chipBox.y).toBeGreaterThan(fieldBox.y + fieldBox.height);
	expect(chipBox.y).toBeLessThan(listBox.y + listBox.height);

	// Every name answers for its own position.
	const rows = await list.getByRole('button').all();
	const points = await Promise.all(
		rows.map(async (row) => {
			const box = await row.boundingBox();
			if (!box) throw new Error('a suggested name has no layout');
			return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
		})
	);
	expect(points.length).toBeGreaterThan(0);
	expect(await ownersAt(page, points)).toEqual(points.map(() => 'suggestions'));

	// And the name takes the click, rather than a chip swallowing it.
	await list.getByRole('button', { name: 'Hans Brunner' }).click();
	await expect(page.getByRole('complementary').getByText('Hans Brunner')).toBeVisible();
});
