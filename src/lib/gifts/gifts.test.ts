import { describe, expect, it } from 'bun:test';
import {
	hasGiftDay,
	isAddableGiftState,
	isGiftOccasionPreset,
	isGiftState,
	isOpenGift,
	occasionFromForm,
	giverFromForm,
	giversFromForm,
	givenFromWho,
	giverIdsOf,
	HOUSEHOLD_GIVER,
	OTHER_OCCASION,
	visibilityFromForm
} from './gifts';

/*
 * The words a gift is made of (docs/dev/02 §2.25): its states, and the occasions the form offers.
 * Pure, so the form, the command schema and the use-case agree on them.
 */

describe('isGiftState', () => {
	it('knows the four states and nothing else', () => {
		expect(['idea', 'bought', 'given', 'received'].every(isGiftState)).toBe(true);
		expect(isGiftState('offered')).toBe(false);
		expect(isGiftState('')).toBe(false);
	});
});

describe('isAddableGiftState', () => {
	it('adds an idea, a given or a received gift, never one already bought', () => {
		expect(['idea', 'given', 'received'].every(isAddableGiftState)).toBe(true);
		expect(isAddableGiftState('bought')).toBe(false);
	});
});

describe('hasGiftDay and isOpenGift', () => {
	it('gives a day to a given or received gift; an idea and a bought one are still to come', () => {
		expect(hasGiftDay('given') && hasGiftDay('received')).toBe(true);
		expect(hasGiftDay('idea') || hasGiftDay('bought')).toBe(false);
		expect(isOpenGift('idea') && isOpenGift('bought')).toBe(true);
		expect(isOpenGift('given')).toBe(false);
	});
});

describe('isGiftOccasionPreset', () => {
	it('names the occasions the form offers as chips', () => {
		expect(['birthday', 'christmas', 'anniversary'].every(isGiftOccasionPreset)).toBe(true);
	});

	it('leaves free text as what was typed', () => {
		expect(isGiftOccasionPreset('Housewarming')).toBe(false);
		expect(isGiftOccasionPreset('Birthday')).toBe(false);
	});
});

describe('occasionFromForm', () => {
	it('stores a chosen preset as its key', () => {
		expect(occasionFromForm('christmas', 'ignored')).toBe('christmas');
	});

	it('stores what was typed when *Other* was chosen', () => {
		expect(occasionFromForm(OTHER_OCCASION, '  Housewarming ')).toBe('Housewarming');
		expect(occasionFromForm(OTHER_OCCASION, '   ')).toBeNull();
	});

	it('stores nothing when nothing was chosen, or something that is not a choice', () => {
		expect(occasionFromForm(null, 'typed but not chosen')).toBeNull();
		expect(occasionFromForm('', null)).toBeNull();
		expect(occasionFromForm('easter', null)).toBeNull();
	});
});

describe('visibilityFromForm', () => {
	it('reads *Everyone but them* as a shared gift kept from the person it is for', () => {
		expect(visibilityFromForm('surprise')).toEqual({
			visibility: 'shared',
			hiddenFromRecipient: true
		});
	});

	it('reads *Private* and *Shared* as they are, kept from nobody', () => {
		expect(visibilityFromForm('private')).toEqual({
			visibility: 'private',
			hiddenFromRecipient: false
		});
		expect(visibilityFromForm('shared')).toEqual({
			visibility: 'shared',
			hiddenFromRecipient: false
		});
	});

	it('reads anything else, or nothing, as shared — the household default', () => {
		expect(visibilityFromForm(null)).toEqual({ visibility: 'shared', hiddenFromRecipient: false });
		expect(visibilityFromForm('everyone')).toEqual({
			visibility: 'shared',
			hiddenFromRecipient: false
		});
	});
});

describe('giverIdsOf (§2.25.12)', () => {
	it('names who gives it as the field posts them: people by id, the household as itself', () => {
		expect(giverIdsOf({ kind: 'none' })).toEqual([]);
		expect(giverIdsOf({ kind: 'unseen' })).toEqual([]);
		expect(giverIdsOf({ kind: 'person', contactId: 'sandra', name: 'Sandra' })).toEqual(['sandra']);
		expect(
			giverIdsOf({
				kind: 'several',
				givers: [
					{ kind: 'household' },
					{ kind: 'person', contactId: 'marco', name: 'Marco' },
					{ kind: 'left', name: 'Ruth' }
				]
			})
		).toEqual([HOUSEHOLD_GIVER, 'marco']);
	});
});

describe('giversFromForm (§2.25.12)', () => {
	it('reads nobody when nothing, or only blanks, was posted', () => {
		expect(giversFromForm([])).toEqual({ giver: null, coGivers: [] });
		expect(giversFromForm(['', ' '])).toEqual({ giver: null, coGivers: [] });
	});

	it('reads the first as the giver and the rest beside them, in the order posted', () => {
		expect(giversFromForm(['sandra', '', HOUSEHOLD_GIVER, 'marco'])).toEqual({
			giver: { contactId: 'sandra' },
			coGivers: [{ household: true }, { contactId: 'marco' }]
		});
	});
});

describe('giverFromForm (§2.25.12)', () => {
	it('reads nobody, the household, or a person', () => {
		expect(giverFromForm(null)).toBeNull();
		expect(giverFromForm('  ')).toBeNull();
		expect(giverFromForm(HOUSEHOLD_GIVER)).toEqual({ household: true });
		expect(giverFromForm('sandra')).toEqual({ contactId: 'sandra' });
	});
});

describe('givenFromWho (§2.25.12)', () => {
	it('says us while nobody is named: the stored default', () => {
		expect(givenFromWho([], 'c-me')).toBe('us');
	});

	it('says me only when the own person is the sole giver', () => {
		expect(givenFromWho(['c-me'], 'c-me')).toBe('me');
		expect(givenFromWho(['c-me', 'c-andy'], 'c-me')).toBe('named');
		expect(givenFromWho(['c-andy'], 'c-me')).toBe('named');
		expect(givenFromWho(['c-andy'], null)).toBe('named');
	});

	it('names the household when it is chosen on purpose', () => {
		expect(givenFromWho([HOUSEHOLD_GIVER], 'c-me')).toBe('named');
	});
});
