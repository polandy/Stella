import { expect, test, type Page } from '@playwright/test';
import { appReady, pickPerson, signIn } from './app';
import { DOCUMENT_ENTRY } from '../src/lib/server/domain/archive/archive';
import { tarEntry, tarTrailer } from '../src/lib/archive/tar';
import { ARCHIVE_FORMAT, ARCHIVE_VERSION } from '../src/lib/server/domain/archive/document';

/*
 * The relationships an archive brings, stored the way the app stores them (docs/02 §2.15,
 * docs/03 §relationship). Written after the owner restored such an archive in the running app
 * (docs/08 §8.4.1).
 *
 * The archive is an older or hand-edited one: a symmetric link the wrong way round, the same
 * friendship from both ends, a person linked to themselves. `seedHousehold` cannot write it — it
 * expects every link it is given to arrive — so the spec builds the file the same way and goes
 * through the restore screen, which also shows the report. The ids sort duri < flurina < seraina;
 * every name here is absent from the demo seed and from every other spec.
 */

const DURI = { id: 'e2e-restore-duri', name: 'Duri Caduff' };
const FLURINA = { id: 'e2e-restore-flurina', name: 'Flurina Caduff' };
const SERAINA = { id: 'e2e-restore-seraina', name: 'Seraina Caduff' };

function olderArchive(): Buffer {
	const document = {
		format: ARCHIVE_FORMAT,
		version: ARCHIVE_VERSION,
		household: 'an older Stella',
		people: [DURI, FLURINA, SERAINA].map(({ id, name }) => {
			const [first, last] = name.split(' ');
			return { id, display_name: name, first_name: first, last_name: last };
		}),
		relationships: [
			// The wrong way round: stored as given, adding it from Duri's end would not be refused.
			{ id: 'e2e-restore-r-sibling', from: FLURINA.id, to: DURI.id, type: 'sibling' },
			// One friendship from both ends.
			{ id: 'e2e-restore-r-copy', from: SERAINA.id, to: DURI.id, type: 'friend' },
			{ id: 'e2e-restore-r-twin', from: DURI.id, to: SERAINA.id, type: 'friend' },
			{ id: 'e2e-restore-r-self', from: FLURINA.id, to: FLURINA.id, type: 'friend' }
		]
	};
	const text = new TextEncoder().encode(JSON.stringify(document));
	return Buffer.concat([tarEntry(DOCUMENT_ENTRY, text, 0), tarTrailer()]);
}

async function openPerson(page: Page, { id, name }: { id: string; name: string }): Promise<void> {
	await page.goto(`/contacts/${id}`);
	await expect(page.getByRole('heading', { name })).toBeVisible();
	await appReady(page);
}

const storedRow = (page: Page, name: string) =>
	page.getByTestId('relationship-list').locator('li').filter({ hasText: name });

async function addLink(page: Page, label: string, person: string): Promise<void> {
	await page.getByRole('button', { name: 'Add relationship' }).click();
	const form = page.locator('form[action="?/addRelationship"]');
	await form.locator('select[name=typeChoice]').selectOption({ label });
	await pickPerson(form.getByLabel('Person'), person);
	await form.getByRole('button', { name: 'Add', exact: true }).click();
}

test.beforeEach(async ({ page }) => {
	await signIn(page);
});

test('restores each link once, sorted, so adding it again from the other end is refused', async ({
	page
}) => {
	await page.goto('/settings/import/archive');
	await page.locator('input[name=archive]').setInputFiles({
		name: 'older.tar',
		mimeType: 'application/x-tar',
		buffer: olderArchive()
	});
	await page.getByRole('button', { name: 'Restore' }).click();

	const report = page.getByTestId('restore-report');
	await expect(report.locator('[data-kind="relationship"]')).toContainText('2 added');
	await expect(report).toContainText(
		'The archive held the same relationship from both ends; it was restored once.'
	);
	await expect(report).toContainText('A relationship joining a person to themselves was left out.');

	await openPerson(page, DURI);
	await expect(storedRow(page, SERAINA.name)).toHaveCount(1);
	// Positive control: the sibling link is there too, so a missing row cannot pass as one.
	await expect(storedRow(page, FLURINA.name)).toHaveCount(1);

	await addLink(page, 'Sibling of', FLURINA.name);
	await expect(page.locator('#section-relationships')).toContainText(
		'That relationship already exists.'
	);
	await openPerson(page, DURI);
	await expect(storedRow(page, FLURINA.name)).toHaveCount(1);

	await openPerson(page, FLURINA);
	await expect(storedRow(page, FLURINA.name)).toHaveCount(0);
	await expect(storedRow(page, DURI.name)).toHaveCount(1);
});
