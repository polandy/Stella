import { expect, test, type Locator, type Page } from '@playwright/test';
import { appReady, signIn } from './app';
import { circleIdOf, seedHousehold, type SeedCircle } from './seed';

/*
 * Renaming a circle's role from its heading (docs/02 §2.4.2). Written after the owner tried it
 * in the running app (docs/08 §8.4.1). Each case seeds its own circle and people through the
 * archive restore — the setting — and drives the rename itself through the heading.
 */

test.beforeEach(async ({ page }) => {
	await signIn(page);
});

/** Seeds one circle and opens its page, ready for the JavaScript-only heading editor. */
async function openSeededCircle(page: Page, circle: SeedCircle): Promise<void> {
	await seedHousehold(page, [...new Set(circle.members.map((m) => m.person))], [], {}, [circle]);
	await page.goto(`/circles/${circleIdOf(circle.name)}`);
	await expect(page.getByRole('heading', { name: circle.name, level: 1 })).toBeVisible();
	await appReady(page);
}

/** The role group headed `heading` exactly, e.g. `Teacher · 2`. */
function roleGroup(page: Page, heading: string): Locator {
	return page
		.getByTestId('role-group')
		.filter({ has: page.getByRole('heading', { name: heading, exact: true }) });
}

/** Opens a role's heading as a field, types `to` and saves. */
async function rename(page: Page, from: string, to: string): Promise<void> {
	await page.getByTestId('member-grid').getByRole('button', { name: from, exact: true }).click();
	const field = page.getByRole('textbox', { name: `Rename the role ${from}` });
	await expect(field).toHaveValue(from);
	await field.fill(to);
	await page.getByTestId('member-grid').getByRole('button', { name: 'Save', exact: true }).click();
}

test('a role renamed from its heading regroups its people under the new name', async ({ page }) => {
	await openSeededCircle(page, {
		name: 'Linden Primary 2b',
		members: [
			{ person: 'Odile Brandstetter', role: 'Teacher' },
			{ person: 'Fynn Brandstetter', role: 'Teacher' },
			// Another spelling of the same role: it is renamed along with the rest.
			{ person: 'Mattis Brandstetter', role: 'teacher' },
			{ person: 'Lio Kesselring', role: 'Pupil' }
		]
	});
	await expect(roleGroup(page, 'Teacher · 3')).toBeVisible();

	await rename(page, 'Teacher', 'Class teacher');

	const renamed = roleGroup(page, 'Class teacher · 3');
	for (const person of ['Odile Brandstetter', 'Fynn Brandstetter', 'Mattis Brandstetter']) {
		await expect(renamed.getByRole('link', { name: person })).toBeVisible();
	}
	// The renamed group is up, so the screen is the saved one: the old name is gone, the other role stays.
	await expect(roleGroup(page, 'Pupil · 1')).toBeVisible();
	await expect(page.getByRole('heading', { name: /^Teacher ·/ })).toHaveCount(0);
});

test('renaming a role onto one the circle already has merges the two groups', async ({ page }) => {
	await openSeededCircle(page, {
		name: 'Harbour Sculling Club',
		members: [
			{ person: 'Ansgar Wyss', role: 'Trainer' },
			{ person: 'Wanda Wyss', role: 'Coach' },
			{ person: 'Corin Rüegg', role: 'Coach' },
			{ person: 'Dana Rüegg', role: 'Rower' }
		]
	});
	await expect(roleGroup(page, 'Trainer · 1')).toBeVisible();

	await rename(page, 'Trainer', 'coach');

	// One group, under the name exactly as typed.
	const merged = roleGroup(page, 'coach · 3');
	for (const person of ['Ansgar Wyss', 'Wanda Wyss', 'Corin Rüegg']) {
		await expect(merged.getByRole('link', { name: person })).toBeVisible();
	}
	await expect(roleGroup(page, 'Rower · 1')).toBeVisible();
	await expect(page.getByTestId('role-group')).toHaveCount(2);
});

test('a blank role name is refused and changes nothing', async ({ page }) => {
	await openSeededCircle(page, {
		name: 'Sunday Choir Altstetten',
		members: [
			{ person: 'Gisela Hürlimann', role: 'Alto' },
			{ person: 'Hannes Hürlimann', role: 'Bass' }
		]
	});
	await expect(roleGroup(page, 'Alto · 1')).toBeVisible();

	await rename(page, 'Alto', '   ');

	await expect(
		page.getByText('Give the role a name — to take roles away, use Select.')
	).toBeVisible();
	// Read back what the server kept, not what the open field shows.
	await page.reload();
	const alto = roleGroup(page, 'Alto · 1');
	await expect(alto.getByRole('link', { name: 'Gisela Hürlimann' })).toBeVisible();
	await expect(roleGroup(page, 'Bass · 1')).toBeVisible();
});
