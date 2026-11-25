import { expect, test, type Locator, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { appReady, signIn } from './app';
import { circleIdOf, personIdOf, seedHousehold } from './seed';

/*
 * A circle's members as they were then (docs/dev/02 §2.4.2, *Then · Now*): a past circle opens on
 * the faces from its time, captioned, today's picture ringed dashed where nothing closer exists;
 * *Now* shows today's pictures, and the choice is remembered. Each case seeds circles of its own.
 */

/** Square, captured 2019-05-03 by its EXIF — inside the school year below. */
const CAMERA = readFileSync('src/lib/media/fixtures/camera.jpg');
/** A PNG carries no capture date, so it counts from the day it is added: today. */
const PIXEL = readFileSync('e2e/fixtures/monica-photos/photos/ottilie-avatar.png');

test.beforeEach(async ({ page }) => {
	await signIn(page);
});

/** A school year that ended long ago with a class inside it; Lena was photographed back then. */
async function seedSchoolYear(page: Page, tag: string) {
	const lena = `Lena ${tag}`;
	const mia = `Mia ${tag}`;
	const keller = `Keller ${tag}`;
	const school = `${tag} School`;
	const year = `${tag} Year`;
	const period = { start: '2018-08-01', end: '2019-07-31' };
	await seedHousehold(page, [lena, mia, keller], [], {}, [
		{ name: school, ...period, members: [{ person: keller, role: 'Head' }] },
		{
			name: year,
			parent: school,
			...period,
			members: [
				{ person: lena, role: 'Pupil' },
				{ person: mia, role: 'Pupil' }
			]
		}
	]);
	await setAvatar(page, lena, { name: 'then.jpg', mimeType: 'image/jpeg', buffer: CAMERA });
	await setAvatar(page, lena, { name: 'now.png', mimeType: 'image/png', buffer: PIXEL });
	await setAvatar(page, mia, { name: 'now.png', mimeType: 'image/png', buffer: PIXEL });
	return { lena, mia, keller, school, year };
}

async function setAvatar(
	page: Page,
	person: string,
	picture: { name: string; mimeType: string; buffer: Buffer }
): Promise<void> {
	await page.goto(`/contacts/${personIdOf(person)}`);
	await appReady(page);
	const uploader = page.getByTestId('avatar-uploader');
	const img = uploader.locator('img');
	// No picture yet shows the initials, not an img.
	const before = (await img.count()) ? await img.getAttribute('src') : null;
	await uploader.locator('input[type=file]').setInputFiles(picture);
	const cropper = page.getByTestId('photo-cropper').filter({ visible: true });
	await cropper.getByRole('button', { name: 'Use photo' }).click();
	await expect(cropper).toBeHidden();
	await expect(uploader.locator('img')).toHaveAttribute('src', /\/media\//);
	if (before) await expect(uploader.locator('img')).not.toHaveAttribute('src', before);
}

async function openCircle(page: Page, name: string): Promise<void> {
	await page.goto(`/circles/${circleIdOf(name)}`);
	await appReady(page);
}

const memberCard = (page: Page, name: string): Locator =>
	page.getByTestId('member-grid').locator('li').filter({ hasText: name });
const toggle = (page: Page) => page.getByTestId('then-now');
const face = (scope: Locator) => scope.getByTestId('member-face');
const caption = (scope: Locator) => scope.getByTestId('member-face-caption');
const shownPhoto = (scope: Locator) => face(scope).locator('img').getAttribute('src');

test('a past circle opens on its members as they were then, captioned, and Now shows today’s', async ({
	page
}) => {
	const s = await seedSchoolYear(page, 'Heron');
	await openCircle(page, s.year);
	const lena = memberCard(page, s.lena);
	const mia = memberCard(page, s.mia);

	await expect(toggle(page).getByRole('button', { name: 'Then' })).toHaveAttribute(
		'aria-pressed',
		'true'
	);
	await expect(caption(lena)).toHaveText('May 2019');
	await expect(face(lena)).not.toHaveAttribute('data-approximate');
	await expect(caption(mia)).toHaveText('Today’s photo');
	await expect(face(mia)).toHaveAttribute('data-approximate', 'true');
	// The ring is drawn for real, not just flagged.
	await expect(face(mia)).toHaveCSS('outline-style', 'dashed');
	await expect(face(lena)).toHaveCSS('outline-style', 'none');
	const thenPhoto = await shownPhoto(lena);

	await toggle(page).getByRole('button', { name: 'Now' }).click();
	await expect(caption(lena)).toHaveCount(0);
	await expect(caption(mia)).toHaveCount(0);
	await expect(face(mia)).toHaveCSS('outline-style', 'none');
	expect(await shownPhoto(lena)).not.toBe(thenPhoto);

	// The choice is the reader's, kept across visits.
	await openCircle(page, s.year);
	await expect(toggle(page).getByRole('button', { name: 'Now' })).toHaveAttribute(
		'aria-pressed',
		'true'
	);
	await expect(caption(lena)).toHaveCount(0);
	await toggle(page).getByRole('button', { name: 'Then' }).click();
	await expect(caption(lena)).toHaveText('May 2019');
});

test('Arrange people shows the same faces from then', async ({ page }) => {
	const s = await seedSchoolYear(page, 'Plover');
	await page.goto(`/circles/${circleIdOf(s.school)}/arrange`);
	await appReady(page);
	const year = page.locator(`[data-testid="arrange-card"][data-circle-id="${circleIdOf(s.year)}"]`);
	const lena = year.getByTestId('arrange-person').filter({ hasText: s.lena });
	const keller = page.getByTestId('arrange-person').filter({ hasText: s.keller });

	await expect(caption(lena)).toHaveText('May 2019');
	await expect(caption(year.getByTestId('arrange-person').filter({ hasText: s.mia }))).toHaveText(
		'Today’s photo'
	);
	// No picture at all: the initials, and nothing to caption.
	await expect(caption(keller)).toHaveCount(0);

	await toggle(page).getByRole('button', { name: 'Now' }).click();
	await expect(caption(lena)).toHaveCount(0);
});

test('a circle without a period shows no toggle', async ({ page }) => {
	const lena = 'Lena Wren';
	await seedHousehold(page, [lena], [], {}, [
		{ name: 'Wren Club', members: [{ person: lena, role: 'Member' }] }
	]);
	await setAvatar(page, lena, { name: 'then.jpg', mimeType: 'image/jpeg', buffer: CAMERA });
	await setAvatar(page, lena, { name: 'now.png', mimeType: 'image/png', buffer: PIXEL });
	await openCircle(page, 'Wren Club');
	await expect(memberCard(page, lena)).toBeVisible();
	await expect(toggle(page)).toHaveCount(0);
	await expect(caption(memberCard(page, lena))).toHaveCount(0);
});
