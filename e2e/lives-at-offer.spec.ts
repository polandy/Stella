import { expect, test, type Locator, type Page } from '@playwright/test';
import { appReady, pickPerson, signIn } from './app';
import { personIdOf, seedHousehold } from './seed';

/*
 * *Lives at …* (docs/02 §2.4.1): a child or partner created in the relationship picker is
 * offered the address of the person whose page it is, ticked, and moves into that home on *Add*.
 * Written after the owner tried it in the running app (docs/08 §8.4.1). Each case brings its
 * own family, whom no other spec names, and names its new people only here.
 */

test.beforeEach(async ({ page }) => {
	await signIn(page);
});

const offer = (page: Page) => page.getByTestId('lives-at-offer');
const addressFact = (page: Page) =>
	page.getByTestId('identity-facts').locator('[data-fact="address"]');

async function openSeeded(page: Page, name: string): Promise<Locator> {
	await page.goto(`/contacts/${personIdOf(name)}`);
	await expect(page.getByRole('heading', { level: 1, name })).toBeVisible();
	await appReady(page);
	await page.getByRole('button', { name: 'Add relationship' }).click();
	const form = page.locator('form[action="?/addRelationship"]');
	await expect(form).toBeVisible();
	return form;
}

/** Names someone new in the picker and selects them. */
async function createInPicker(form: Locator, name: string): Promise<void> {
	const page = form.page();
	const field = form.getByLabel('Person');
	await field.click();
	await field.fill(name);
	await page.getByTestId('person-search-create-option').click();
	await page.getByRole('button', { name: 'Add & select' }).click();
	await expect(page.getByTestId('toasts')).toContainText(`${name} was added`);
}

test('a new child moves into the parent’s home, which then names them on both pages', async ({
	page
}) => {
	await seedHousehold(
		page,
		['Gerlinde Fahrni'],
		[],
		{},
		[],
		[],
		[],
		{},
		{},
		{
			'Gerlinde Fahrni': 'Mattenweg 7\n3600 Thun'
		}
	);
	const form = await openSeeded(page, 'Gerlinde Fahrni');
	await form.locator('select[name=typeChoice]').selectOption({ label: 'Parent of' });
	await createInPicker(form, 'Ilvy Fahrni');

	await expect(offer(page)).toContainText('Lives at Mattenweg 7, 3600 Thun');
	await expect(offer(page)).toContainText('with Gerlinde Fahrni');
	await expect(offer(page).getByRole('checkbox')).toBeChecked();
	await form.getByRole('button', { name: 'Add', exact: true }).click();
	await expect(page.getByTestId('relationship-list')).toContainText('Ilvy Fahrni');

	// Linked, not copied: the parent's own address became the home they both live in.
	const livesWith = addressFact(page).locator('[data-lives-with]');
	await expect(livesWith).toContainText('Ilvy Fahrni');
	await livesWith.getByRole('link', { name: 'Ilvy Fahrni' }).click();
	await expect(page.getByRole('heading', { level: 1, name: 'Ilvy Fahrni' })).toBeVisible();
	await expect(addressFact(page)).toContainText('Mattenweg 7, 3600 Thun');
	await expect(addressFact(page).locator('[data-lives-with]')).toContainText('Gerlinde Fahrni');
});

test('is offered only for someone new as a child or partner, and unticked leaves them without an address', async ({
	page
}) => {
	await seedHousehold(
		page,
		['Severin Gautschi', 'Margrit Gautschi'],
		[],
		{},
		[],
		[],
		[],
		{},
		{},
		{
			'Severin Gautschi': 'Rainweg 3\n5000 Aarau'
		}
	);
	const form = await openSeeded(page, 'Severin Gautschi');
	await form.locator('select[name=typeChoice]').selectOption({ label: 'Partner of' });

	// Someone already in Stella may live anywhere: nothing is offered.
	await pickPerson(form.getByLabel('Person'), 'Margrit Gautschi');
	await expect(form.getByLabel('Person')).toBeVisible();
	await expect(offer(page)).toHaveCount(0);
	await form.getByRole('button', { name: 'Remove Margrit Gautschi' }).click();

	// Someone new is — the positive control for the case above.
	await createInPicker(form, 'Ladina Gautschi');
	await expect(offer(page)).toBeVisible();

	// Not for a parent: *Child of* takes the offer away again.
	await form.locator('select[name=typeChoice]').selectOption({ label: 'Child of' });
	await expect(offer(page)).toHaveCount(0);
	await form.locator('select[name=typeChoice]').selectOption({ label: 'Partner of' });

	await offer(page).getByRole('checkbox').uncheck();
	await form.getByRole('button', { name: 'Add', exact: true }).click();
	await expect(page.getByTestId('relationship-list')).toContainText('Ladina Gautschi');
	await expect(addressFact(page).locator('[data-lives-with]')).toHaveCount(0);

	await page
		.locator('#section-relationships')
		.getByRole('link', { name: 'Ladina Gautschi' })
		.first()
		.click();
	await expect(page.getByRole('heading', { level: 1, name: 'Ladina Gautschi' })).toBeVisible();
	await expect(addressFact(page)).toHaveCount(0);
});
