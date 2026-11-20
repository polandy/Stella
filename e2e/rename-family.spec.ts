import { expect, test, type Locator, type Page } from '@playwright/test';
import { appReady, openPeople, signIn } from './app';
import { LINK, personIdOf, seedHousehold } from './seed';

/*
 * Correcting a family's last name (docs/dev/02 §2.2.4.7): changing a last name in the name
 * editor offers the new spelling to the relatives still carrying the old one, all ticked; a
 * tick can be taken off, *Change for N people* writes the rest, and *No* writes nothing.
 * Never offered: a partner who kept their own name, someone outside the person's own family.
 *
 * Each case has a family of its own, with a last name no other case and not the demo household uses.
 */

/** Anna's family, the surname typed wrong: her child and sibling carry it, her partner does not. */
function family(last: string) {
	const anna = `Anna ${last}`;
	const dora = `Dora ${last}`;
	const carl = `Carl ${last}`;
	const ben = `Ben Zell${last}`;
	const fia = `Fia ${last}`;
	return {
		anna,
		dora,
		carl,
		ben,
		fia,
		stranger: `Eva ${last}`,
		people: [anna, dora, carl, ben, fia, `Eva ${last}`],
		links: [
			{ from: anna, to: dora, type: LINK.parentOf },
			{ from: anna, to: carl, type: LINK.siblingOf },
			{ from: anna, to: ben, type: LINK.partnerOf },
			// A grandchild is no part of Anna's own family, and Eva is no relative at all.
			{ from: dora, to: fia, type: LINK.parentOf }
		]
	} as const;
}

/** Retypes Anna's last name in the name editor and saves. */
async function correctLastName(page: Page, anna: string, last: string): Promise<Locator> {
	await page.goto(`/contacts/${personIdOf(anna)}`);
	await appReady(page);
	await page.getByTitle('Edit name').click();
	const editor = page.getByTestId('name-editor');
	await editor.getByLabel('Last name', { exact: true }).fill(last);
	await editor.getByRole('button', { name: 'Save', exact: true }).click();
	return page.getByTestId('rename-family');
}

/**
 * Leaves for Home and comes back through the nav: a client-side navigation flushes the batch
 * held in the undo window, so the list shows what was written (e2e/app.ts, `openPeople`).
 */
async function onPeople(page: Page): Promise<void> {
	await page.getByRole('link', { name: 'Home' }).first().click();
	await openPeople(page);
}

test('a corrected last name is offered to the family still carrying the old one', async ({
	page
}, testInfo) => {
	await signIn(page);
	// A repeat starts from people the last run already renamed, so each gets a family of its own.
	const tag = String.fromCharCode(97 + testInfo.repeatEachIndex);
	const f = family(`Brunfeld${tag}`);
	await seedHousehold(page, f.people, f.links);

	const offer = await correctLastName(page, f.anna, `Brunnfeld${tag}`);
	await expect(
		page.getByRole('heading', { name: `Anna Brunnfeld${tag}`, exact: true })
	).toBeVisible();
	await expect(offer).toContainText(
		`These relatives still carry Brunfeld${tag} — change it to Brunnfeld${tag} too?`
	);

	// Her child and sibling, each ticked; not her partner, her grandchild or the namesake.
	await expect(offer.getByRole('listitem')).toHaveText([
		new RegExp(`^${f.dora}\\s*$`),
		new RegExp(`^${f.carl}\\s*$`)
	]);
	await expect(offer.getByRole('checkbox')).toHaveCount(2);
	for (const box of await offer.getByRole('checkbox').all()) await expect(box).toBeChecked();

	// Her brother keeps his name: unticked, the count follows.
	await offer.getByRole('listitem').filter({ hasText: f.carl }).getByRole('checkbox').uncheck();
	await offer.getByRole('button', { name: 'Change for 1 person' }).click();
	await expect(offer).toHaveCount(0);
	await expect(page.getByTestId('toast-undo')).toContainText(`Last name Brunnfeld${tag} set`);

	// Written once the batch has left the undo window; then each person's own page tells.
	await onPeople(page);
	const nameOf = async (person: string): Promise<string> => {
		await page.goto(`/contacts/${personIdOf(person)}`);
		return (await page.getByRole('heading', { level: 1 }).innerText()).trim();
	};
	expect(await nameOf(f.dora)).toBe(`Dora Brunnfeld${tag}`);
	for (const kept of [f.carl, f.fia, f.stranger, f.ben]) expect(await nameOf(kept)).toBe(kept);
});

test('No closes the offer and nothing is written', async ({ page }, testInfo) => {
	await signIn(page);
	const tag = String.fromCharCode(97 + testInfo.repeatEachIndex);
	const f = family(`Hohlenstein${tag}`);
	await seedHousehold(page, f.people, f.links);

	const offer = await correctLastName(page, f.anna, `Hohlenstain${tag}`);
	await expect(offer).toContainText(`change it to Hohlenstain${tag} too?`);
	await offer.getByRole('button', { name: 'No', exact: true }).click();
	await expect(offer).toHaveCount(0);

	await onPeople(page);
	await page.goto(`/contacts/${personIdOf(f.dora)}`);
	await expect(page.getByRole('heading', { level: 1 })).toHaveText(f.dora);
});
