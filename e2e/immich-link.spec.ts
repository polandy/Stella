import { expect, test, type Browser, type Page } from '@playwright/test';
import { addPerson, appReady, openPerson, signIn } from './app';
import { DEMO_ADMIN_PASSWORD, DEMO_MEMBER_EMAIL } from '../src/lib/server/db/demo-seed';

/*
 * Connecting Stella to Immich and linking a person to their Immich face (docs/02 §2.24.1–
 * §2.24.3). Written after the owner tried slice 1 in the preview (docs/08 §8.4.1).
 *
 * The e2e server runs with `IMMICH_DEMO=true`, so Immich is the in-memory demo library
 * (`src/lib/server/immich/demo-library.ts`): its key belongs to the demo admin, who therefore
 * sees *Open in Immich*, and the second member does not.
 *
 * One Immich face links to one person only, and the faces are shared by the whole suite. So
 * every case links people it adds itself, under names no demo face carries, and searches the
 * picker for a face no other case links.
 */

/** A face of the demo library and the line its photo count makes on the person page. */
interface DemoFace {
	name: string;
	id: string;
	countLine: string;
}

const ELIAS: DemoFace = {
	name: 'Elias Brunner',
	id: 'd0000000-0000-4000-8000-000000000005',
	countLine: 'In Immich · 893 photos'
};
const HANS: DemoFace = {
	name: 'Hans Brunner',
	id: 'd0000000-0000-4000-8000-000000000006',
	countLine: 'In Immich · 312 photos'
};
const THOMAS = { name: 'Thomas Widmer', countLine: 'In Immich · 96 photos' };
const MIA = { name: 'Mia Widmer' };

test.beforeEach(async ({ page }) => {
	await signIn(page);
});

/** A second browser signed in as the household's other member, Nina. */
async function signInAsNina(browser: Browser): Promise<Page> {
	const context = await browser.newContext({ storageState: { cookies: [], origins: [] } });
	const page = await context.newPage();
	await page.goto('/login');
	await page.getByLabel('Email').fill(DEMO_MEMBER_EMAIL);
	await page.getByLabel('Password').fill(DEMO_ADMIN_PASSWORD);
	await page.getByRole('button', { name: 'Sign in', exact: true }).click();
	await expect(page.getByRole('heading', { name: 'What happened?' })).toBeVisible();
	await appReady(page);
	return page;
}

/** Opens the Photos card's Immich menu and picks one of its items. */
async function immichMenu(
	page: Page,
	item: 'Find in Immich' | 'Unlink from Immich'
): Promise<void> {
	await page.getByRole('button', { name: 'Photo library options' }).click();
	await page.getByRole('menuitem', { name: item }).click();
}

/**
 * Opens the face picker for the person on screen and searches it for `faceName`. The picker
 * first searches the person's own name, which no demo face carries; its "nobody" answer is
 * the settled state the second search starts from.
 */
async function searchFaces(page: Page, personName: string, faceName: string) {
	await immichMenu(page, 'Find in Immich');
	const picker = page.getByRole('dialog', { name: `Find ${personName} in Immich` });
	await expect(
		picker.getByText('No face in Immich has this name.', { exact: false })
	).toBeVisible();
	await picker.getByRole('searchbox', { name: 'Name in Immich' }).fill(faceName);
	await picker.getByRole('button', { name: 'Search' }).click();
	return picker;
}

/** Links the person on screen to the demo face of that name, through the picker. */
async function linkFace(page: Page, personName: string, faceName: string): Promise<void> {
	const picker = await searchFaces(page, personName, faceName);
	await picker.getByRole('button', { name: `Link ${faceName} to ${personName}` }).click();
	await expect(picker).toBeHidden();
	// The pick is a plain form post, so the page has reloaded and must mount again.
	await appReady(page);
}

test('Settings tells every member which Immich Stella is connected to', async ({ page }) => {
	await page.goto('/settings');
	await appReady(page);
	await expect(page.getByRole('heading', { name: 'Immich', exact: true })).toBeVisible();
	await expect(page.getByText('Connected to Demo’s Immich · 3.2.4')).toBeVisible();
});

test('links a person to their face from the picker, and the key owner can open them in Immich', async ({
	page
}) => {
	await addPerson(page, 'Ilvana', 'Morgenfeld');
	await linkFace(page, 'Ilvana Morgenfeld', ELIAS.name);

	await expect(page.getByText(ELIAS.countLine)).toBeVisible();
	const open = page.getByRole('link', { name: 'Open in Immich' });
	await expect(open).toBeVisible();
	await expect(open).toHaveAttribute('href', new RegExp(`/people/${ELIAS.id}$`));

	// Linked, the menu offers the way back out instead of another search.
	await page.getByRole('button', { name: 'Photo library options' }).click();
	await expect(page.getByRole('menuitem', { name: 'Unlink from Immich' })).toBeVisible();
	await expect(page.getByRole('menuitem', { name: 'Find in Immich' })).toHaveCount(0);
});

test('a face linked to one person is shown taken, and cannot be picked, for another', async ({
	page
}) => {
	await addPerson(page, 'Ottokar', 'Zwielicht');
	await linkFace(page, 'Ottokar Zwielicht', THOMAS.name);
	await expect(page.getByText(THOMAS.countLine)).toBeVisible();

	await addPerson(page, 'Philippa', 'Zwielicht');
	const picker = await searchFaces(page, 'Philippa Zwielicht', 'Widmer');

	// The free face of the same search is offered — the answer that makes the taken one's
	// missing button mean something.
	await expect(
		picker.getByRole('button', { name: `Link ${MIA.name} to Philippa Zwielicht` })
	).toBeVisible();
	const taken = picker.getByTestId('immich-face-taken');
	await expect(taken).toHaveCount(1);
	await expect(taken).toContainText(THOMAS.name);
	await expect(taken).toContainText('Linked to Ottokar Zwielicht');
	await expect(
		picker.getByRole('button', { name: `Link ${THOMAS.name} to Philippa Zwielicht` })
	).toHaveCount(0);
});

test('the other member sees the photo count and the way into Immich too, and can unlink', async ({
	page,
	browser
}) => {
	await addPerson(page, 'Severin', 'Halbmond');
	await linkFace(page, 'Severin Halbmond', HANS.name);
	await expect(page.getByRole('link', { name: 'Open in Immich' })).toBeVisible();

	const nina = await signInAsNina(browser);
	try {
		await openPerson(nina, /Severin Halbmond/);
		// She is not the key owner, and still gets the same link into Immich (docs/04 ADR-102).
		await expect(nina.getByText(HANS.countLine)).toBeVisible();
		await expect(nina.getByRole('link', { name: 'Open in Immich' })).toHaveAttribute(
			'href',
			new RegExp(`/people/${HANS.id}$`)
		);

		await immichMenu(nina, 'Unlink from Immich');
		// The unlink is a plain form post: the line going is the reloaded page, and its menu
		// offering the search again is the positive answer that the link is gone.
		await expect(nina.getByText(HANS.countLine)).toHaveCount(0);
		await appReady(nina);
		await nina.getByRole('button', { name: 'Photo library options' }).click();
		await expect(nina.getByRole('menuitem', { name: 'Find in Immich' })).toBeVisible();
	} finally {
		await nina.context().close();
	}

	// Her unlink is the household's: the admin's page has no link any more either.
	await page.reload();
	await appReady(page);
	await page.getByRole('button', { name: 'Photo library options' }).click();
	await expect(page.getByRole('menuitem', { name: 'Find in Immich' })).toBeVisible();
	await expect(page.getByText(HANS.countLine)).toHaveCount(0);
});
