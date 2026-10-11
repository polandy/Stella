import { expect, test, type Page } from '@playwright/test';
import { addPerson, editPeople, pickPerson, signIn } from './app';
import { arrangeBy, filterMenu, nodeLabel, settled } from './graph-canvas';

/*
 * A link marked former on the map (docs/02 §2.7, docs/05 §5.8): still drawn, dashed and named
 * "· former", behind a Filter switch that is remembered and that the pill owns up to, and read
 * as "· former" under the name in the family tree. Written after the owner tried it on #375
 * (docs/08 §8.4.1).
 *
 * The pair is made from scratch so nothing the demo family asserts elsewhere in the serial
 * suite shifts.
 */

const ME = { first: 'Corsin', last: 'Albin' };
const EX = { first: 'Ladina', last: 'Flury' };
const fullName = (who: { first: string; last: string }) => `${who.first} ${who.last}`;

const enteredRow = (page: Page, otherName: string) =>
	page.getByTestId('relationship-list').locator('li').filter({ hasText: otherName });

/** The id of the person whose page is open. */
function contactId(page: Page): string {
	const id = new URL(page.url()).pathname.split('/')[2];
	if (!id) throw new Error(`not on a person's page: ${page.url()}`);
	return id;
}

/** What the renderer holds of the relationship line between two people, as it draws it. */
async function lineBetween(page: Page, a: string, b: string) {
	return page.evaluate(
		([x, y]) => {
			type Edge = {
				data(key: string): string;
				hasClass(name: string): boolean;
				style(name: string): string;
			};
			let el: HTMLElement | null = document.querySelector('canvas');
			while (el && !('_cyreg' in el)) el = el.parentElement;
			const cy = el ? (el as unknown as { _cyreg: { cy: { edges(): Edge[] } } })._cyreg.cy : null;
			const edge = cy
				?.edges()
				.find(
					(e) =>
						e.data('kind') === 'relationship' &&
						((e.data('source') === x && e.data('target') === y) ||
							(e.data('source') === y && e.data('target') === x))
				);
			if (!edge) return null;
			return {
				name: edge.data('label'),
				former: edge.hasClass('former'),
				dashed: edge.style('line-style') === 'dashed',
				highlighted: edge.hasClass('highlight'),
				// A filter keeps the line in the renderer and only stops drawing it.
				drawn: !edge.hasClass('filtered-out') && edge.style('display') !== 'none',
				width: parseFloat(edge.style('width'))
			};
		},
		[a, b]
	);
}

const formerSwitch = (page: Page) => page.getByRole('menuitemcheckbox', { name: /^Former links/ });

test('a former link is drawn dashed and named so, hides behind a remembered switch, and reads "· former" in the tree', async ({
	page
}) => {
	await signIn(page);
	await addPerson(page, EX.first, EX.last);
	const ex = contactId(page);
	await addPerson(page, ME.first, ME.last);
	const me = contactId(page);

	// A partnership, then marked former on its row — the way it ends in real life.
	await page.getByRole('button', { name: 'Add relationship' }).click();
	const form = page.locator('form[action="?/addRelationship"]');
	await form.locator('select[name=typeChoice]').selectOption({ label: 'Partner of' });
	await pickPerson(form.getByLabel('Person'), fullName(EX));
	await form.getByRole('button', { name: 'Add', exact: true }).click();
	await expect(enteredRow(page, fullName(EX))).toBeVisible();
	await editPeople(page);
	await enteredRow(page, fullName(EX)).getByRole('button', { name: 'Edit' }).click();
	const editor = page.locator('form[action="?/editRelationship"]');
	await editor.locator('select[name=status]').selectOption('former');
	await editor.getByRole('button', { name: 'Save' }).click();
	await expect(enteredRow(page, fullName(EX))).toContainText('former');

	// On the map the line stays, dashed, its name saying former. The explorer opens with the
	// centre selected, so the line is lifted — and still thinner than a current line would be.
	await page.goto(`/graph?center=${me}`);
	await expect(page.locator('canvas').first()).toBeVisible();
	await settled(page);
	await expect
		.poll(() => lineBetween(page, me, ex))
		.toMatchObject({
			former: true,
			drawn: true,
			dashed: true,
			highlighted: true
		});
	const line = await lineBetween(page, me, ex);
	expect(line?.name).toMatch(/· former$/);
	expect(line?.width).toBeLessThan(2.6);
	const pill = page.getByRole('button', { name: /^Filter/ });
	await expect(pill).toHaveAccessibleName('Filter: 6 of 6 kinds of line shown');
	await expect(pill).not.toHaveClass(/border-transparent/);

	// Switched off, the line leaves the map and the pill stands out, saying why.
	await filterMenu(page);
	await expect(formerSwitch(page)).toHaveAttribute('aria-checked', 'true');
	await formerSwitch(page).click();
	await expect(formerSwitch(page)).toHaveAttribute('aria-checked', 'false');
	await expect.poll(async () => (await lineBetween(page, me, ex))?.drawn ?? false).toBe(false);
	await page.keyboard.press('Escape');
	await expect(pill).toHaveAccessibleName(
		'Filter: 6 of 6 kinds of line shown, former links hidden'
	);
	await expect(pill).toHaveClass(/border-transparent/);

	// This device remembers the switch.
	await page.reload();
	await expect(page.locator('canvas').first()).toBeVisible();
	await settled(page);
	await expect(pill).toHaveAccessibleName(
		'Filter: 6 of 6 kinds of line shown, former links hidden'
	);
	await expect(pill).toHaveClass(/border-transparent/);
	expect((await lineBetween(page, me, ex))?.drawn ?? false).toBe(false);

	// Back on, and in the family tree the role under her name says the tie has ended.
	await filterMenu(page);
	await formerSwitch(page).click();
	await expect(formerSwitch(page)).toHaveAttribute('aria-checked', 'true');
	await page.keyboard.press('Escape');
	await expect.poll(async () => (await lineBetween(page, me, ex))?.drawn).toBe(true);
	await arrangeBy(page, 'Tree');
	await settled(page);
	await expect.poll(() => nodeLabel(page, ex)).toMatch(/^Ladina.*\n.+ · former$/);
});
