import { expect, test, type Locator, type Page } from '@playwright/test';
import { addPerson, appReady, pickPerson, signIn } from './app';
import { LINK, personIdOf, seedHousehold } from './seed';

/*
 * The relationship form with several people picked (docs/02 §2.4). Written after the flow was
 * verified in the running app (docs/08 §8.4.1).
 *
 * The suite shares one demo database, so every case seeds the family it works on, under names
 * no other spec uses; the demo people are left as they are.
 */

const PIXEL_9_PRO = { width: 412, height: 915 };

/** Opens a seeded person's page. */
async function openSeeded(page: Page, name: string): Promise<void> {
	await page.goto(`/contacts/${personIdOf(name)}`);
	await expect(page.getByRole('heading', { name })).toBeVisible();
	await appReady(page);
}

/**
 * Opens the *Add relationship* form on the person page shown. Found by its type picker, not by
 * its action: the action becomes `?/addRelationships` once two people are picked.
 */
async function openRelationshipForm(page: Page): Promise<Locator> {
	await page.getByRole('button', { name: 'Add relationship' }).click();
	const form = page
		.locator('#section-relationships form')
		.filter({ has: page.locator('select[name=typeChoice]') });
	await expect(form).toBeVisible();
	return form;
}

const chooseType = (form: Locator, type: string) =>
	form.locator('select[name=typeChoice]').selectOption({ label: type });

const chip = (form: Locator, name: string) =>
	form.getByTestId('person-search-chip').filter({ hasText: name });

const hints = (form: Locator) => form.getByTestId('relationship-hints');

/** The stored links, not the card: the form's chips name the picked people until it closes. */
const storedList = (page: Page) => page.getByTestId('relationship-list');

const storedRow = (page: Page, name: string) => storedList(page).locator('li').filter({ hasText: name });

test.beforeEach(async ({ page }) => {
	await signIn(page);
});

test('gives a new person both parents in one go, with one toast', async ({ page }) => {
	const [mother, father] = ['Ysolda Quarzenegg', 'Xaver Quarzenegg'];
	await seedHousehold(page, [mother, father]);
	await addPerson(page, 'Zita', 'Quarzenegg');

	const form = await openRelationshipForm(page);
	await chooseType(form, 'Child of');
	await expect(hints(form)).toHaveText('Up to two parents.');
	await pickPerson(form.getByLabel('Person'), mother);
	await pickPerson(form.getByLabel('Person'), father);
	await expect(chip(form, mother)).toBeVisible();
	await expect(chip(form, father)).toBeVisible();
	await expect(hints(form)).toHaveText('Two parents — that is the limit for Child of.');

	await form.getByRole('button', { name: 'Add 2 links' }).click();
	await expect(storedRow(page, mother)).toContainText('Child of');
	await expect(storedRow(page, father)).toContainText('Child of');
	// One toast for the batch, not one per link.
	await expect(page.getByTestId('toast-undo')).toHaveText(/2 links saved/);
	await expect(page.getByTestId('toast-undo')).toHaveCount(1);

	await page.reload();
	await expect(storedRow(page, mother)).toContainText('Child of');
	await expect(storedRow(page, father)).toContainText('Child of');
});

test('takes both links of a batch back with one Undo', async ({ page }) => {
	const [mother, father] = ['Philomena Brunnhofer', 'Eusebius Brunnhofer'];
	await seedHousehold(page, [mother, father]);
	await addPerson(page, 'Afra', 'Brunnhofer');

	const form = await openRelationshipForm(page);
	await chooseType(form, 'Child of');
	await pickPerson(form.getByLabel('Person'), mother);
	await pickPerson(form.getByLabel('Person'), father);
	await form.getByRole('button', { name: 'Add 2 links' }).click();
	await expect(storedRow(page, mother)).toBeVisible();
	await expect(storedRow(page, father)).toBeVisible();

	await page.getByTestId('toast-undo').getByRole('button', { name: 'Undo' }).click();
	// The empty card is the positive signal that both links are gone, not just one.
	await expect(page.getByText('Afra Brunnhofer is not linked to anyone yet')).toBeVisible();
	await expect(storedList(page)).toHaveCount(0);

	await page.reload();
	await expect(page.getByText('Afra Brunnhofer is not linked to anyone yet')).toBeVisible();
	await expect(storedList(page)).toHaveCount(0);
});

test('lets someone with one parent take only one more', async ({ page }) => {
	const [child, mother, father, uncle] = ['Theodora Tellenbach', 'Kunigunde Tellenbach', 'Notker Tellenbach', 'Gallus Tellenbach'];
	await seedHousehold(page, [child, mother, father, uncle], [{ from: mother, to: child, type: LINK.parentOf }]);
	await openSeeded(page, child);

	const form = await openRelationshipForm(page);
	await chooseType(form, 'Child of');
	await expect(hints(form)).toHaveText('One more parent: one is on record already.');

	await pickPerson(form.getByLabel('Person'), father);
	await expect(chip(form, father)).toBeVisible();
	// The field closes at the cap rather than taking a third parent.
	const search = form.getByLabel('Person');
	await expect(search).toBeDisabled();
	await expect(search).toHaveAttribute('placeholder', 'No more for this type');
	await expect(hints(form)).toHaveText('Two parents — that is the limit for Child of.');
	await expect(form.getByTestId('person-search-chip')).toHaveCount(1);
	await expect(chip(form, uncle)).toHaveCount(0);
	await expect(form.getByRole('button', { name: 'Add', exact: true })).toBeEnabled();
});

test('marks a person the rules refuse on their chip, and keeps Add off until they are removed', async ({
	page
}) => {
	// Meinrad has two parents already, so a third cannot be added; Pirmin has none.
	const [subject, mira, sven, mother, father] = [
		'Hildegard Zwyssig',
		'Meinrad Zwyssig',
		'Pirmin Zwyssig',
		'Odilia Zwyssig',
		'Florin Zwyssig'
	];
	await seedHousehold(
		page,
		[subject, mira, sven, mother, father],
		[
			{ from: mother, to: mira, type: LINK.parentOf },
			{ from: father, to: mira, type: LINK.parentOf }
		]
	);
	await openSeeded(page, subject);

	const form = await openRelationshipForm(page);
	await chooseType(form, 'Parent of');
	await pickPerson(form.getByLabel('Person'), mira);
	await pickPerson(form.getByLabel('Person'), sven);

	await expect(chip(form, mira)).toHaveAttribute('data-marked', 'true');
	await expect(chip(form, sven)).not.toHaveAttribute('data-marked');
	await expect(hints(form)).toContainText(`${mira} already has 2 parents`);
	await expect(hints(form)).toContainText('Remove the marked person to add the others.');
	await expect(form.getByRole('button', { name: 'Add 2 links' })).toBeDisabled();

	await form.getByRole('button', { name: `Remove ${mira}` }).click();
	await expect(chip(form, mira)).toHaveCount(0);
	await expect(form.getByRole('button', { name: 'Add', exact: true })).toBeEnabled();
	await expect(hints(form)).toBeEmpty();
});

test('marks a person the save refuses, and stores nobody of the batch', async ({ page }) => {
	// Cölestin is already Albin's parent: "Albin is a parent of Cölestin" is refused by the server,
	// which the form's own rules do not know about.
	const [subject, ernst, gina] = ['Albin Gnehm', 'Cölestin Gnehm', 'Brigitta Gnehm'];
	await seedHousehold(page, [subject, ernst, gina], [{ from: ernst, to: subject, type: LINK.parentOf }]);
	await openSeeded(page, subject);

	const form = await openRelationshipForm(page);
	await chooseType(form, 'Parent of');
	await pickPerson(form.getByLabel('Person'), ernst);
	await pickPerson(form.getByLabel('Person'), gina);
	const add = form.getByRole('button', { name: 'Add 2 links' });
	await expect(add).toBeEnabled();
	await add.click();

	await expect(hints(form)).toContainText(`${ernst}: These two are already linked the other way round`);
	await expect(chip(form, ernst)).toHaveAttribute('data-marked', 'true');
	await expect(chip(form, gina)).not.toHaveAttribute('data-marked');
	await expect(add).toBeDisabled();
	// The link on record is listed, and Brigitta — allowed on her own — was not stored either.
	await expect(storedRow(page, ernst)).toContainText('Child of');
	await expect(storedRow(page, gina)).toHaveCount(0);

	await page.reload();
	await expect(storedRow(page, ernst)).toContainText('Child of');
	await expect(storedList(page).locator('li')).toHaveCount(1);
});

test('dates each pair from its own birthday when the birthdays differ', async ({ page }) => {
	const [parent, lou, mats] = ['Niklaus Schwyzer', 'Ignaz Schwyzer', 'Odilia Schwyzer'];
	await seedHousehold(page, [parent, lou, mats], [], {}, [], [], [], {
		[lou]: '2012-04-03',
		[mats]: '2015-09-21'
	});
	await openSeeded(page, parent);

	const form = await openRelationshipForm(page);
	await chooseType(form, 'Parent of');
	await pickPerson(form.getByLabel('Person'), lou);
	await pickPerson(form.getByLabel('Person'), mats);

	const forLou = form.getByRole('group', { name: `Since, for ${lou}` });
	const forMats = form.getByRole('group', { name: `Since, for ${mats}` });
	await expect(forLou.getByLabel('Year', { exact: true })).toHaveValue('2012');
	await expect(forLou.getByLabel('Month', { exact: true })).toHaveValue('4');
	await expect(forLou.getByLabel('Day', { exact: true })).toHaveValue('3');
	await expect(forMats.getByLabel('Year', { exact: true })).toHaveValue('2015');
	await expect(forMats.getByLabel('Month', { exact: true })).toHaveValue('9');
	await expect(forMats.getByLabel('Day', { exact: true })).toHaveValue('21');

	// One date for all starts from the first pair's day, and the per-person fields come back.
	await form.getByRole('button', { name: 'Use one date for all' }).click();
	const shared = form.getByRole('group', { name: 'Since', exact: true });
	await expect(shared.getByLabel('Year', { exact: true })).toHaveValue('2012');
	await expect(forLou).toHaveCount(0);
	await form.getByRole('button', { name: 'A date per person' }).click();
	await expect(forMats.getByLabel('Year', { exact: true })).toHaveValue('2015');

	await form.getByRole('button', { name: 'Add 2 links' }).click();
	await expect(storedRow(page, lou)).toContainText('since 3 April 2012');
	await expect(storedRow(page, mats)).toContainText('since 21 September 2015');
});

test('saves a single person exactly as before', async ({ page }) => {
	const child = 'Kunigunde Ruosch';
	await seedHousehold(page, [child]);
	await addPerson(page, 'Notker', 'Ruosch');

	const form = await openRelationshipForm(page);
	await chooseType(form, 'Parent of');
	await pickPerson(form.getByLabel('Person'), child);
	await expect(form).toHaveAttribute('action', '?/addRelationship');
	// One person: the shared-description wording and the batch's button stay away.
	await expect(form.getByText('How they connect (optional)')).toBeVisible();
	await form.getByRole('button', { name: 'Add', exact: true }).click();

	await expect(storedRow(page, child)).toContainText('Parent of');
	await expect(page.getByTestId('toast-notice')).toHaveText('Saved');
	await expect(page.getByTestId('toast-undo')).toHaveCount(0);
});

test.describe('on a phone', () => {
	test.use({ viewport: PIXEL_9_PRO, hasTouch: true });

	test('shows the chips and a date per pair within the screen', async ({ page }) => {
		const [parent, kim, ole] = ['Hildegard Nüesch', 'Xaver Nüesch', 'Ysolda Nüesch'];
		await seedHousehold(page, [parent, kim, ole], [], {}, [], [], [], {
			[kim]: '2010-02-14',
			[ole]: '2013-11-30'
		});
		await openSeeded(page, parent);

		const form = await openRelationshipForm(page);
		await chooseType(form, 'Parent of');
		await pickPerson(form.getByLabel('Person'), kim);
		await pickPerson(form.getByLabel('Person'), ole);

		const parts = [
			chip(form, kim),
			chip(form, ole),
			form.getByRole('group', { name: `Since, for ${kim}` }),
			form.getByRole('group', { name: `Since, for ${ole}` }),
			form.getByRole('button', { name: 'Add 2 links' })
		];
		for (const part of parts) {
			await expect(part).toBeVisible();
			// Polled: a chip just added can still be moving the field's layout.
			await expect
				.poll(async () => {
					const box = await part.boundingBox();
					return box !== null && box.x >= 0 && box.x + box.width <= PIXEL_9_PRO.width;
				})
				.toBe(true);
		}
		// Nothing pushes the page sideways.
		await expect
			.poll(() =>
				page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)
			)
			.toBe(true);

		await form.getByRole('button', { name: 'Add 2 links' }).click();
		await expect(storedRow(page, kim)).toContainText('since 14 February 2010');
		await expect(storedRow(page, ole)).toContainText('since 30 November 2013');
	});
});
