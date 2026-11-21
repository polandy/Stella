import { expect, test, type Page } from '@playwright/test';
import { addPerson, pickPerson, signIn } from './app';
import { arrangeBy, settled } from './graph-canvas';

/*
 * Framing a wide family tree (docs/dev/05 §5.8): when the whole tree fits only with tiny names, the
 * centre's core family is framed at a readable size, and a pill at the edge counts who stands off
 * screen that way; a tap on it pans there.
 *
 * The family is made from scratch so nothing the demo family asserts elsewhere shifts.
 */

/** The family, its surnames tagged so a repeat run never picks the last run's namesakes. */
function family(tag: string) {
	const last = `Tscharner${tag}`;
	return {
		parent: { first: 'Corsin', last },
		centre: { first: 'Uorschla', last },
		sibling: { first: 'Duri', last },
		cousins: ['Mevina', 'Andri', 'Flurina', 'Not'].map((first) => ({ first, last: `Vital${tag}` }))
	};
}
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

/** The zoom, and where on screen each of `ids` is drawn. */
async function view(page: Page, ids: string[]) {
	return page.evaluate((wanted) => {
		type Node = { renderedPosition(): { x: number; y: number } };
		let el: HTMLElement | null = document.querySelector('canvas');
		while (el && !('_cyreg' in el)) el = el.parentElement;
		const cy = (el as unknown as { _cyreg: { cy: { zoom(): number; $id(id: string): Node } } })
			._cyreg.cy;
		return { zoom: cy.zoom(), at: wanted.map((id) => cy.$id(id).renderedPosition()) };
	}, ids);
}

test('a wide tree frames the core family readably and counts who stands off screen', async ({
	page
}, testInfo) => {
	const {
		parent: PARENT,
		centre: CENTRE,
		sibling: SIBLING,
		cousins: COUSINS
	} = family(String.fromCharCode(97 + testInfo.repeatEachIndex));
	await page.setViewportSize({ width: 412, height: 915 });
	await signIn(page);
	await addPerson(page, PARENT.first, PARENT.last);
	const parent = contactId(page);
	await addPerson(page, SIBLING.first, SIBLING.last);
	const sibling = contactId(page);
	await relate(page, 'Child of', fullName(PARENT));
	for (const cousin of COUSINS) await addPerson(page, cousin.first, cousin.last);
	await addPerson(page, CENTRE.first, CENTRE.last);
	const centre = contactId(page);
	await relate(page, 'Child of', fullName(PARENT));
	for (const cousin of COUSINS) await relate(page, 'Cousin of', fullName(cousin));

	await page.goto(`/graph?center=${centre}`);
	await expect(page.locator('canvas').first()).toBeVisible();
	await settled(page);
	await arrangeBy(page, 'Tree');
	await settled(page);

	const framed = await view(page, [parent, centre, sibling]);
	// Names at least 7 px high: an 11-unit name at 7/11 zoom.
	expect(framed.zoom).toBeGreaterThanOrEqual(7 / 11 - 1e-6);
	for (const at of framed.at) {
		expect(at.x).toBeGreaterThan(0);
		expect(at.x).toBeLessThan(412);
	}
	const right = page.getByTestId('graph-off-screen-right');
	await expect(right).toContainText('more');
	await expect(page.getByTestId('graph-off-screen-left')).toHaveCount(0);

	await right.click();
	await settled(page);
	await expect(page.getByTestId('graph-off-screen-left')).toContainText('more');
});
