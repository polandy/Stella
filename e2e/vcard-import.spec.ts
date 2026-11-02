import { expect, test, type Page } from '@playwright/test';
import { signIn } from './app';

/*
 * The third file the import wizard takes: a vCard (docs/02 §2.16, docs/monica-mapping.md).
 * Written after a real address-book export went through the wizard and was checked in the app
 * (docs/08 §8.4.1).
 *
 * What this file proves that neither Monica spec can: a `.vcf` is recognised with nothing to
 * pick, a format that carries people but no relationships says so instead of leaving the gap to
 * be noticed, vCard 2.1's quoted-printable text survives the whole way to the person's page, and
 * a card with no UID still becomes exactly one person. And the review a vCard goes through: who
 * each card is, asked before anything is written, remembered so a re-run asks nothing, and a
 * skip that *Skipped contacts* can take back. Its people (the Trachsels, Beat Schläfli) appear
 * in no seed and in no other fixture, so these cases share the suite's one database safely.
 */

const VCARD = 'e2e/fixtures/contacts-mini.vcf';
const MATCH = 'e2e/fixtures/contacts-match.vcf';
const PHOTO_ID = 'vcard:photo:5e2a7c10-3333-4b8f-9d22-000000000001~photo0';

// Each case reads what the one before it wrote.
test.describe.configure({ mode: 'serial' });

/** Upload → preview: returns once the preview is on screen. */
async function previewVCard(page: Page, file: string): Promise<void> {
	await page.goto('/settings/import');
	await page.locator('input[name=dump]').setInputFiles(file);
	await page.getByRole('button', { name: 'Preview' }).click();
	await expect(page.getByTestId('import-preview')).toBeVisible();
}

/** Upload → preview → review: returns once the review is on screen. */
async function reviewVCard(page: Page, file: string): Promise<void> {
	await previewVCard(page, file);
	await page.getByRole('button', { name: 'Review contacts' }).click();
	await expect(page.getByTestId('contact-review')).toBeVisible();
}

/** Upload a file the reader must refuse, and return the wizard's own message. */
async function uploadBroken(page: Page, name: string, body: string): Promise<void> {
	await page.goto('/settings/import');
	await page.locator('input[name=dump]').setInputFiles({
		name,
		mimeType: 'text/vcard',
		buffer: Buffer.from(body)
	});
	await page.getByRole('button', { name: 'Preview' }).click();
}

test.beforeEach(async ({ page }) => {
	await signIn(page);
});

test('reviews a vCard, adds the ticked contacts, stores the picture and shows the people', async ({
	page
}) => {
	await previewVCard(page, VCARD);
	const preview = page.getByTestId('import-preview');
	await expect(preview.locator('div', { hasText: /^contacts/ })).toContainText('3');
	await expect(preview.locator('div', { hasText: /^contact fields/ })).toContainText('7');
	await expect(preview.locator('div', { hasText: /^tags/ })).toContainText('2');
	await expect(preview.locator('div', { hasText: /^photos/ })).toContainText('1');
	// A vCard has no way to say how people are connected, and the report says so.
	await expect(preview.locator('div', { hasText: /^relationships/ })).toContainText('0');
	await expect(page.getByText(/carries people only/)).toBeVisible();

	// Nothing goes in straight away: a vCard is reviewed against the people already there.
	await expect(page.getByRole('button', { name: 'Import now' })).toHaveCount(0);
	await page.getByRole('button', { name: 'Review contacts' }).click();
	const review = page.getByTestId('contact-review');
	await expect(review).toContainText('3 contacts in a vCard file.');
	await expect(review).toContainText('3 no one yet');

	// Nobody matches, so all three are one checklist, and nothing is ticked at the start.
	const fresh = page.getByTestId('new-contacts');
	await expect(fresh.getByRole('checkbox', { checked: true })).toHaveCount(0);
	await expect(page.getByRole('button', { name: 'Import 0 answers' })).toBeDisabled();
	await fresh.getByRole('button', { name: 'Select all' }).click();
	await fresh.getByRole('button', { name: 'Add all 3 as new' }).click();
	await expect(review).toContainText('Every contact has an answer.');
	await page.getByRole('button', { name: 'Import 3 answers' }).click();
	await expect(page.getByTestId('import-done')).toContainText('0 completed, 3 new, 0 skipped.');

	// The picture is inside the card, so there is nothing to point at — and the button that
	// replaces the folder picker is the positive control for that absence.
	await expect(page.getByLabel('Monica photo folder')).toHaveCount(0);
	await page.getByRole('button', { name: 'Store photos' }).click();
	// One of the two PHOTO lines was only a link, so its bytes were never in the file.
	await expect(page.getByText('1 of 1 · 1 stored')).toBeVisible();
	await page.getByRole('button', { name: 'Finish' }).click();
	await expect(page).toHaveURL(/\/contacts$/);

	// Her card carries a nickname, which is part of the name it shapes (docs/02 §2.2).
	await page
		.getByRole('link', { name: /Odile Margrit “Odi” Trachsel/ })
		.first()
		.click();
	await expect(page.getByRole('heading', { name: 'Odile Margrit “Odi” Trachsel' })).toBeVisible();
	await expect(page.getByText('19 May 1984')).toBeVisible();
	await expect(page.locator('section[data-row="Tags"]')).toContainText('Jodlerchoerli');
	// The note was folded across lines and escaped its own comma; both survived.
	await expect(page.getByText('Leiht mir jedes Jahr das Zelt, ohne zu fragen.')).toBeVisible();
	// The picture went through the browser's resize pipeline and became the avatar.
	await expect(page.locator('img[alt="Odile Margrit “Odi” Trachsel"]')).toHaveAttribute(
		'src',
		new RegExp(PHOTO_ID)
	);

	// The second card is vCard 2.1: quoted-printable text and a birthday with no year.
	await page.goto('/contacts');
	await page
		.getByRole('link', { name: /Bruno Trachsel/ })
		.first()
		.click();
	await expect(page.getByText('3 September')).toBeVisible();
	await expect(page.getByText('Fischt am liebsten früh am Morgen im Thunersee.')).toBeVisible();

	// The third card has no UID at all, and is one person rather than none or two.
	await page.goto('/contacts');
	await expect(page.getByRole('link', { name: /Quartierverein Lerchenfeld/ })).toHaveCount(1);
});

test('a second run of the same vCard asks nothing and writes nothing twice', async ({ page }) => {
	await reviewVCard(page, VCARD);
	const review = page.getByTestId('contact-review');
	await expect(review).toContainText(
		'3 are linked to their people already and unchanged since, so they are not shown.'
	);
	await expect(review).toContainText('Nothing to ask: every contact in this file has its answer.');
	await expect(page.getByTestId('review-card')).toHaveCount(0);
	await page.getByRole('button', { name: 'Import 0 answers' }).click();
	await expect(page.getByTestId('import-done')).toContainText('0 completed, 0 new, 0 skipped.');
	// A card linked and unchanged is not part of the review, so neither is its picture.
	await expect(page.getByRole('button', { name: 'Finish' })).toBeVisible();
	await expect(page.getByRole('button', { name: 'Store photos' })).toHaveCount(0);
	await page.goto('/contacts');
	await expect(page.getByRole('link', { name: /Odile Margrit “Odi” Trachsel/ })).toHaveCount(1);
});

test('completes a strong match with the side of a conflict the member picks, and a skip can be taken back', async ({
	page
}) => {
	// Another address book's card for the Odile the first case brought in: the same email.
	await reviewVCard(page, MATCH);
	const odile = page.getByTestId('review-card').filter({ hasText: 'Strong match' });
	await expect(odile).toContainText('same email odile@example.ch');
	await expect(odile).toContainText('Would add');
	await expect(odile).toContainText('Birthday differs');
	// Stella's birthday is picked at the start; the member takes the card's instead.
	await odile.locator('label').filter({ hasText: '19 May 1985' }).click();
	await expect(
		odile
			.getByRole('radiogroup', { name: 'Birthday differs' })
			.getByRole('radio', { checked: true })
	).toHaveAccessibleName(/^On the card/);

	await page.getByRole('button', { name: 'Confirm the strong match' }).click();
	const fresh = page.getByTestId('new-contacts');
	await expect(fresh).toContainText('Beat Schläfli');
	await fresh.getByRole('button', { name: 'Skip it' }).click();
	await page.getByRole('button', { name: 'Import 2 answers' }).click();
	await expect(page.getByTestId('import-done')).toContainText('1 completed, 0 new, 1 skipped.');
	await page.getByRole('button', { name: 'Finish' }).click();

	// The match added to the person instead of making a second Odile.
	await expect(page.getByRole('link', { name: /Odile Margrit “Odi” Trachsel/ })).toHaveCount(1);
	await expect(page.getByRole('link', { name: /Beat Schläfli/ })).toHaveCount(0);
	await page
		.getByRole('link', { name: /Odile Margrit “Odi” Trachsel/ })
		.first()
		.click();
	await expect(page.getByText('19 May 1985')).toBeVisible();
	await expect(page.getByText(/222 77 88/)).toBeVisible();

	// A skip is for good, and *Skipped contacts* is its one way back.
	await page.goto('/settings/import');
	const askAgain = page.getByRole('button', { name: 'Ask again about Beat Schläfli' });
	await askAgain.click();
	await expect(askAgain).toHaveCount(0);

	// The next run asks about him again, and only him.
	await reviewVCard(page, MATCH);
	await expect(page.getByTestId('contact-review')).toContainText(
		'1 is linked to their person already and unchanged since, so it is not shown.'
	);
	await expect(page.getByTestId('new-contacts')).toContainText('Beat Schläfli');
	await expect(page.getByTestId('review-card')).toHaveCount(0);
});

test('says so when a card is opened and never closed, and writes nothing', async ({ page }) => {
	await uploadBroken(page, 'truncated.vcf', 'BEGIN:VCARD\r\nVERSION:4.0\r\nFN:Odile Trachsel\r\n');

	await expect(page.getByText(/never closed with END:VCARD/)).toBeVisible();
	// It failed before the preview, so nothing was planned, let alone written.
	await expect(page.getByTestId('import-preview')).toHaveCount(0);
});

test('refuses a card that names nobody rather than importing a nameless person', async ({
	page
}) => {
	await uploadBroken(
		page,
		'nameless.vcf',
		'BEGIN:VCARD\r\nVERSION:4.0\r\nUID:u9\r\nNOTE:no name here\r\nEND:VCARD\r\n'
	);

	await expect(page.getByText(/names nobody/)).toBeVisible();
	await expect(page.getByTestId('import-preview')).toHaveCount(0);
});
