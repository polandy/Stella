import { expect, test, type Locator, type Page } from '@playwright/test';
import { appReady, mention, pickPerson, signIn } from './app';

/*
 * The UX polish of #290 (docs/05 §5.4, §5.5, §5.7; docs/02 §2.22.2): the person page's jump bar
 * shows only once it sticks, an in-place value carries a pencil, a phone wraps a long
 * description and shows only the way back in its top bar, the stream says the time of day
 * where its day heading does not, and the composer's controls are a switch, a photo button and
 * the day pill. Written after the owner tried it in the app (docs/08 §8.4.1).
 *
 * Only what the cases write themselves is changed: a description on Heidi Lehmann, a moment on
 * Bettina Roth mentioning Jan Steiner and a touchpoint on Reto Hofer with Kurt Lehmann — people
 * no other spec counts — each carrying a run's own letters, so a repeat finds its own item.
 * Everything else is read. *Yesterday*'s time of day is left to `days.test.ts`: the seed's item
 * from a day back is dated from the server's start, which a run past midnight would move a day
 * further.
 */

const PIXEL_9_PRO = { width: 412, height: 915 };
/** A phone as the browser reports one: touch, and a coarse pointer for `pointer-coarse:`. */
const PHONE = { viewport: PIXEL_9_PRO, hasTouch: true, isMobile: true };

const MARKUS = 'demo-c-markus';
const HEIDI = 'demo-c-heidi';
const RETO = 'demo-c-reto';

/** Six letters no other attempt shares. */
function runLetters(): string {
	return Array.from(crypto.getRandomValues(new Uint8Array(6)), (byte) =>
		String.fromCharCode(97 + (byte % 26))
	).join('');
}

async function openDemoPerson(page: Page, id: string, name: string): Promise<void> {
	await page.goto(`/contacts/${id}`);
	await expect(page.getByRole('heading', { name, exact: true })).toBeVisible();
	await expect(page.locator('#section-relationships')).toBeVisible();
	await appReady(page);
}

const jumpBar = (page: Page) => page.getByTestId('jump-bar');
const scrollTo = (page: Page, top: number) =>
	page.locator('#content').evaluate((el, y) => el.scrollTo({ top: y }), top);

/** The pencils of the values the identity card edits in place. */
function pencils(page: Page): Record<string, Locator> {
	const card = page.getByTestId('identity-card');
	return {
		description: card.locator('button[title="Edit description"] .edit-pencil'),
		job: card.locator('[data-fact="job"] .edit-pencil'),
		dates: card.locator('[data-fact="birthday"] .edit-pencil'),
		address: card.locator('[data-fact="address"] .edit-pencil')
	};
}

test.describe('the jump bar on a phone', () => {
	test.use(PHONE);

	test('waits out of sight and reach until the identity card has gone by', async ({ page }) => {
		await signIn(page);
		await openDemoPerson(page, MARKUS, 'Markus Brunner');
		const bar = jumpBar(page);
		const notes = bar.locator('a', { hasText: /^Notes/ });

		// At rest nothing stands between the identity card and the People card, and the hidden
		// bar takes no focus.
		await expect(bar).toHaveAttribute('data-visible', 'false');
		await expect(bar).toHaveAttribute('inert', '');
		await expect(bar).toHaveCSS('opacity', '0');
		await notes.evaluate((el) => (el as HTMLElement).focus());
		await expect(notes).not.toBeFocused();

		await page
			.locator('#section-relationships')
			.evaluate((el) => el.scrollIntoView({ block: 'start' }));
		await expect(bar).toHaveAttribute('data-visible', 'true');
		await expect(bar).not.toHaveAttribute('inert');
		await expect(bar).toHaveCSS('opacity', '1');

		// A tapped link glides to its card, and the bar stays under the finger that used it.
		await notes.click();
		await expect(page).toHaveURL(/#section-notes$/);
		await expect(page.locator('#section-notes')).toBeFocused();
		await expect(notes).toHaveAttribute('aria-current', 'location');
		await expect(bar).toHaveAttribute('data-visible', 'true');

		// Back at the top it gets out of the way again.
		await scrollTo(page, 0);
		await expect(bar).toHaveAttribute('data-visible', 'false');
		await expect(bar).toHaveAttribute('inert', '');
	});
});

test.describe('on a phone', () => {
	test.use(PHONE);

	test('shows the edit pencils at rest, as no hover ever does', async ({ page }) => {
		await signIn(page);
		expect(await page.evaluate(() => matchMedia('(pointer: coarse)').matches)).toBe(true);
		await openDemoPerson(page, MARKUS, 'Markus Brunner');

		for (const pencil of Object.values(pencils(page))) {
			await expect(pencil).toBeVisible();
			await expect(pencil).toHaveCSS('opacity', '0.55');
		}
	});

	test('shows only the way back to People in the top bar', async ({ page }) => {
		await signIn(page);
		await openDemoPerson(page, MARKUS, 'Markus Brunner');

		const trail = page.getByTestId('top-bar').getByRole('navigation', { name: 'Breadcrumb' });
		await expect(trail).toHaveCount(1);
		const back = trail.getByTestId('back-crumb');
		await expect(back).toHaveText('People');
		await expect(back).toHaveAttribute('href', '/contacts');
		await expect(trail).not.toContainText('Markus Brunner');
	});

	test('hides the ⌘⏎ hint, a touch screen having no keys to press', async ({ page }) => {
		await signIn(page);
		// The phone's composer is a sheet behind the tab bar's pencil.
		await page.locator('nav').getByRole('link', { name: 'Write a moment' }).click();
		const sheet = page.getByTestId('compose-sheet');
		await expect(sheet.getByRole('button', { name: /^Save/ })).toBeVisible();
		await expect(sheet.locator('kbd', { hasText: '⌘⏎' })).toBeHidden();
	});
});

test.describe('on the desktop', () => {
	test('hides the edit pencils until hovered or reached by keyboard', async ({ page }) => {
		await signIn(page);
		expect(await page.evaluate(() => matchMedia('(pointer: fine)').matches)).toBe(true);
		await openDemoPerson(page, MARKUS, 'Markus Brunner');

		for (const pencil of Object.values(pencils(page))) {
			await expect(pencil).toHaveCSS('opacity', '0');
		}
		const { description, dates } = pencils(page);
		await page.getByTestId('identity-card').locator('button[title="Edit description"]').hover();
		await expect(description).toHaveCSS('opacity', '0.9');

		// Moved away, then reached from the keyboard instead.
		await page.mouse.move(0, 0);
		await expect(description).toHaveCSS('opacity', '0');
		const datesButton = page.locator('[data-fact="birthday"] button');
		await page.keyboard.press('Shift');
		await datesButton.focus();
		expect(await datesButton.evaluate((el) => el.matches(':focus-visible'))).toBe(true);
		await expect(dates).toHaveCSS('opacity', '0.9');
	});

	test('shows the whole trail in the top bar', async ({ page }) => {
		await signIn(page);
		await openDemoPerson(page, MARKUS, 'Markus Brunner');

		const trail = page.getByTestId('top-bar').getByRole('navigation', { name: 'Breadcrumb' });
		await expect(trail).toHaveCount(1);
		await expect(trail.getByRole('link', { name: 'People' })).toBeVisible();
		await expect(trail).toContainText('Markus Brunner');
		await expect(trail.getByTestId('back-crumb')).toHaveCount(0);
	});
});

test.describe('a long description', () => {
	const LONG =
		'Heidi runs the salon on the corner, knows every family in the quarter by their children’s ' +
		'haircuts, keeps a jar of sweets on the counter for the little ones, and remembers who ' +
		'is getting married long before the invitations go out. ';

	/** Writes the description in place and waits for it to be read back. */
	async function describeHeidi(page: Page, text: string): Promise<Locator> {
		await openDemoPerson(page, HEIDI, 'Heidi Lehmann');
		const trigger = page.getByTestId('identity-card').locator('button[title="Edit description"]');
		await trigger.click();
		const field = page.getByRole('textbox', { name: 'Edit description' });
		await field.fill(text);
		await field.press('Enter');
		// The clamped box itself: the pencil's room is an inner span inside it (docs/05 §5.7).
		const value = trigger.locator(':scope > span', { hasText: text.trim() });
		await expect(value).toBeVisible();
		return value;
	}

	/** How many lines the value takes, and whether any of it is cut off. */
	const lines = (value: Locator) =>
		value.evaluate((el) => {
			const lineHeight = parseFloat(getComputedStyle(el).lineHeight);
			return {
				shown: Math.round(el.clientHeight / lineHeight),
				cut: el.scrollHeight > el.clientHeight + 1
			};
		});

	test.describe('on a phone', () => {
		test.use(PHONE);

		test('wraps to two lines instead of one cut short', async ({ page }) => {
			await signIn(page);
			const value = await describeHeidi(page, `${LONG}(${runLetters()})`);
			await expect(value).toHaveCSS('white-space', 'normal');
			await expect(value).toHaveCSS('-webkit-line-clamp', '2');
			expect(await lines(value)).toEqual({ shown: 2, cut: true });
		});
	});

	test('shows in full from md on', async ({ page }) => {
		await signIn(page);
		const value = await describeHeidi(page, `${LONG}${LONG}(${runLetters()})`);
		await expect(value).toHaveCSS('-webkit-line-clamp', 'none');
		const read = await lines(value);
		expect(read.cut).toBe(false);
		expect(read.shown).toBeGreaterThan(1);
	});
});

test.describe('the stream on Home', () => {
	const stream = (page: Page) => page.getByTestId('stream');
	const days = (page: Page) => stream(page).locator(':scope > li');

	test('names a moment’s people once, in its text, and keeps an interaction’s row', async ({
		page
	}) => {
		const letters = runLetters();
		await signIn(page);

		await mention(page, 'Bettina', /Bettina Roth/);
		await page.getByLabel('What happened?').pressSequentially(' and ');
		await mention(page, 'Jan', /Jan Steiner/);
		await page.getByLabel('What happened?').pressSequentially(` swapped seedlings ${letters}`);
		await page.getByRole('button', { name: /^Save/ }).click();

		const moment = page.locator('article', { hasText: `swapped seedlings ${letters}` });
		await expect(moment).toHaveCount(1);
		// Jan is a chip in the text; no row of avatars repeats him under it. (A day's moments on
		// one person share an article, so a repeat finds earlier chips in it too.)
		const toJan = 'a[href="/contacts/demo-c-jan"]';
		await expect(moment.locator('.note-body p', { hasText: letters }).locator(toJan)).toHaveCount(
			1
		);
		await expect(moment.locator(`${toJan}:not(.note-body a)`)).toHaveCount(0);

		// A touchpoint's text does not name who else was there, so its row stays.
		await openDemoPerson(page, RETO, 'Reto Hofer');
		const story = page.locator('#section-story');
		await story.getByRole('button', { name: 'Log contact' }).click();
		await story.getByLabel('Kind').selectOption('met');
		await story.getByPlaceholder('What happened? (optional)').fill(`Piano lesson ${letters}`);
		await pickPerson(story.getByLabel('Who else was there?'), 'Kurt Lehmann');
		await story.getByRole('button', { name: 'Log interaction' }).click();
		await expect(story.getByText(`Piano lesson ${letters}`)).toBeVisible();

		await signIn(page);
		const touch = page.locator('article', { hasText: `Piano lesson ${letters}` });
		await expect(touch).toHaveCount(1);
		await expect(touch.getByRole('link', { name: 'Kurt Lehmann' })).toBeVisible();
	});

	test('says the time of day under Today and nothing under an older day', async ({ page }) => {
		const letters = runLetters();
		await signIn(page);
		await mention(page, 'Bettina', /Bettina Roth/);
		await page.getByLabel('What happened?').pressSequentially(` repotted the fig ${letters}`);
		await page.getByRole('button', { name: /^Save/ }).click();

		const moment = page.locator('article', { hasText: `repotted the fig ${letters}` });
		await expect(moment).toHaveCount(1);
		const today = days(page).filter({ has: moment });
		await expect(today.locator(':scope > div').first()).toHaveText('Today');

		// The clock's time, not a fixed one; the tooltip has the whole date and time.
		const time = moment.locator('time');
		await expect(time).toHaveText(/^\d{1,2}:\d{2}(\s?[AP]M)?$/i);
		await expect(time).toHaveAttribute('title', /\d{4}.*\d{1,2}:\d{2}/);
		await expect(time).toHaveAttribute('datetime', /^\d{4}-\d{2}-\d{2}T/);

		// An older day's heading is its date, and its rows carry no time. Narrowed to Nina, the
		// household's other member, whom no spec writes as: what the suite writes today would push
		// the seed's older days off the stream's first page.
		await page
			.getByRole('navigation', { name: 'Filter the stream' })
			.getByRole('link', { name: 'Nina Brunner', exact: true })
			.click();
		await expect(page).toHaveURL(/[?&]by=/);
		const older = page.locator('article', { hasText: 'sharpened every knife' });
		await expect(older).toHaveCount(1);
		const olderDay = days(page).filter({ has: older });
		await expect(olderDay.locator(':scope > div').first()).not.toHaveText(/^(Today|Yesterday)$/);
		await expect(olderDay.locator('time')).toHaveCount(0);
	});
});

test.describe('the composer’s controls', () => {
	const share = (page: Page) => page.getByRole('switch', { name: 'Share with household' });

	test('a switch for sharing, a photo button, the day pill and the shortcut', async ({ page }) => {
		await signIn(page);

		await expect(share(page)).toBeChecked();
		await expect(page.getByText('Shared', { exact: true })).toBeVisible();
		await page.getByText('Shared', { exact: true }).click();
		await expect(share(page)).not.toBeChecked();
		await expect(page.getByText('Private', { exact: true })).toBeVisible();
		await share(page).focus();
		await page.keyboard.press('Space');
		await expect(share(page)).toBeChecked();
		await expect(page.getByText('Shared', { exact: true })).toBeVisible();

		// The photo control acts at once, so it is a button; its badge counts what was picked.
		const photos = page.getByRole('button', { name: 'Add photos' });
		await expect(photos).toBeVisible();
		await expect(page.getByTestId('photo-count')).toHaveCount(0);
		const png = { mimeType: 'image/png', buffer: Buffer.from('not decoded here') };
		await photos.setInputFiles([
			{ name: 'one.png', ...png },
			{ name: 'two.png', ...png }
		]);
		await expect(page.getByTestId('photo-count')).toHaveText('2');

		// The day pill keeps its menu.
		const day = page.getByRole('button', { name: /^Day:/ });
		await day.click();
		await expect(page.getByRole('menuitemradio').first()).toBeVisible();
		await page.keyboard.press('Escape');
		await expect(page.getByRole('menuitemradio')).toHaveCount(0);

		await expect(page.locator('kbd', { hasText: '⌘⏎' })).toBeVisible();
	});

	test.describe('in German', () => {
		/** Clicks one language in Settings and waits for the page to answer in it. */
		async function chooseLanguage(page: Page, language: string, heading: string): Promise<void> {
			await page.goto('/settings');
			await page.getByRole('button', { name: language }).click();
			await expect(page.getByRole('heading', { name: heading, exact: true })).toBeVisible();
		}

		// The choice is kept in the profile, which every later spec shares.
		test.afterEach(async ({ page }) => {
			await chooseLanguage(page, 'English', 'Settings');
		});

		test('names the photo button in German', async ({ page }) => {
			await signIn(page);
			await chooseLanguage(page, 'Deutsch', 'Einstellungen');
			await page.goto('/');
			await expect(page.getByRole('heading', { name: 'Was ist passiert?' })).toBeVisible();
			await expect(page.getByRole('button', { name: 'Fotos hinzufügen' })).toBeVisible();
			await expect(page.getByRole('switch', { name: 'Mit dem Haushalt teilen' })).toBeChecked();
		});
	});
});
