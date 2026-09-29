import { expect, test, type Page } from '@playwright/test';
import { openPerson, signIn } from './app';
import { LINK, seedHousehold } from './seed';

/*
 * Check relationships also offers the relatives Stella works out and nobody entered (docs/02
 * §2.4.1, docs/concepts/relationship-suggestions.md §3.5, rule K1). Written after the owner
 * verified it in the running app (docs/08 §8.4.1).
 *
 * Each case seeds a three-generation family of its own — a grandfather, his two children and
 * a grandchild — so it answers nothing about the Brunners that other specs read.
 */

interface Family {
	grandfather: string;
	parent: string;
	uncle: string;
	child: string;
}

const family = (last: string, names: [string, string, string, string]): Family => ({
	grandfather: `${names[0]} ${last}`,
	parent: `${names[1]} ${last}`,
	uncle: `${names[2]} ${last}`,
	child: `${names[3]} ${last}`
});

/** Nobody entered the uncle or the grandfather for the child: both are worked out. */
const seedFamily = (page: Page, f: Family) =>
	seedHousehold(
		page,
		[f.grandfather, f.parent, f.uncle, f.child],
		[
			{ from: f.grandfather, to: f.parent, type: LINK.parentOf },
			{ from: f.grandfather, to: f.uncle, type: LINK.parentOf },
			{ from: f.parent, to: f.child, type: LINK.parentOf }
		],
		{ [f.grandfather]: 'male', [f.uncle]: 'male' }
	);

async function review(page: Page, name: string) {
	await openPerson(page, new RegExp(name));
	await page.getByRole('link', { name: 'Check relationships' }).click();
	return page.getByTestId('kin-review');
}

const row = (panel: ReturnType<Page['getByTestId']>, text: string) =>
	panel.getByTestId('kin-suggestion').filter({ hasText: text });

test.beforeEach(async ({ page }) => {
	await signIn(page);
});

test('offers a worked-out relative, named by gender and by whom it runs through', async ({
	page
}) => {
	const f = family('Tuor', ['Gion', 'Mena', 'Flurin', 'Ladina']);
	await seedFamily(page, f);
	const panel = await review(page, f.child);

	const uncle = row(panel, `${f.uncle} is an uncle of ${f.child}`);
	await expect(uncle).toContainText(`Worked out through ${f.parent}, not entered yet`);
	await expect(uncle.getByRole('link', { name: f.parent })).toHaveAttribute('href', /\/contacts\//);
	await expect(row(panel, `${f.grandfather} is a grandfather of ${f.child}`)).toHaveCount(1);

	// The household-wide check asks the same, filed under the child.
	await page.goto(`/settings/relationships?review&q=${encodeURIComponent(f.child)}`);
	await expect(
		page.getByTestId('kin-suggestion').filter({ hasText: `${f.uncle} is an uncle of ${f.child}` })
	).toHaveCount(1);
});

test('accepting on one side enters it for both, and neither check asks again', async ({
	page
}) => {
	const f = family('Caflisch', ['Jon', 'Anna', 'Curdin', 'Sep']);
	await seedFamily(page, f);
	const panel = await review(page, f.child);
	await row(panel, `${f.uncle} is an uncle of ${f.child}`)
		.getByRole('button', { name: 'Accept' })
		.click();
	await expect(row(panel, f.uncle)).toHaveCount(0);
	await expect(page.getByTestId('toast-undo')).toBeVisible();
	await expect(page.getByText(`Entered: ${f.uncle} is an uncle of ${f.child}`)).toBeVisible();

	// Leaving sends it. The uncle's page shows the entered link from his side …
	await openPerson(page, new RegExp(f.uncle));
	await expect(
		page.locator('#section-relationships ul').first().locator('li').filter({ hasText: f.child })
	).toContainText('Aunt / uncle of');

	// … and his check no longer asks about the child, while still asking about his sister.
	const his = await review(page, f.uncle);
	await expect(row(his, f.parent)).toHaveCount(1);
	await expect(row(his, f.child)).toHaveCount(0);

	// Nor does the child's, which still offers the grandfather.
	const theirs = await review(page, f.child);
	await expect(row(theirs, f.grandfather)).toHaveCount(1);
	await expect(row(theirs, f.uncle)).toHaveCount(0);
});

test('declining stops both checks asking, and the profile still names the relative', async ({
	page
}) => {
	const f = family('Derungs', ['Pius', 'Rosa', 'Toni', 'Mia']);
	await seedFamily(page, f);
	const panel = await review(page, f.child);
	await row(panel, `${f.uncle} is an uncle of ${f.child}`)
		.getByRole('button', { name: 'Decline' })
		.click();
	await expect(row(panel, f.uncle)).toHaveCount(0);

	const his = await review(page, f.uncle);
	await expect(row(his, f.parent)).toHaveCount(1);
	await expect(row(his, f.child)).toHaveCount(0);
	// A no to entering it is not a no to the fact: it still follows from the links on record.
	await expect(page.getByTestId('derived-kin')).toContainText(f.child);
});
