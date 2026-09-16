import { expect, test, type Page } from '@playwright/test';
import { addPerson, openPerson, pickPerson, signIn } from './app';

/*
 * Derived kinship and propagation suggestions (docs/02 §2.4.1). Written after the flow was
 * verified in the running app (docs/08 §8.4.1). Runs against the demo dataset, whose
 * Brunner/Keller family carries three generations, as the demo admin.
 */

/*
 * Opens a person and their People tab. Going through `openPerson` waits for the shell to be
 * interactive first: the section's *Add relationship* disclosure is a JavaScript control and
 * answers nothing before that.
 */
async function openPeopleTab(page: Page, name: RegExp): Promise<void> {
	await openPerson(page, name);
}

/** Enters one link from the open person's page, the way the form is used by hand. */
async function addLink(page: Page, type: string, other: string): Promise<void> {
	await page.getByRole('button', { name: 'Add relationship' }).click();
	const form = page.locator('form[action="?/addRelationship"]');
	await form.locator('select[name=typeChoice]').selectOption({ label: type });
	await pickPerson(form.getByLabel('Person'), other);
	await form.getByRole('button', { name: 'Add', exact: true }).click();
	await expect(page.locator('#section-relationships')).toContainText(other);
}

test.beforeEach(async ({ page }) => {
	await signIn(page);
});

test('names the relatives nobody entered, saying who each comes through', async ({ page }) => {
	await openPeopleTab(page, /Lena Brunner/);
	const derived = page.getByTestId('derived-kin');

	// Lena's mother is Sandra Brunner-Keller, whose mother is Ursula: a grandmother nobody
	// wrote down, named through the person she comes through.
	await expect(derived).toContainText('Grandmother');
	await expect(derived).toContainText('Ursula Keller-Marti');
	await expect(derived).toContainText('via Sandra Brunner-Keller');
	// Sandra's sister and Markus's brother, and the brother's child one step further out.
	await expect(derived).toContainText('Aunt');
	await expect(derived).toContainText('Corinne Keller');
	await expect(derived).toContainText('Uncle');
	await expect(derived).toContainText('Daniel Brunner');
	await expect(derived).toContainText('Cousin');
	await expect(derived).toContainText('Timo Brunner');

	// What the household entered keeps its own wording and is never inferred a second time:
	// Hans is a stored grandparent, so he appears above and not among the derived.
	await expect(page.locator('#section-relationships').getByText('Grandchild of').first()).toBeVisible();
	await expect(derived).not.toContainText('Hans Brunner');
});

test('says nothing it cannot back: no derived relatives for someone with no family links', async ({ page }) => {
	await openPeopleTab(page, /Beat Steiner/);
	await expect(page.getByTestId('derived-kin')).toHaveCount(0);
});

/*
 * The propagation flow needs a family with room for the parent being added: every Brunner
 * child already has the two parents Stella allows (docs/02 §2.4), and a claim the write would
 * refuse is not offered at all. So this case brings its own siblings — names the demo
 * household does not use, on a page nothing else in the suite opens.
 */
test('offers the links a new parent implies, and writes only the one confirmed', async ({
	page
}) => {
	await addPerson(page, 'Rahel', 'Ammann');
	await addPerson(page, 'Silvan', 'Ammann');
	await addPerson(page, 'Thea', 'Ammann');

	// Three siblings with no parents on record yet.
	await openPeopleTab(page, /Rahel Ammann/);
	await addLink(page, 'Sibling of', 'Silvan Ammann');
	await addLink(page, 'Sibling of', 'Thea Ammann');

	// The one parent, entered from Rahel's page.
	await addLink(page, 'Child of', 'Vreni Zbinden');

	// Rahel's sisters and brother follow from it, each with the reason and its own confirmation.
	const proposals = page.getByTestId('kin-proposals');
	await expect(proposals).toContainText('Vreni Zbinden is a parent of Silvan Ammann');
	await expect(proposals).toContainText('Silvan Ammann is Rahel Ammann’s sibling.');
	await expect(proposals).toContainText('Vreni Zbinden is a parent of Thea Ammann');

	await proposals
		.getByTestId('kin-suggestion')
		.filter({ hasText: 'Silvan Ammann' })
		.getByRole('button', { name: 'Accept' })
		.click();

	// Exactly the confirmed one was written: Silvan is now stored, Thea is still only offered.
	await expect(page.getByTestId('kin-proposals')).not.toContainText('Silvan Ammann');
	await expect(page.getByTestId('kin-proposals')).toContainText('Thea Ammann');
	await openPeopleTab(page, /Silvan Ammann/);
	const stored = page.locator('#section-relationships ul').first();
	await expect(stored).toContainText('Vreni Zbinden');
	await openPeopleTab(page, /Thea Ammann/);
	await expect(page.locator('#section-relationships')).not.toContainText('Vreni Zbinden');
});
