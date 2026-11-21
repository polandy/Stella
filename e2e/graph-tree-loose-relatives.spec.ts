import { expect, test, type Page } from '@playwright/test';
import { addPerson, pickPerson, signIn } from './app';
import { arrangeBy, arrangement, clickNode, filterMenu, settled, stateOf } from './graph-canvas';

/*
 * Loose relatives in the family tree (docs/dev/02 §2.7, docs/dev/05 §5.8): cousins entered straight
 * onto somebody, with no aunt or uncle on record, stand together at the end of that person's row,
 * a gap apart; no bar runs over the row to them, their line shows dotted only while one end is
 * selected, and *Show gaps* offers one "+ Aunt/uncle?" over the group.
 *
 * The family is made from scratch so nothing the demo family asserts elsewhere shifts.
 */

const PARENT = { first: 'Gian', last: 'Caflisch' };
const CHILD = { first: 'Ladina', last: 'Caflisch' };
const COUSINS = [
	{ first: 'Curdin', last: 'Arquint' },
	{ first: 'Seraina', last: 'Arquint' }
];
const fullName = (who: { first: string; last: string }) => `${who.first} ${who.last}`;

/** The id of the person whose page is open. */
function contactId(page: Page): string {
	const id = new URL(page.url()).pathname.split('/')[2];
	if (!id) throw new Error(`not on a person's page: ${page.url()}`);
	return id;
}

/** Adds a relationship from the open person's page. */
async function relate(page: Page, type: string, other: string): Promise<void> {
	await page.getByRole('button', { name: 'Add relationship' }).click();
	const form = page.locator('form[action="?/addRelationship"]');
	await form.locator('select[name=typeChoice]').selectOption({ label: type });
	await pickPerson(form.getByLabel('Person'), other);
	await form.getByRole('button', { name: 'Add', exact: true }).click();
	await expect(
		page.getByTestId('relationship-list').locator('li').filter({ hasText: other })
	).toBeVisible();
}

/** How the renderer draws the line between two people: whether at all, and dotted or not. */
async function lineBetween(page: Page, a: string, b: string) {
	return page.evaluate(
		([a, b]) => {
			type Edge = { data(key: string): string; hasClass(name: string): boolean };
			let el: HTMLElement | null = document.querySelector('canvas');
			while (el && !('_cyreg' in el)) el = el.parentElement;
			const cy = (el as unknown as { _cyreg: { cy: { edges(): Edge[] } } })._cyreg.cy;
			const edge = cy
				.edges()
				.find(
					(e) =>
						(e.data('source') === a && e.data('target') === b) ||
						(e.data('source') === b && e.data('target') === a)
				);
			return edge
				? { drawn: !edge.hasClass('filtered-out'), dotted: edge.hasClass('dotted') }
				: null;
		},
		[a, b]
	);
}

/** The label and name of a slot the renderer holds. */
async function slotWords(page: Page, id: string) {
	return page.evaluate((slotId) => {
		type Node = { empty(): boolean; data(key: string): string };
		let el: HTMLElement | null = document.querySelector('canvas');
		while (el && !('_cyreg' in el)) el = el.parentElement;
		const cy = (el as unknown as { _cyreg: { cy: { $id(id: string): Node } } })._cyreg.cy;
		const node = cy.$id(slotId);
		return node.empty() ? null : { label: node.data('label'), name: node.data('name') };
	}, id);
}

test('cousins with no aunt or uncle stand at the row end, their line dotted on selection, a gap over them', async ({
	page
}) => {
	await signIn(page);
	await addPerson(page, PARENT.first, PARENT.last);
	const parent = contactId(page);
	const cousins: string[] = [];
	for (const cousin of COUSINS) {
		await addPerson(page, cousin.first, cousin.last);
		cousins.push(contactId(page));
	}
	await addPerson(page, CHILD.first, CHILD.last);
	const child = contactId(page);
	await relate(page, 'Child of', fullName(PARENT));
	for (const cousin of COUSINS) await relate(page, 'Cousin of', fullName(cousin));

	await page.goto(`/graph?center=${child}`);
	await expect(page.locator('canvas').first()).toBeVisible();
	await settled(page);
	await arrangeBy(page, 'Tree');
	await settled(page);

	// On Ladina's row, at its right end (no parent to side with), a family gap past her.
	const placed = await arrangement(page);
	for (const cousin of cousins) {
		expect(placed.get(cousin)!.y).toBe(placed.get(child)!.y);
		expect(placed.get(cousin)!.x).toBeGreaterThan(
			Math.max(placed.get(child)!.x, placed.get(parent)!.x)
		);
	}

	// As the map opens no line runs over the row to them; tapping her draws them dotted, not
	// as a siblings' bar, while her father's line stays solid.
	for (const cousin of cousins) {
		await expect
			.poll(() => lineBetween(page, child, cousin))
			.toEqual({ drawn: false, dotted: true });
	}
	await clickNode(page, child);
	for (const cousin of cousins) {
		await expect
			.poll(() => lineBetween(page, child, cousin))
			.toEqual({ drawn: true, dotted: true });
	}
	expect(await lineBetween(page, parent, child)).toEqual({ drawn: true, dotted: false });

	// With her father selected instead, they go again.
	await clickNode(page, parent);
	for (const cousin of cousins) {
		await expect
			.poll(() => lineBetween(page, child, cousin))
			.toEqual({ drawn: false, dotted: true });
	}

	// One aunt-or-uncle slot over the pair, worded, shown while one of them is selected.
	const slot = `slot:aunt-uncle-of:${child}`;
	await expect.poll(() => stateOf(page, slot)).toBe('filtered-out');
	await clickNode(page, cousins[0]!);
	await expect.poll(() => stateOf(page, slot)).toBe('drawn');
	expect(await slotWords(page, slot)).toEqual({
		label: '+ Aunt/uncle?',
		name: 'Add an aunt or uncle — a parent of Curdin'
	});
	const withSlot = await arrangement(page);
	expect(withSlot.get(slot)!.x).toBeCloseTo(
		(withSlot.get(cousins[0]!)!.x + withSlot.get(cousins[1]!)!.x) / 2
	);
	expect(withSlot.get(slot)!.y).toBeLessThan(withSlot.get(cousins[0]!)!.y);

	// Back on her father, the slot goes — and comes back while the gaps are asked for.
	await clickNode(page, parent);
	await expect.poll(() => stateOf(page, slot)).toBe('filtered-out');
	const gaps = (await filterMenu(page)).getByRole('menuitemcheckbox', { name: /^Show gaps/ });
	await gaps.click();
	await expect(gaps).toHaveAttribute('aria-checked', 'true');
	await expect.poll(() => stateOf(page, slot)).toBe('drawn');
});
