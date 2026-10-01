import { expect, test, type Page } from '@playwright/test';
import { addPerson, appReady, signIn } from './app';

/*
 * Empty screens as invitations, and adding yourself (docs/02 §2.1.3, §2.22.3, docs/05 §5.10).
 * Written after the maintainer checked the screens in the running app (docs/08 §8.4.1).
 *
 * The suite runs on the demo household, so the first-run welcome card itself — shown only
 * while the household holds nobody but the member — is not reachable here; its rule is the
 * pure `src/lib/onboarding/welcome.ts`, unit-tested. What the demo can show is checked below.
 *
 * The Fennwicks are absent from the demo dataset, and each case names them under this
 * attempt's letters, so a retry against the same database finds no earlier attempt's person.
 */

/** Six letters no other attempt shares. */
function runLetters(): string {
	return Array.from(crypto.getRandomValues(new Uint8Array(6)), (byte) => String.fromCharCode(97 + (byte % 26))).join('');
}

/** A surname only this case uses, capitalised as a name typed by hand would be. */
const fennwick = () => `Fennwick${runLetters()}`;

/** The id of the person whose page is showing, read from the URL. */
function shownPersonId(page: Page): string {
	const match = new URL(page.url()).pathname.match(/^\/contacts\/([^/]+)/);
	if (!match) throw new Error(`Not on a person page: ${page.url()}`);
	return match[1];
}

/** Creates a circle through the Circles page and lands on it. */
async function newCircle(page: Page, name: string): Promise<void> {
	await page.goto('/circles');
	await appReady(page);
	await page.getByRole('button', { name: 'New circle' }).click();
	await page.getByLabel('Name').fill(name);
	await page.getByRole('button', { name: 'Create circle' }).click();
	await expect(page.getByRole('heading', { name })).toBeVisible();
}

test.beforeEach(async ({ page }) => {
	await signIn(page);
});

test.describe('adding yourself', () => {
	// Who you are lives in the profile and the suite shares one database: give it back.
	test.afterEach(async ({ page }) => {
		await page.goto('/settings');
		const letGo = page.getByRole('button', { name: 'None of them is me' });
		if (await letGo.isVisible()) {
			await letGo.click();
			await expect(letGo).toBeHidden();
		}
	});

	test('Settings offers to add yourself when you are not in the list, and the new person is you', async ({
		page
	}) => {
		const last = fennwick();
		await page.goto('/settings');
		await appReady(page);
		await page.getByRole('link', { name: 'Add yourself' }).click();

		await expect(page.getByRole('heading', { name: 'Add yourself' })).toBeVisible();
		await page.getByLabel('First name').fill('Mirella');
		await page.getByLabel('Last name').fill(last);
		await page.getByRole('button', { name: 'Add me' }).click();

		await expect(page.getByRole('heading', { name: `Mirella ${last}` })).toBeVisible();
		await expect(page.getByTestId('self-marker')).toBeVisible();

		// With a self chosen, Settings no longer suggests adding one.
		await page.goto('/settings');
		await expect(page.getByRole('button', { name: 'None of them is me' })).toBeVisible();
		await expect(page.getByText('Not in the list yet?')).toHaveCount(0);
	});
});

test('Home shows no welcome card in a household that already has people', async ({ page }) => {
	// signIn has already waited for Home's heading and the mounted shell.
	await expect(page.getByRole('heading', { name: 'What happened?' })).toBeVisible();
	await expect(page.getByText('Welcome to Stella')).toHaveCount(0);
});

test('a search that finds nobody offers to add them, with the name split into the form', async ({ page }) => {
	const last = fennwick();
	await page.goto(`/search?q=${encodeURIComponent(`Mirella ${last}`)}`);
	await expect(page.getByText(`No results for “Mirella ${last}”.`)).toBeVisible();

	await page.getByRole('link', { name: `Add “Mirella ${last}”` }).click();
	await expect(page.getByLabel('First name')).toHaveValue('Mirella');
	await expect(page.getByLabel('Last name')).toHaveValue(last);
});

test('People offers to add a name that matches nobody, but not from the archive', async ({ page }) => {
	// The archive view needs somebody in it to have a filter; this case brings its own and
	// takes them back out, so the rest of the suite meets the archive it expects.
	await addPerson(page, 'Tobiah', fennwick());
	const archived = page.url();
	await page.getByRole('button', { name: 'Archive this person' }).click();
	await expect(page.getByTestId('archived-marker')).toBeVisible();

	const name = `Tobiah ${fennwick()}`;
	await page.goto('/contacts');
	await appReady(page);
	await page.getByRole('searchbox', { name: 'Find someone' }).fill(name);
	await expect(page.getByRole('status')).toContainText(`Nobody matches “${name}”.`);
	await expect(page.getByRole('link', { name: `Add “${name}”` })).toBeVisible();

	await page.goto('/contacts?archived');
	await appReady(page);
	await page.getByRole('searchbox', { name: 'Find someone' }).fill(name);
	await expect(page.getByRole('status')).toContainText(`Nobody matches “${name}”.`);
	await expect(page.getByRole('link', { name: `Add “${name}”` })).toHaveCount(0);

	await page.goto(archived);
	await page.getByRole('button', { name: 'Bring back into the lists' }).click();
	await expect(page.getByTestId('archived-marker')).toHaveCount(0);
});

test('Circles offers to create a circle a search did not find, with its name filled in', async ({ page }) => {
	const name = `Fennwick choir ${runLetters()}`;
	await page.goto('/circles');
	await appReady(page);
	await page.getByRole('searchbox', { name: 'Find a circle' }).fill(name);
	await expect(page.getByText('No circle matches')).toBeVisible();

	await page.getByRole('button', { name: `Create “${name}”` }).click();
	await expect(page.getByLabel('Name')).toHaveValue(name);
});

test('an empty circle opens its members form from the invitation', async ({ page }) => {
	await newCircle(page, `Fennwick reading club ${runLetters()}`);
	await expect(page.getByText('Nobody in this circle yet')).toBeVisible();
	await expect(page.locator('form[action="?/addMembers"]')).toHaveCount(0);

	await page.getByRole('button', { name: 'Add the first members' }).click();
	await expect(page.locator('form[action="?/addMembers"]').getByLabel('People')).toBeVisible();
});

test('a new person’s page names them in its empty sections and opens the relationship form', async ({
	page
}) => {
	const name = `Tobiah ${fennwick()}`;
	await addPerson(page, 'Tobiah', name.split(' ')[1]);

	await expect(page.getByText(`Nothing noted about ${name} yet.`)).toBeVisible();
	await expect(page.getByText(`No photos of ${name} yet.`)).toBeVisible();
	const relationships = page.locator('#section-relationships');
	await expect(relationships.getByText(`${name} is not linked to anyone yet`)).toBeVisible();
	await expect(page.locator('form[action="?/addRelationship"]')).toHaveCount(0);

	await relationships.getByRole('button', { name: `Link ${name} to someone` }).click();
	await expect(page.locator('form[action="?/addRelationship"]').getByLabel('Person')).toBeVisible();
});

test('a new person’s journal invites the first entry and opens the composer', async ({ page }) => {
	await addPerson(page, 'Tobiah', fennwick());
	await page.getByRole('link', { name: 'Write' }).first().click();
	await appReady(page);

	await expect(page.getByText('No journal entries yet.')).toBeVisible();
	await expect(page.getByRole('textbox', { name: 'Entry' })).toHaveCount(0);
	await page.getByRole('button', { name: 'Write the first entry' }).click();
	await expect(page.getByRole('textbox', { name: 'Entry' })).toBeVisible();
	// The form is open above it, so the invitation stops offering a second way in.
	await expect(page.getByRole('button', { name: 'Write the first entry' })).toHaveCount(0);
});

test('the map centred on someone with no links invites the first relationship', async ({ page }) => {
	const name = `Mirella ${fennwick()}`;
	await addPerson(page, 'Mirella', name.split(' ')[1]);
	const id = shownPersonId(page);

	await page.goto(`/graph?center=${id}`);
	// The explorer opens with its centre selected; the invitation sits under the dot once
	// that panel is put away, so it never covers the panel's own actions.
	await page.getByRole('complementary').getByRole('button', { name: 'Close' }).click();
	const alone = page.getByTestId('graph-alone');
	await expect(alone).toContainText(`${name} is not linked to anyone yet`);

	await alone.getByRole('link', { name: 'Add a relationship' }).click();
	await expect(page).toHaveURL(new RegExp(`/contacts/${id}`));
	await expect(page.locator('form[action="?/addRelationship"]').getByLabel('Person')).toBeVisible();
});
