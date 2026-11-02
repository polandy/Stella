import { expect, test, type Page } from '@playwright/test';
import { appReady, recordAction, showPrivate, signIn } from './app';
import { LINK, personIdOf, seedHousehold } from './seed';

/*
 * A person's brief (docs/02 §2.2.5): what to know before a visit, read from the person's ⋯
 * menu or *Brief for …* in the palette. Its blocks stand in their order, a row leads to where
 * it is edited, and a private note stays veiled. Written after the owner tried the page in the
 * running app (docs/08 §8.4.1); print and offline stay owner hand checks.
 *
 * The suite shares one database, so every case seeds a family of its own, named with letters no
 * other attempt shares. Ages and the coming birthday hang on the server's today, so the spec
 * names who, never how old.
 */

/** Six letters no other attempt shares. */
function runLetters(): string {
	return Array.from(crypto.getRandomValues(new Uint8Array(6)), (byte) =>
		String.fromCharCode(97 + (byte % 26))
	).join('');
}

interface Family {
	parent: string;
	partner: string;
	child: string;
}

/** A parent with a partner, a child with a birthday and an address: a brief's setting. */
async function seedFamily(page: Page): Promise<Family> {
	const last = `Briefwil${runLetters()}`;
	const family = {
		parent: `Annelie ${last}`,
		partner: `Bruno ${last}`,
		child: `Mila ${last}`
	};
	await seedHousehold(
		page,
		[family.parent, family.partner, family.child],
		[
			{ from: family.parent, to: family.partner, type: LINK.partnerOf },
			{ from: family.parent, to: family.child, type: LINK.parentOf }
		],
		{},
		[],
		[],
		[],
		{ [family.child]: '2016-03-14' },
		{},
		{ [family.parent]: 'Lindenstrasse 4, 8000 Zürich' }
	);
	return family;
}

const personPage = (page: Page, name: string) => page.goto(`/contacts/${personIdOf(name)}`);
const brief = (page: Page) => page.getByTestId('person-brief');

/** The brief's blocks, top to bottom, by their test ids. */
const blockOrder = (page: Page) =>
	brief(page)
		.locator(':scope > div > [data-testid]')
		.evaluateAll((blocks) => blocks.map((block) => block.getAttribute('data-testid')));

test.beforeEach(async ({ page }) => {
	await signIn(page);
});

test('briefs a parent before a visit: family, notes, to-dos and ideas, each row a link', async ({
	page
}) => {
	const family = await seedFamily(page);
	const note = `Allergic to walnuts ${family.parent}`;
	const todo = `Bring back the cake tin ${family.parent}`;
	const idea = `A kite for the autumn ${family.parent}`;

	await personPage(page, family.parent);
	await appReady(page);
	// A private pinned note, a to-do and an open gift idea, through each card's own form.
	const notes = page.locator('#section-notes');
	await notes.getByRole('button', { name: 'Add note' }).click();
	await page.getByRole('textbox', { name: 'Note' }).fill(note);
	await notes.getByText('Pin', { exact: true }).click();
	await notes.getByText('Private', { exact: true }).click();
	await notes.getByRole('button', { name: 'Add note' }).click();
	await expect(page.getByRole('textbox', { name: 'Note' })).toHaveCount(0);

	const todos = page.locator('#section-todos');
	await todos.getByRole('button', { name: 'Add', exact: true }).click();
	await todos.getByTestId('todo-form').getByLabel('What is still to do?').fill(todo);
	await todos.getByTestId('todo-form').getByRole('button', { name: 'Save' }).click();
	await expect(page.getByTestId('todos').locator('li', { hasText: todo })).toHaveCount(1);

	const gifts = page.locator('#section-gifts');
	await gifts.getByRole('button', { name: 'Idea', exact: true }).click();
	await gifts.getByTestId('gift-form').getByLabel('What?').fill(idea);
	await gifts.getByTestId('gift-form').getByRole('button', { name: 'Save' }).click();
	await expect(page.getByTestId('gift-ideas').locator('li', { hasText: idea })).toHaveCount(1);

	await recordAction(page, 'Brief before a visit');
	await page.waitForURL(`**/contacts/${personIdOf(family.parent)}/brief`);
	await expect(brief(page).getByRole('heading', { name: family.parent })).toBeVisible();

	// Nothing on record is a moment yet, and nobody wrote down how they met: those blocks stay out.
	expect(await blockOrder(page)).toEqual([
		'brief-next',
		'brief-family',
		'brief-notes',
		'brief-todos',
		'brief-gifts'
	]);

	// The coming date is the child's birthday, and leads to the child.
	await expect(page.getByTestId('brief-next')).toContainText(family.child);
	await expect(page.getByTestId('brief-next')).toHaveAttribute(
		'href',
		`/contacts/${personIdOf(family.child)}`
	);

	const familyBlock = page.getByTestId('brief-family');
	await expect(familyBlock.getByRole('link', { name: new RegExp(family.partner) })).toBeVisible();
	await expect(familyBlock.getByRole('link', { name: new RegExp(family.child) })).toContainText(
		/\d+ years?$/
	);
	await expect(familyBlock).toContainText('Lindenstrasse 4, 8000 Zürich');

	// The private note is veiled on its author's screen until asked for.
	const notesBlock = page.getByTestId('brief-notes');
	await expect(notesBlock).not.toContainText(note);
	await expect(notesBlock).toContainText('Private, hidden');
	await showPrivate(page);
	await expect(notesBlock).toContainText(note);

	await expect(page.getByTestId('brief-todos')).toContainText(todo);

	// A row opens where it is edited: the idea, the Gifts card on the person's page.
	await page
		.getByTestId('brief-gifts')
		.getByRole('link', { name: new RegExp(idea) })
		.click();
	await page.waitForURL(`**/contacts/${personIdOf(family.parent)}#section-gifts`);
	await expect(page.getByTestId('gift-ideas').locator('li', { hasText: idea })).toBeVisible();

	// And a relative's row, their own page.
	await page.goBack();
	await page
		.getByTestId('brief-family')
		.getByRole('link', { name: new RegExp(family.child) })
		.click();
	await expect(page.getByRole('heading', { name: family.child, exact: true })).toBeVisible();
});

test('Brief for … in the palette opens the person’s brief', async ({ page }) => {
	const family = await seedFamily(page);

	await page.goto('/');
	await appReady(page);
	await page.keyboard.press('Control+k');
	const palette = page.getByRole('dialog', { name: 'Jump to' });
	await palette.getByRole('combobox').fill('brief');
	await palette.getByRole('option', { name: /^Brief for …/ }).click();
	await expect(palette.getByRole('combobox', { name: 'Brief for whom?' })).toBeFocused();
	await page.keyboard.type(family.parent);
	await expect(palette.getByRole('option')).toHaveCount(1);
	await page.keyboard.press('Enter');

	await page.waitForURL(`**/contacts/${personIdOf(family.parent)}/brief`);
	await expect(brief(page).getByRole('heading', { name: family.parent })).toBeVisible();
	await expect(page.getByTestId('brief-family')).toContainText(family.child);
	await page.getByTestId('brief-whole-page').click();
	await expect(page.getByRole('heading', { name: family.parent, exact: true })).toBeVisible();
});
