import { describe, expect, it } from 'bun:test';
import { INTL_LOCALES } from '../i18n/locales';
import { createTranslator } from '../i18n/translate';
import {
	addedLabel,
	giverLabel,
	togetherLabel,
	nextOccasionLabel,
	occasionHeading,
	occasionLabel,
	pastOccasionChip,
	stateLabel
} from './labels';

/*
 * An occasion as the reader reads it (docs/dev/02 §2.25): a preset in their language, whoever
 * chose it; anything typed as it was typed.
 */

describe('occasionLabel', () => {
	it('words a preset in the reader’s language', () => {
		expect(occasionLabel(createTranslator('en'), 'christmas')).toBe('Christmas');
		expect(occasionLabel(createTranslator('de'), 'christmas')).toBe('Weihnachten');
	});

	it('leaves an occasion of the member’s own wording as it was typed', () => {
		expect(occasionLabel(createTranslator('de'), 'Housewarming')).toBe('Housewarming');
	});
});

describe('addedLabel', () => {
	const en = { t: createTranslator('en'), intlLocale: INTL_LOCALES.en };
	const de = { t: createTranslator('de'), intlLocale: INTL_LOCALES.de };
	const thirdOctoberNoonUtc = Date.parse('2026-10-03T12:00:00Z');

	it('says the day the idea was noted, the way the page names a day', () => {
		expect(addedLabel(en, thirdOctoberNoonUtc, 'UTC')).toBe('Added 3 October 2026');
		expect(addedLabel(de, thirdOctoberNoonUtc, 'UTC')).toBe('Notiert am 3. Oktober 2026');
	});

	it('names the day in the reader’s time zone, not the server’s', () => {
		const lateEveningInZurich = Date.parse('2026-10-03T22:30:00Z');
		expect(addedLabel(en, lateEveningInZurich, 'UTC')).toBe('Added 3 October 2026');
		expect(addedLabel(en, lateEveningInZurich, 'Europe/Zurich')).toBe('Added 4 October 2026');
	});
});

describe('stateLabel', () => {
	const en = { t: createTranslator('en'), intlLocale: INTL_LOCALES.en };
	const de = { t: createTranslator('de'), intlLocale: INTL_LOCALES.de };

	it('calls an idea an idea', () => {
		expect(stateLabel(en, { state: 'idea', givenOn: null })).toBe('Idea');
		expect(stateLabel(de, { state: 'idea', givenOn: null })).toBe('Idee');
	});

	it('calls a bought gift bought, as it has no day yet', () => {
		expect(stateLabel(en, { state: 'bought', givenOn: null })).toBe('Bought');
		expect(stateLabel(de, { state: 'bought', givenOn: null })).toBe('Besorgt');
	});

	it('says on which day a gift was given or received', () => {
		expect(stateLabel(en, { state: 'given', givenOn: '2025-12-24' })).toBe(
			'Given on 24 December 2025'
		);
		expect(stateLabel(de, { state: 'received', givenOn: '2025-12-24' })).toBe(
			'Bekommen am 24. Dezember 2025'
		);
	});
});

describe('nextOccasionLabel', () => {
	const en = { t: createTranslator('en'), intlLocale: INTL_LOCALES.en };
	const de = { t: createTranslator('de'), intlLocale: INTL_LOCALES.de };

	it('says which occasion, how far off and the day', () => {
		const birthday = { kind: 'birthday', date: '2026-11-11', daysUntil: 12 } as const;
		expect(nextOccasionLabel(en, birthday)).toBe('Birthday in 12 days · 11 Nov');
		expect(nextOccasionLabel(de, birthday)).toBe('Geburtstag in 12 Tagen · 11. Nov.');
	});

	it('says today and tomorrow out loud', () => {
		expect(nextOccasionLabel(en, { kind: 'christmas', date: '2026-12-24', daysUntil: 0 })).toBe(
			'Christmas today · 24 Dec'
		);
		expect(nextOccasionLabel(de, { kind: 'christmas', date: '2026-12-24', daysUntil: 1 })).toBe(
			'Weihnachten morgen · 24. Dez.'
		);
	});
});

describe('togetherLabel', () => {
	const en = createTranslator('en');
	const de = createTranslator('de');
	const andy = { kind: 'person', contactId: 'andy', name: 'Andy' } as const;
	it('says with whom it is given, and nothing when it is given alone', () => {
		expect(togetherLabel(de, [])).toBeNull();
		expect(togetherLabel(de, [andy])).toBe('gemeinsam mit Andy');
		expect(togetherLabel(en, [andy, { kind: 'household' }])).toBe('together with Andy and us');
		expect(togetherLabel(de, [andy, { kind: 'unseen' }])).toBe(
			'gemeinsam mit Andy und jemand anderem'
		);
	});
});

describe('giverLabel', () => {
	const en = createTranslator('en');
	const de = createTranslator('de');

	it('says who is giving an open gift', () => {
		const sandra = { kind: 'person', contactId: 's', name: 'Sandra' } as const;
		expect(giverLabel(de, sandra, 'idea')).toBe('Sandra schenkt');
		expect(giverLabel(en, sandra, 'bought')).toBe('Sandra is giving it');
		expect(giverLabel(de, { kind: 'household' }, 'idea')).toBe('Wir schenken');
		expect(giverLabel(de, { kind: 'unseen' }, 'idea')).toBe('vergeben');
		expect(giverLabel(de, { kind: 'left', name: 'Ruth' }, 'idea')).toBe('Ruth schenkt');
	});

	it('says who gave a gift given', () => {
		const sandra = { kind: 'person', contactId: 's', name: 'Sandra' } as const;
		expect(giverLabel(de, sandra, 'given')).toBe('von Sandra');
		expect(giverLabel(en, { kind: 'household' }, 'given')).toBe('from us');
		expect(giverLabel(de, { kind: 'unseen' }, 'given')).toBe('von jemand anderem');
	});

	it('says who give together, the household among them', () => {
		const julia = { kind: 'person', contactId: 'j', name: 'Julia' } as const;
		const andy = { kind: 'person', contactId: 'a', name: 'Andy' } as const;
		const ruth = { kind: 'left', name: 'Ruth' } as const;
		expect(giverLabel(de, { kind: 'several', givers: [julia, andy] }, 'given')).toBe(
			'von Julia und Andy'
		);
		expect(giverLabel(en, { kind: 'several', givers: [julia, andy, ruth] }, 'given')).toBe(
			'from Julia, Andy and Ruth'
		);
		expect(giverLabel(de, { kind: 'several', givers: [julia, andy] }, 'idea')).toBe(
			'Julia und Andy schenken'
		);
		expect(
			giverLabel(en, { kind: 'several', givers: [{ kind: 'household' }, julia] }, 'idea')
		).toBe('We and Julia are giving it');
		expect(
			giverLabel(de, { kind: 'several', givers: [{ kind: 'household' }, julia] }, 'given')
		).toBe('von uns und Julia');
		expect(giverLabel(de, { kind: 'several', givers: [julia, { kind: 'unseen' }] }, 'given')).toBe(
			'von Julia und jemand anderem'
		);
	});

	it('says nothing when nobody is named, or on a gift received', () => {
		expect(giverLabel(de, { kind: 'none' }, 'idea')).toBeNull();
		expect(giverLabel(de, { kind: 'household' }, 'received')).toBeNull();
	});
});

describe('occasionHeading (§2.25.13)', () => {
	const en = { t: createTranslator('en'), intlLocale: INTL_LOCALES.en };
	const de = { t: createTranslator('de'), intlLocale: INTL_LOCALES.de };
	const sixth = { on: '2027-03-04', when: { kind: 'at_age', age: 6 } as const };

	it('names Christmas Eve by its year, whatever the when was', () => {
		const eve = { on: '2026-12-24', when: { kind: 'christmas_at_age', age: 5 } as const };
		expect(occasionHeading(de, eve, '2026-11-21')).toEqual({
			title: 'Weihnachten 2026',
			near: 'in 33 Tagen · 24. Dez.'
		});
	});

	it('names any other day by its when, and says how near it is', () => {
		expect(occasionHeading(en, sixth, '2027-03-03')).toEqual({
			title: 'For the 6th birthday',
			near: 'tomorrow · 4 Mar'
		});
		expect(occasionHeading(en, sixth, '2027-03-04').near).toBe('today');
		expect(occasionHeading(en, sixth, '2027-03-05').near).toBe('passed');
	});

	it('gives the gifts without an occasion a heading and no nearness', () => {
		expect(occasionHeading(de, { on: null, when: null }, '2026-11-21')).toEqual({
			title: 'Ohne Anlass',
			near: null
		});
	});
});

describe('pastOccasionChip (§2.25.14)', () => {
	const de = { t: createTranslator('de'), intlLocale: INTL_LOCALES.de };

	it('names the occasion and its day', () => {
		const eve = { on: '2026-12-24', when: { kind: 'on_date', on: '2026-12-24' } as const };
		expect(pastOccasionChip(de, eve)).toEqual({ title: 'Weihnachten 2026', day: '24. Dez.' });
	});

	it('names a birthday without an age as a birthday', () => {
		expect(pastOccasionChip(de, { on: '2026-06-10', when: null })).toEqual({
			title: 'Geburtstag',
			day: '10. Juni'
		});
	});
});
