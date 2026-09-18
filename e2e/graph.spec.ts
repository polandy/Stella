import { expect, test } from '@playwright/test';
import { signIn } from './app';
import {
	arrangeBy,
	arrangement,
	clickNode,
	filterMenu,
	highlightedLabels,
	settled,
	stateOf
} from './graph-canvas';

/*
 * The explorer's toolbar and peek panel (docs/05 §5.8). Written after the screen was seen in
 * the running app (docs/08 §8.4.1). What the canvas draws is held by `theme.test.ts` and
 * `elements.test.ts`; this covers what surrounds it.
 */

test.beforeEach(async ({ page }) => {
	await signIn(page);
});

test('the Filter menu is the legend, and the pill counts what is shown', async ({ page }) => {
	await page.goto('/graph?center=demo-c-hans');
	await expect(page.locator('canvas').first()).toBeVisible();
	await expect(
		page.getByRole('button', { name: 'Filter: 6 of 6 kinds of line shown' })
	).toBeVisible();

	const menu = await filterMenu(page);
	for (const label of ['Family', 'Romantic', 'Social', 'Work', 'Circles', 'Kinship']) {
		await expect(menu.getByRole('menuitemcheckbox', { name: label, exact: true })).toHaveAttribute(
			'aria-checked',
			'true'
		);
	}
	await expect(page.getByText('Connections', { exact: true })).toHaveCount(0);

	// A toggle leaves the menu open for the next one, and the pill says what was left out.
	await menu.getByRole('menuitemcheckbox', { name: 'Family', exact: true }).click();
	await expect(menu.getByRole('menuitemcheckbox', { name: 'Family', exact: true })).toHaveAttribute(
		'aria-checked',
		'false'
	);
	await expect(
		page.getByRole('button', { name: 'Filter: 5 of 6 kinds of line shown' })
	).toBeVisible();

	// Escape closes it and hands focus back to the pill.
	await page.keyboard.press('Escape');
	await expect(menu).toHaveCount(0);
	await expect(page.getByRole('button', { name: /^Filter/ })).toBeFocused();
});

test('opens the peek panel on the centred person with their face, name and a way to their page', async ({ page }) => {
	await page.goto('/graph?center=demo-c-hans');
	await expect(page.locator('canvas').first()).toBeVisible();

	// The explorer opens with the centred person selected, so the panel is his from the start.
	const peek = page.getByRole('complementary');
	await expect(peek.getByText('Hans Brunner')).toBeVisible();
	await expect(peek.getByText('HB')).toBeVisible();
	await expect(peek.getByRole('button', { name: 'Close' })).toBeVisible();

	await peek.getByRole('link', { name: 'Open profile' }).click();
	await expect(page).toHaveURL(/\/contacts\/demo-c-hans$/);
});

test('expanding a person brings the connections of theirs the canvas did not have', async ({
	page
}) => {
	// Sandra's father Peter is no relative of Hans, so nothing puts him on the opening
	// canvas — and the canvas only re-lays out when its element set actually moved, so this
	// is also what says that guard still lets a growing graph settle again.
	await page.goto('/graph?center=demo-c-hans');
	await expect(page.locator('canvas').first()).toBeVisible();
	await settled(page);
	expect(await stateOf(page, 'demo-c-peter')).toBe('absent');

	// Reached through the search field rather than by aiming at the canvas: a node the peek
	// panel happens to sit over cannot be clicked, and where the layout puts her is not this
	// case's business.
	await page.getByLabel('Find a person').fill('Sandra');
	await page.getByTestId('graph-suggestions').getByRole('button', { name: 'Sandra' }).click();
	const peek = page.getByRole('complementary');
	await expect(peek.getByText('Sandra Brunner-Keller')).toBeVisible();
	await peek.getByRole('button', { name: 'Expand connections' }).click();

	await expect(async () => expect(await stateOf(page, 'demo-c-peter')).toBe('drawn')).toPass();
	await settled(page);
});

test('expanding moves nobody already on the map, and arranging it freely re-arranges it', async ({ page }) => {
	await page.goto('/graph?center=demo-c-hans');
	await expect(page.locator('canvas').first()).toBeVisible();
	await settled(page);
	const before = await arrangement(page);
	expect(before.has('demo-c-peter')).toBe(false);

	await page.getByLabel('Find a person').fill('Sandra');
	await page.getByTestId('graph-suggestions').getByRole('button', { name: 'Sandra' }).click();
	const peek = page.getByRole('complementary');
	await expect(peek.getByText('Sandra Brunner-Keller')).toBeVisible();
	await peek.getByRole('button', { name: 'Expand connections' }).click();
	await expect(async () => expect(await stateOf(page, 'demo-c-peter')).toBe('drawn')).toPass();
	await settled(page);

	// Peter came in, and everyone who was already there stands exactly where they stood.
	const grown = await arrangement(page);
	expect(grown.has('demo-c-peter')).toBe(true);
	for (const [id, point] of before) expect(grown.get(id), id).toEqual(point);

	// Arranging is the one thing that may move them: the map is arranged afresh.
	await arrangeBy(page, 'Free');
	await settled(page);
	const tidied = await arrangement(page);
	const moved = [...grown].filter(([id, p]) => {
		const q = tidied.get(id);
		return !q || q.x !== p.x || q.y !== p.y;
	});
	expect(moved.length).toBeGreaterThan(0);
});

test('draws the relatives nobody entered, and the Kinship filter takes them away', async ({ page }) => {
	// Lena's cousin Timo is tied to her by nothing stored: he is in her neighbourhood only
	// because the cousin line is worked out, through the grandparents they share.
	await page.goto('/graph?center=demo-c-lena');
	await expect(page.locator('canvas').first()).toBeVisible();
	await expect(async () => expect(await stateOf(page, 'demo-c-timo')).toBe('drawn')).toPass();

	const kinship = (await filterMenu(page)).getByRole('menuitemcheckbox', { name: 'Kinship' });
	await kinship.click();
	await expect(kinship).toHaveAttribute('aria-checked', 'false');
	await expect(async () => expect(await stateOf(page, 'demo-c-timo')).toBe('filtered-out')).toPass();
	// Her father stays: he is there through an entered relationship, not a derived one.
	expect(await stateOf(page, 'demo-c-markus')).toBe('drawn');

	await kinship.click();
	await expect(async () => expect(await stateOf(page, 'demo-c-timo')).toBe('drawn')).toPass();
});

test('a connection path answers with the people in between, not with the derived shortcut', async ({ page }) => {
	await page.goto('/graph?center=demo-c-lena');
	await expect(page.locator('canvas').first()).toBeVisible();
	await expect(async () => expect(await stateOf(page, 'demo-c-timo')).toBe('drawn')).toPass();
	// Picking a person means clicking where the renderer has drawn them, so the nodes have to
	// have stopped travelling first. Clicking one mid-flight lands on the background, which
	// clears the pick that was already made and leaves the prompt back at its first sentence.
	await settled(page);

	// Reachable with the peek panel open — the toolbar keeps clear of it.
	await page.getByRole('button', { name: 'Connection path' }).click();
	const prompt = page.getByTestId('path-prompt');
	await expect(prompt).toHaveText('Pick two people to trace how they’re connected.');

	await clickNode(page, 'demo-c-lena');
	await expect(prompt).toHaveText('Now pick the second person…');
	await clickNode(page, 'demo-c-timo');
	await expect(prompt).toContainText('→');

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

test('keeps the suggested names on top when the toolbar wraps under the search field', async ({
	page
}) => {
	await page.setViewportSize({ width: 320, height: 800 });
	await page.goto('/graph?center=demo-c-hans');
	await expect(page.locator('canvas').first()).toBeVisible();

	const field = page.getByLabel('Find a person');
	await field.fill('bru');
	const list = page.getByTestId('graph-suggestions');
	await expect(list.getByRole('button', { name: 'Hans Brunner' })).toBeVisible();

	// The toolbar's pills have to overlap the list here, or the rest of this proves nothing.
	const fieldBox = await field.boundingBox();
	const chipBox = await page.getByRole('button', { name: /^Filter/ }).boundingBox();
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
