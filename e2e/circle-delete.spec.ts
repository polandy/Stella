import { expect, test, type Browser, type Page } from '@playwright/test';
import { appReady, signIn } from './app';
import { DEMO_ADMIN_PASSWORD, DEMO_MEMBER_EMAIL } from '../src/lib/server/db/demo-seed';

/*
 * Deleting a circle (docs/02 §2.4.2): its creator always, an admin when it is shared. The confirm
 * step says what goes and what stays and starts on *Keep it*; afterwards the reader is on the
 * Circles page with a toast, a profile picture cut from the circle's photo is its wearer's own,
 * a nested circle stays without a parent, and Home tells the household. Written after the owner
 * tried it in the running app (docs/08 §8.4.1).
 *
 * The suite shares one database and runs serially, so the case brings in a circle of its own,
 * with a child, out of people it invents. Nesting has no form (it is import-only), so they come
 * through the import API with a token of the demo account, which makes it the circles' creator.
 */

const PARENT = 'Larch Hill School';
const CHILD = 'Larch Hill School Choir';
const AURELIA = 'Aurelia Tschopp';

test.beforeEach(async ({ page }) => {
	await signIn(page);
});

/** Imports the two people and the circle with its child; answers the parent circle's address. */
async function importNestedCircles(page: Page): Promise<string> {
	await page.goto('/settings');
	await page.getByRole('link', { name: /API tokens/ }).click();
	await page.getByLabel('What is it for?').fill('Circle deletion check');
	await page.getByRole('button', { name: 'Create token' }).click();
	const token = (await page.getByTestId('new-token').locator('code').first().textContent()) ?? '';
	expect(token).toMatch(/^stella_[0-9a-f]{48}$/);

	const imported = await page.request.post('/api/v1/import', {
		headers: { Authorization: `Bearer ${token}` },
		data: {
			source: 'e2e-circle-delete',
			people: [
				{ ref: 'aurelia', firstName: 'Aurelia', lastName: 'Tschopp' },
				{ ref: 'benno', firstName: 'Benno', lastName: 'Tschopp' }
			],
			circles: [
				{
					ref: 'school',
					name: PARENT,
					kind: 'school',
					members: [
						{ person: 'aurelia', role: 'pupil' },
						{ person: 'benno', role: 'pupil' }
					]
				},
				{
					ref: 'choir',
					name: CHILD,
					kind: 'club',
					parent: 'school',
					members: [{ person: 'aurelia', role: 'alto' }]
				}
			]
		}
	});
	const answer = await imported.json();
	expect(answer).toMatchObject({ added: { people: 2, circles: 2, memberships: 3 } });
	const school = answer.circles.find((c: { ref: string }) => c.ref === 'school');
	return `/circles/${school.id}`;
}

/** A 1200×800 group photo drawn in the browser, large enough for the cropper. */
async function groupPicture(
	page: Page
): Promise<{ name: string; mimeType: string; buffer: Buffer }> {
	const bytes = await page.evaluate(async () => {
		const canvas = document.createElement('canvas');
		canvas.width = 1200;
		canvas.height = 800;
		const ctx = canvas.getContext('2d')!;
		['#ee0000', '#00aa00', '#0000ee'].forEach((colour, third) => {
			ctx.fillStyle = colour;
			ctx.fillRect(third * 400, 0, 400, 800);
		});
		const blob = await new Promise<Blob>((resolve) =>
			canvas.toBlob((b) => resolve(b!), 'image/png')
		);
		return Array.from(new Uint8Array(await blob.arrayBuffer()));
	});
	return { name: 'school.png', mimeType: 'image/png', buffer: Buffer.from(bytes) };
}

const tiles = (page: Page) => page.getByTestId('circle-photo-grid').locator('[data-photo-tile]');
const cutDialog = (page: Page) => page.getByTestId('cut-dialog');

/** Uploads one group photo and cuts `name`'s profile picture out of it through the lightbox. */
async function photoWornBy(page: Page, name: string): Promise<void> {
	await page.getByRole('button', { name: 'Add photos' }).click();
	const form = page.locator('#photos form');
	await form.locator('input[name=files]').setInputFiles([await groupPicture(page)]);
	await form.getByRole('button', { name: 'Add 1 photo' }).click();
	await expect(tiles(page)).toHaveCount(1);

	await tiles(page).first().click();
	await page.getByTestId('circle-photo-lightbox').getByTestId('cut-open').click();
	await cutDialog(page).getByTestId('cut-candidate').filter({ hasText: name }).click();
	const cropper = page.getByTestId('photo-cropper');
	await expect(cropper.getByRole('button', { name: 'Use photo' })).toBeEnabled();
	// Stella's answer to the post is the signal the cut is done, not a guess at time.
	const stored = page.waitForResponse(
		(response) =>
			response.url().includes('?/cutProfilePicture') && response.request().method() === 'POST'
	);
	await cropper.getByRole('button', { name: 'Use photo' }).click();
	expect((await stored).ok()).toBe(true);
	await expect(cutDialog(page).getByTestId('cut-done')).toHaveText(`${name} now wears this photo.`);
	await cutDialog(page).getByRole('button', { name: 'Done' }).click();
	await expect(cutDialog(page)).toBeHidden();
	await page.keyboard.press('Escape');
	await expect(page.getByTestId('circle-photo-lightbox')).toBeHidden();
}

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

/** The circle page's ⋯ menu, opened. */
async function openMenu(page: Page): Promise<void> {
	await page.getByTestId('circle-header').getByRole('button', { name: 'More actions' }).click();
	await expect(page.getByRole('menuitem', { name: 'Edit circle' })).toBeVisible();
}

/** The person page's header picture: the photo id it shows, once the image has loaded. */
async function wornPictureId(page: Page): Promise<string> {
	const img = page
		.getByTestId('avatar-uploader')
		.getByRole('button', { name: 'Change photo' })
		.locator('img');
	await expect(img).toHaveAttribute('src', /^\/media\/[^?]+\?thumb$/);
	expect(
		await img.evaluate(async (el: HTMLImageElement) => (await el.decode(), el.naturalWidth))
	).toBeGreaterThan(0);
	return (await img.getAttribute('src'))!.match(/^\/media\/([^?]+)\?thumb$/)![1];
}

const galleryIds = (page: Page) => () =>
	page
		.getByTestId('photo-grid')
		.locator('img')
		.evaluateAll((imgs) =>
			imgs.map((img) => img.getAttribute('src')?.match(/^\/media\/([^?]+)\?thumb$/)?.[1])
		);

test('the creator deletes a circle: the wearer keeps the picture, the nested circle stays, Home says so; another member is not offered it', async ({
	page,
	browser
}) => {
	const circlePage = await importNestedCircles(page);
	await page.goto(circlePage);
	await appReady(page);
	await expect(page.getByRole('heading', { name: PARENT, level: 1 })).toBeVisible();
	const aureliaPage = await page
		.getByTestId('member-grid')
		.getByRole('link', { name: AURELIA })
		.getAttribute('href');
	expect(aureliaPage).toMatch(/^\/contacts\//);
	await photoWornBy(page, AURELIA);

	// A member who neither created the circle nor is an admin may edit it, never delete it.
	const nina = await signInAsNina(browser);
	try {
		await nina.goto(circlePage);
		await appReady(nina);
		await openMenu(nina);
		await expect(nina.getByRole('menuitem', { name: 'Delete circle…' })).toHaveCount(0);
	} finally {
		await nina.context().close();
	}

	// The confirm step says what goes and what stays, with the cursor on *Keep it*.
	await openMenu(page);
	await page.getByRole('menuitem', { name: 'Delete circle…' }).click();
	const step = page.getByTestId('circle-delete');
	await expect(step.getByRole('button', { name: 'Keep it' })).toBeFocused();
	await expect(step).toContainText(
		`This deletes ${PARENT}: 2 members leave it and its photo is deleted. It cannot be undone.`
	);
	await expect(step).toContainText(
		'1 of its photos is the profile picture of 1 person. They keep it as a photo of their own.'
	);
	await expect(step).toContainText(`${CHILD} stays, without a parent circle.`);

	await step.getByRole('button', { name: `Delete ${PARENT}` }).click();
	await expect(page).toHaveURL(/\/circles$/);
	await expect(page.getByRole('heading', { name: 'Circles', level: 1 })).toBeVisible();
	await expect(page.getByTestId('toasts')).toContainText(`${PARENT} deleted`);
	// The nested circle is still listed — and, beside it, the deleted one is not.
	await expect(page.getByRole('link', { name: new RegExp(CHILD) })).toBeVisible();
	await expect(page.getByRole('link', { name: new RegExp(`${PARENT}(?! Choir)`) })).toHaveCount(0);

	// The picture she wore is a photo of her own now: still worn, and in her gallery.
	await page.goto(aureliaPage!);
	await appReady(page);
	const worn = await wornPictureId(page);
	await expect.poll(galleryIds(page)).toEqual([worn]);

	// Home tells the household, and links nowhere.
	await page.getByRole('link', { name: 'Home', exact: true }).first().click();
	await expect(page.getByRole('heading', { name: 'What happened?' })).toBeVisible();
	const notice = page
		.getByTestId('stream-notice')
		.filter({ hasText: `removed the circle ${PARENT}` });
	await expect(notice).toHaveText(new RegExp(`You\\s*removed the circle ${PARENT}`));
	await expect(notice.getByRole('link', { name: PARENT })).toHaveCount(0);
});
