import type { PartialDate } from '$lib/dates/partial-date';
import { dayLabel } from '$lib/dates/labels';
import type { I18n } from '$lib/i18n/context.svelte';
import type { CardLabel } from '$lib/import-match/card';
import type { Fact } from '$lib/import-match/merge-plan';

/*
 * How the review step words a card's facts (docs/02 §2.16): one place, so both sides of a
 * card and the conflicts read alike.
 */

/** A date known in part: a day as the calendar says it, a year as it is. */
export function dateText(i18n: I18n, date: PartialDate): string {
	return date.precision === 'full' || date.precision === 'month_day'
		? dayLabel(i18n, date.value)
		: date.value;
}

export function labelText(i18n: I18n, label: CardLabel | null): string | null {
	if (label === null) return null;
	return 'known' in label ? i18n.t(`import.review.label.${label.known}`) : label.typed;
}

export function factLabel(i18n: I18n, fact: Fact): string {
	return i18n.t(`import.review.fact.${fact.kind}`);
}

export function factValue(i18n: I18n, fact: Fact): string {
	switch (fact.kind) {
		case 'birthday':
			return dateText(i18n, fact.date);
		case 'photo':
			return i18n.t('import.review.photo.inline');
		case 'tag':
			return fact.name;
		default:
			return fact.value;
	}
}
