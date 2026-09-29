import { expect, test, type Locator, type Page } from '@playwright/test';
import { addPerson, signIn } from './app';

/*
 * Choosing the square of a new profile photo (docs/02 §2.14). Written after the maintainer
 * verified the cropper in the app (docs/08 §8.4.1). Each case adds a person of its own, since
 * the suite shares one database.
 *
 * The picture is a test card drawn in the browser — red, green and blue thirds of a 1200×800
 * landscape — so which part was kept can be read back off the stored avatar by its colours.
 */

type Rgb = [number, number, number];
const RED: Rgb = [238, 0, 0];
const GREEN: Rgb = [0, 170, 0];

async function testCard(page: Page): Promise<Buffer> {
	const bytes = await page.evaluate(async () => {
		const canvas = document.createElement('canvas');
		canvas.width = 1200;
		canvas.height = 800;
		const ctx = canvas.getContext('2d')!;
		['#ee0000', '#00aa00', '#0000ee'].forEach((colour, third) => {
			ctx.fillStyle = colour;
			ctx.fillRect(third * 400, 0, 400, 800);
		});
		const blob = await new Promise<Blob>((resolve) => canvas.toBlob((b) => resolve(b!), 'image/png'));
		return Array.from(new Uint8Array(await blob.arrayBuffer()));
	});
	return Buffer.from(bytes);
}

/** The colour of the worn avatar at a point given as fractions of its width and height. */
async function colourAt(avatar: Locator, x: number, y: number): Promise<Rgb> {
	return avatar.evaluate(
		async (img: HTMLImageElement, at) => {
			await img.decode();
			const canvas = document.createElement('canvas');
			canvas.width = img.naturalWidth;
			canvas.height = img.naturalHeight;
			const ctx = canvas.getContext('2d')!;
			ctx.drawImage(img, 0, 0);
			const [r, g, b] = ctx.getImageData(
				Math.floor(at.x * img.naturalWidth),
				Math.floor(at.y * img.naturalHeight),
				1,
				1
			).data;
			return [r, g, b] as [number, number, number];
		},
		{ x, y }
	);
}

/** JPEG re-encoding shifts a colour a little; the thirds are far enough apart to tell. */
function expectNear(actual: Rgb, expected: Rgb): void {
	actual.forEach((channel, i) => expect(Math.abs(channel - expected[i])).toBeLessThan(40));
}

test.beforeEach(async ({ page }) => {
	await signIn(page);
});

test('keeps exactly the square chosen in the cropper', async ({ page }) => {
	await addPerson(page, 'Nina', 'Rahmen');
	const uploader = page.getByTestId('avatar-uploader');
	const cropper = page.getByTestId('photo-cropper');

	await uploader.locator('input[type=file]').setInputFiles({
		name: 'card.png',
		mimeType: 'image/png',
		buffer: await testCard(page)
	});
	const frame = cropper.getByRole('application', { name: 'Photo to frame' });
	await expect(cropper.getByRole('button', { name: 'Use photo' })).toBeEnabled();

	// Zoom to 1.5× (a 533px square), then drag the picture all the way right: the square stops
	// at the picture's left edge, holding 400px of red and 133px of green.
	await cropper.getByRole('slider', { name: 'Zoom' }).fill('1.5');
	// Hovering waits until the window itself takes the pointer — the cross-fade from the page
	// just added still covers the screen for a moment, and a raw mouse press would land on it.
	await frame.hover();
	const box = (await frame.boundingBox())!;
	await page.mouse.down();
	await page.mouse.move(box.x + box.width * 2, box.y + box.height / 2, { steps: 4 });
	await page.mouse.up();

	await cropper.getByRole('button', { name: 'Use photo' }).click();
	await expect(cropper).toBeHidden();

	const avatar = uploader.locator('img');
	await expect(avatar).toHaveAttribute('src', /\/media\//);
	expectNear(await colourAt(avatar, 0.05, 0.5), RED);
	expectNear(await colourAt(avatar, 0.7, 0.5), RED);
	expectNear(await colourAt(avatar, 0.8, 0.5), GREEN);
	expectNear(await colourAt(avatar, 0.95, 0.5), GREEN);
});

test('uploads nothing when the cropper is cancelled', async ({ page }) => {
	await addPerson(page, 'Nico', 'Rahmen');
	const uploader = page.getByTestId('avatar-uploader');
	const cropper = page.getByTestId('photo-cropper');
	const avatar = uploader.locator('img');
	const card = { name: 'card.png', mimeType: 'image/png', buffer: await testCard(page) };

	await uploader.locator('input[type=file]').setInputFiles(card);
	await expect(cropper.getByRole('button', { name: 'Use photo' })).toBeEnabled();
	await page.keyboard.press('Escape');
	await expect(cropper).toBeHidden();
	await expect(avatar).toHaveCount(0);

	// The same picture picked again reaches the upload, so the check above was not a locator
	// that could never find an avatar — and a cancelled pick does not block the next one.
	await uploader.locator('input[type=file]').setInputFiles(card);
	await cropper.getByRole('button', { name: 'Use photo' }).click();
	await expect(avatar).toHaveAttribute('src', /\/media\//);
});
