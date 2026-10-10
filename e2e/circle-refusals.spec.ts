import { expect, test, type Page } from '@playwright/test';
import { appReady, signIn } from './app';
import { circleIdOf, personIdOf, seedHousehold } from './seed';

/*
 * What a circle's page and a person's circles card say to a form they would not expect
 * (docs/02 §2.4.2): one that names no member or no circle is asked to be checked, in a sentence,
 * and nothing is taken out. Written after the owner checked the circle editors in the running
 * app (docs/08 §8.4.1). Each case seeds a circle of its own through the archive restore.
 */

const CHECK = 'Please check the form and try again.';

test.beforeEach(async ({ page }) => {
	await signIn(page);
});

/**
 * Posts `form` straight at `action` of the page at `path`, asking for a page as a browser
 * without JavaScript does: anything else gets SvelteKit's 200 with the outcome in its JSON.
 */
async function postBare(page: Page, path: string, action: string, form: Record<string, string>) {
	const origin = new URL(page.url()).origin;
	return page.request.post(`${path}?/${action}`, {
		form,
		headers: { origin, accept: 'text/html' }
	});
}

test('a removal that names no member is asked to be checked, and the member stays', async ({
	page
}) => {
	const name = 'Seebach Bell Ringers';
	await seedHousehold(page, ['Ursina Tobler'], [], {}, [
		{ name, members: [{ person: 'Ursina Tobler', role: 'Treble' }] }
	]);
	const circle = `/circles/${circleIdOf(name)}`;
	await page.goto(circle);
	await appReady(page);

	// The page always names the member; this is the guard against a hand-made form.
	const response = await postBare(page, circle, 'removeMember', { other: 'x' });
	expect(response.status()).toBe(400);
	expect(await response.text()).toContain(CHECK);

	// The positive control: she is still a member.
	await page.reload();
	await appReady(page);
	await expect(
		page.getByTestId('member-grid').getByRole('link', { name: 'Ursina Tobler' })
	).toBeVisible();
});

test('leaving a circle that is not named is asked to be checked, and the membership stays', async ({
	page
}) => {
	const name = 'Seebach Quilting Bee';
	await seedHousehold(page, ['Beda Tobler'], [], {}, [
		{ name, members: [{ person: 'Beda Tobler', role: 'Quilter' }] }
	]);
	const person = `/contacts/${personIdOf('Beda Tobler')}`;
	await page.goto(person);
	await appReady(page);

	const response = await postBare(page, person, 'leaveCircle', { other: 'x' });
	expect(response.status()).toBe(400);
	expect(await response.text()).toContain(CHECK);

	// The positive control: he is still in the circle.
	await page.goto(`/circles/${circleIdOf(name)}`);
	await appReady(page);
	await expect(
		page.getByTestId('member-grid').getByRole('link', { name: 'Beda Tobler' })
	).toBeVisible();
});
