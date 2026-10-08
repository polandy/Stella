import { dayLabel, type DateLanguage } from '../dates/labels';
import type { Translate } from '../i18n/translate';
import { isGiftOccasionPreset, type GiftState } from './gifts';

/*
 * How a gift's occasion reads (docs/02 §2.25). A preset is stored as its key and worded in the
 * reader's language, so a gift noted in German says *Christmas* to an English reader; an
 * occasion of the member's own wording is shown as typed.
 */

/** The occasion as the reader reads it. */
export function occasionLabel(t: Translate, occasion: string): string {
	return isGiftOccasionPreset(occasion) ? t(`gifts.occasion.${occasion}`) : occasion;
}

/**
 * When an idea was noted: *Added 3 October 2026*. The day is the reader's, in their time zone,
 * and worded the way the page names any other day (`dayLabel`).
 */
export function addedLabel(lang: DateLanguage, createdAt: number, timeZone: string): string {
	// en-CA writes the calendar day as YYYY-MM-DD.
	const day = new Date(createdAt).toLocaleDateString('en-CA', { timeZone });
	return lang.t('gifts.addedOn', { day: dayLabel(lang, day) });
}

/**
 * Where a gift stands, in one phrase: *Idea*, *Given on 24 December 2025*, *Received on …* —
 * how a search hit says which of a person's gifts it is (docs/02 §2.9).
 */
export function stateLabel(
	lang: DateLanguage,
	gift: { state: GiftState; givenOn: string | null }
): string {
	if (gift.state === 'idea' || gift.givenOn === null) return lang.t('gifts.state.idea');
	return lang.t(`gifts.state.${gift.state}`, { day: dayLabel(lang, gift.givenOn) });
}
