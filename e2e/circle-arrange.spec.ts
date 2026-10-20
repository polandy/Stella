import { expect, test, type Locator, type Page } from '@playwright/test';
import { appReady, signIn } from './app';
import { circleIdOf, seedHousehold } from './seed';

/*
 * Arranging people between a circle and its sub-circles (docs/02 §2.4.2, ADR-127): tapping and
 * the keyboard, dragging, and the reasons a card gives for refusing. Written at the owner's
 * request (docs/08 §8.4.1). Each case seeds a school of its own name — a school with one class
 * — so no two cases share a circle, and the restore is add-only by id.
 */

test.beforeEach(async ({ page }) => {
	await signIn(page);
});

/** A school with a class inside it: Lena Pupil is in both, Mia Pupil only in the class. */
async function seedSchool(page: Page, school: string) {
	const lena = `Lena ${school}`;
	const mia = `Mia ${school}`;
	const keller = `Keller ${school}`;
	const parent = `${school} School`;
	const child = `${school} Class`;
	await seedHousehold(page, [lena, mia, keller], [], {}, [
		{ name: parent, members: [{ person: keller, role: 'Head' }] },
		{
			name: child,
			parent,
			members: [
				{ person: lena, role: 'Pupil' },
				{ person: mia, role: 'Pupil' }
			]
		}
	]);
	return { lena, mia, keller, parent, child };
}

async function openArrange(page: Page, circleName: string): Promise<void> {
	await page.goto(`/circles/${circleIdOf(circleName)}/arrange`);
	await appReady(page);
}

const cardOf = (page: Page, circleName: string): Locator =>
	page.locator(`[data-testid="arrange-card"][data-circle-id="${circleIdOf(circleName)}"]`);

const personIn = (card: Locator, name: string): Locator =>
	card.getByTestId('arrange-person').filter({ hasText: name });

test('the circle page offers Arrange people only when it has sub-circles', async ({ page }) => {
	const s = await seedSchool(page, 'Entry');
	await page.goto(`/circles/${circleIdOf(s.parent)}`);
	await appReady(page);
	await page.getByRole('link', { name: 'Arrange people' }).click();
	await expect(page.getByRole('heading', { name: 'Arrange people' })).toBeVisible();
	await expect(page.getByTestId('arrange-card')).toHaveCount(2);

	await page.goto(`/circles/${circleIdOf(s.child)}`);
	await appReady(page);
	await expect(page.getByRole('link', { name: 'Arrange people' })).toHaveCount(0);
});

test('shows a card for the circle itself and one for the sub-circle, with who is in each', async ({
	page
}) => {
	const s = await seedSchool(page, 'Cards');
	await openArrange(page, s.parent);

	const own = cardOf(page, s.parent);
	await expect(own).toContainText(`Directly in ${s.parent}`);
	await expect(own).toContainText('The circle itself');
	await expect(own.getByTestId('arrange-count')).toHaveText('1 person');
	await expect(personIn(own, s.keller)).toBeVisible();

	const sub = cardOf(page, s.child);
	await expect(sub.getByTestId('arrange-count')).toHaveText('2 people');
	await expect(sub).toContainText(s.child);
});

test('moves a person by tapping: select, Move to, tap the target — and Undo puts them back', async ({
	page
}) => {
	const s = await seedSchool(page, 'Tap');
	await openArrange(page, s.parent);
	const own = cardOf(page, s.parent);
	const sub = cardOf(page, s.child);

	await personIn(sub, s.mia).getByRole('button').click();
	await expect(page.getByTestId('arrange-bar')).toContainText('1 selected');
	await page.getByTestId('arrange-move-to').click();
	await expect(page.getByTestId('arrange-pick-prompt')).toBeVisible();
	// The class itself is no target for its own person.
	await expect(sub.getByTestId('arrange-reason')).toHaveText('Already here');
	await own.getByTestId('arrange-here').click();

	await expect(personIn(own, s.mia)).toBeVisible();
	await expect(personIn(sub, s.mia)).toHaveCount(0);
	await expect(page.getByTestId('arrange-bar')).toHaveCount(0);
	await expect(page.getByText(`1 person moved to ${s.parent}`)).toBeVisible();

	await page.getByRole('button', { name: 'Undo' }).click();
	await expect(personIn(sub, s.mia)).toBeVisible();
	await expect(personIn(own, s.mia)).toHaveCount(0);
});

test('copies with the keyboard alone and keeps the person where they were', async ({ page }) => {
	const s = await seedSchool(page, 'Keys');
	await openArrange(page, s.parent);
	const own = cardOf(page, s.parent);
	const sub = cardOf(page, s.child);

	await personIn(sub, s.mia).getByRole('button').focus();
	await page.keyboard.press('Space');
	await expect(personIn(sub, s.mia).getByRole('button')).toHaveAttribute('aria-pressed', 'true');
	await page.getByTestId('arrange-copy-to').focus();
	await page.keyboard.press('Enter');
	// Focus lands on the first card that can take the person, so Enter alone completes the pick.
	await expect(own.getByTestId('arrange-here')).toBeFocused();
	await page.keyboard.press('Enter');

	await expect(personIn(own, s.mia)).toBeVisible();
	await expect(personIn(sub, s.mia)).toBeVisible();
	await expect(personIn(own, s.mia)).toContainText(`also in ${s.child}`);
	await expect(page.getByText(`1 person copied to ${s.parent}`)).toBeVisible();
	// After a pick focus goes to the toast's Undo, so the keyboard can take it back at once.
	await expect(page.getByTestId('toast-undo').getByRole('button', { name: 'Undo' })).toBeFocused();
});

test('Escape leaves the target step without changing anything', async ({ page }) => {
	const s = await seedSchool(page, 'Esc');
	await openArrange(page, s.parent);
	await personIn(cardOf(page, s.child), s.mia).getByRole('button').click();
	await page.getByTestId('arrange-move-to').click();
	await expect(page.getByTestId('arrange-pick-prompt')).toBeVisible();
	await page.keyboard.press('Escape');
	await expect(page.getByTestId('arrange-pick-prompt')).toHaveCount(0);
	await expect(page.getByTestId('arrange-move-to')).toBeFocused();
});

test('Cancel hands focus back to the button that began the step', async ({ page }) => {
	const s = await seedSchool(page, 'Back');
	await openArrange(page, s.parent);
	await personIn(cardOf(page, s.child), s.mia).getByRole('button').click();
	await page.getByTestId('arrange-copy-to').click();
	await expect(page.getByTestId('arrange-here').first()).toBeFocused();
	await page.getByTestId('arrange-cancel').click();
	await expect(page.getByTestId('arrange-copy-to')).toBeFocused();
});

test('focus goes to Cancel when no card can take the people', async ({ page }) => {
	const school = 'Stuck';
	const lena = `Lena ${school}`;
	const parent = `${school} School`;
	const child = `${school} Class`;
	await seedHousehold(page, [lena], [], {}, [
		{ name: parent, members: [{ person: lena }] },
		{ name: child, parent, members: [{ person: lena }] }
	]);
	await openArrange(page, parent);
	await personIn(cardOf(page, child), lena).getByRole('button').click();
	await page.getByTestId('arrange-copy-to').click();
	await expect(page.getByTestId('arrange-here')).toHaveCount(0);
	await expect(page.getByTestId('arrange-cancel')).toBeFocused();
});

test('says everyone is already there when all picked are in the target', async ({ page }) => {
	const s = await seedSchool(page, 'Same');
	await openArrange(page, s.parent);
	const sub = cardOf(page, s.child);
	await personIn(sub, s.mia).getByRole('button').click();
	await personIn(sub, s.lena).getByRole('button').click();
	await page.getByTestId('arrange-copy-to').click();
	await expect(sub.getByTestId('arrange-reason')).toHaveText('Everyone is already here');
});

test('drags a person onto another card to move them', async ({ page }) => {
	const s = await seedSchool(page, 'Drag');
	await openArrange(page, s.parent);
	const own = cardOf(page, s.parent);
	const sub = cardOf(page, s.child);

	await personIn(sub, s.mia).dragTo(own);

	await expect(personIn(own, s.mia)).toBeVisible();
	await expect(personIn(sub, s.mia)).toHaveCount(0);
	await expect(page.getByText(`1 person moved to ${s.parent}`)).toBeVisible();
});

test('drags in Copy mode and leaves the person in the old card', async ({ page }) => {
	const s = await seedSchool(page, 'DragCopy');
	await openArrange(page, s.parent);
	const own = cardOf(page, s.parent);
	const sub = cardOf(page, s.child);

	await page.getByTestId('arrange-mode-copy').click();
	await expect(page.getByTestId('arrange-mode-copy')).toHaveAttribute('aria-pressed', 'true');
	await personIn(sub, s.mia).dragTo(own);

	await expect(personIn(own, s.mia)).toBeVisible();
	await expect(personIn(sub, s.mia)).toBeVisible();
});

test('a drag carries the whole selection when the dragged person is part of it', async ({
	page
}) => {
	const s = await seedSchool(page, 'Group');
	await openArrange(page, s.parent);
	const own = cardOf(page, s.parent);
	const sub = cardOf(page, s.child);

	await personIn(sub, s.mia).getByRole('button').click();
	await personIn(sub, s.lena).getByRole('button').click();
	await personIn(sub, s.mia).dragTo(own);

	await expect(personIn(own, s.mia)).toBeVisible();
	await expect(personIn(own, s.lena)).toBeVisible();
	await expect(sub.getByTestId('arrange-count')).toHaveText('0 people');
	await expect(page.getByText(`2 people moved to ${s.parent}`)).toBeVisible();
});
