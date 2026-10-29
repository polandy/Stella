import { dayLabel, type DateLanguage } from '../dates/labels';
import type { Translate } from '../i18n/translate';
import { isGiftOccasionPreset, type GiftState } from './gifts';
import type { NextOccasion } from './idea-list';

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

/**
 * The occasion a person's ideas on the household's list are for: *Birthday in 12 days · 11 Nov*,
 * *Christmas tomorrow · 24 Dec* (docs/02 §2.25.6).
 */
export function nextOccasionLabel(lang: DateLanguage, next: NextOccasion): string {
	const when =
		next.daysUntil === 0
			? lang.t('common.today')
			: next.daysUntil === 1
				? lang.t('common.tomorrow')
				: lang.t('dates.inDays', { days: next.daysUntil });
	// The ISO day is read as UTC midnight, so it is formatted in UTC too: never the day before.
	const day = new Date(next.date).toLocaleDateString(lang.intlLocale, {
		day: 'numeric',
		month: 'short',
		timeZone: 'UTC'
	});
	return lang.t('gifts.list.next', { occasion: lang.t(`gifts.occasion.${next.kind}`), when, day });
}
