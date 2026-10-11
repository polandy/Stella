import { expect, test, type Page } from '@playwright/test';
import { addPerson, pickPerson, signIn } from './app';
import { arrangeBy, settled, stateOf } from './graph-canvas';

/*
 * The family tree's slots for missing parents (docs/02 §2.7, docs/05 §5.8): a "+" where a
 * parent of the centre's line is missing, read by the keyboard walk as the button it is, and
 * opening the child's page with the relationship form on *Child of*. Only in the tree, and no
 * kind of line the Filter counts. Written after the owner tried it on #376 (docs/08 §8.4.1).
 *
 * The pair is made from scratch so nothing the demo family asserts elsewhere in the serial
 * suite shifts.
 */

const CHILD = { first: 'Annalena', last: 'Gadient' };
const PARENT = { first: 'Jachen', last: 'Gadient' };
const fullName = (who: { first: string; last: string }) => `${who.first} ${who.last}`;
const slotOf = (childId: string) => `slot:parent-of:${childId}`;

/** The id of the person whose page is open. */
function contactId(page: Page): string {
	const id = new URL(page.url()).pathname.split('/')[2];
	if (!id) throw new Error(`not on a person's page: ${page.url()}`);
	return id;
}

/** Every slot the renderer holds, with the name the keyboard walk reads for it. */
async function slotsOnCanvas(page: Page): Promise<{ id: string; name: string }[]> {
	return page.evaluate(() => {
		type Node = { id(): string; data(key: string): string };
		let el: HTMLElement | null = document.querySelector('canvas');
		while (el && !('_cyreg' in el)) el = el.parentElement;
		const cy = el
			? (el as unknown as { _cyreg: { cy: { nodes(selector: string): Node[] } } })._cyreg.cy
			: null;
		return (cy?.nodes('.slot') ?? [])
			.map((n) => ({ id: n.id(), name: n.data('name') }))
			.sort((a, b) => a.id.localeCompare(b.id));
	});
}

const canvasOf = (page: Page) => page.getByRole('application', { name: 'Relationship map' });
/** The line that names who the keyboard is on (the canvas itself has no text). */
const announcement = (page: Page) => page.locator('[role="application"] ~ p[aria-live="polite"]');
const filterPill = (page: Page) => page.getByRole('button', { name: /^Filter/ });

/** Opens the explorer on somebody in the arrangement named, once everyone is in place. */
async function openMap(page: Page, centerId: string, arrangement: string): Promise<void> {
	await page.goto(`/graph?center=${centerId}`);
	await expect(page.locator('canvas').first()).toBeVisible();
	await settled(page);
	await arrangeBy(page, arrangement);
	await settled(page);
}

test('the tree offers a slot for each missing parent, walked to by keyboard, that adds the parent', async ({
	page
}) => {
	await signIn(page);
	await addPerson(page, PARENT.first, PARENT.last);
	const parent = contactId(page);
	await addPerson(page, CHILD.first, CHILD.last);
	const child = contactId(page);

	// Nobody on record: one slot over her, named for what it adds.
	await openMap(page, child, 'Tree');
	await expect
		.poll(() => slotsOnCanvas(page))
		.toEqual([{ id: slotOf(child), name: 'Add a parent of Annalena' }]);
	await expect.poll(() => stateOf(page, slotOf(child))).toBe('drawn');

	// The free layout has no generations to offer a parent in: the slot goes.
	await arrangeBy(page, 'Free');
	await settled(page);
	await expect.poll(() => slotsOnCanvas(page)).toEqual([]);
	await arrangeBy(page, 'Tree');
	await settled(page);
	await expect.poll(() => slotsOnCanvas(page)).toHaveLength(1);

	// The keyboard walk steps onto the slot like onto a person and reads it as a button.
	await page.getByLabel('Find a person').focus();
	await page.keyboard.press('Shift+Tab');
	await expect(canvasOf(page)).toBeFocused();
	await expect(announcement(page)).toHaveText('Annalena Gadient, selected');
	await page.keyboard.press('ArrowUp');
	await expect(announcement(page)).toHaveText('Add a parent of Annalena, button');

	// Enter opens her page with the relationship form on "Child of".
	await page.keyboard.press('Enter');
	await expect(page).toHaveURL(
		new RegExp(`/contacts/${child}\\?relate=&as=reverse:parent_child#section-relationships$`)
	);
	const form = page.locator('form[action="?/addRelationship"]');
	await expect(form.locator('select[name=typeChoice] option:checked')).toHaveText('Child of');
	await pickPerson(form.getByLabel('Person'), fullName(PARENT));
	await form.getByRole('button', { name: 'Add', exact: true }).click();
	await expect(
		page
			.getByTestId('relationship-list')
			.locator('li')
			.filter({ hasText: fullName(PARENT) })
	).toBeVisible();

	// Back in the tree the parent stands where the slot was offered; the slot beside him now
	// asks for her other parent, and one over him for his own.
	await openMap(page, child, 'Tree');
	await expect.poll(() => stateOf(page, parent)).toBe('drawn');
	await expect
		.poll(() => slotsOnCanvas(page))
		.toEqual(
			[
				{ id: slotOf(child), name: 'Add Annalena’s other parent' },
				{ id: slotOf(parent), name: 'Add a parent of Jachen' }
			].sort((a, b) => a.id.localeCompare(b.id))
		);

	// A slot is no kind of line: the Filter sums up the same with the slots drawn or gone.
	// Nor does the pill stand out as if the map had been narrowed.
	await expect(filterPill(page)).toHaveAccessibleName('Filter: 6 of 6 kinds of line shown');
	await expect(filterPill(page)).not.toHaveClass(/border-transparent/);
	const inTree = await filterPill(page).ariaSnapshot();
	await arrangeBy(page, 'Free');
	await settled(page);
	await expect.poll(() => slotsOnCanvas(page)).toEqual([]);
	expect(await filterPill(page).ariaSnapshot()).toBe(inTree);
});
