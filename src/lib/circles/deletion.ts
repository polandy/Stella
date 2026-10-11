import type { Translate } from '$lib/i18n/translate';

/*
 * What a circle's confirm step says goes and what stays (docs/02 §2.4.2), from the counts the
 * page reads when the step opens. Members are only the ones the reader sees; photos and wearers
 * are all of them, since all of them go. Nested circles stay without a parent: named when the
 * reader sees them, else only counted.
 */

/** What deleting a circle would take, as `/circles/[id]/deletion` answers it. */
export interface CircleDeletionCounts {
	name: string;
	members: number;
	photos: number;
	wornPhotos: number;
	wearers: number;
	children: { named: { id: string; name: string }[]; unnamed: number };
}

/** What the sentences need of the reader's language (docs/02 §2.19). */
export interface DeletionLanguage {
	t: Translate;
	/** The BCP-47 tag `Intl` joins the names with, e.g. "de-DE". */
	intlLocale: string;
}

/** The confirm step's sentences, in order: what goes, whose pictures stay, which circles stay. */
export function circleDeletionSentences(
	lang: DeletionLanguage,
	counts: CircleDeletionCounts
): string[] {
	const { t } = lang;
	const sentences = [
		t('circles.delete.explain', {
			name: counts.name,
			members: counts.members,
			photos: counts.photos
		})
	];
	if (counts.wornPhotos > 0) {
		sentences.push(t('circles.delete.worn', { photos: counts.wornPhotos, people: counts.wearers }));
	}
	const { named, unnamed } = counts.children;
	if (named.length + unnamed > 0) {
		const parts = named.map((child) => child.name);
		if (unnamed > 0) {
			parts.push(t('circles.delete.unnamedChildren', { count: unnamed, more: named.length > 0 }));
		}
		const list = new Intl.ListFormat(lang.intlLocale, { type: 'conjunction' }).format(parts);
		sentences.push(t('circles.delete.children', { list, count: named.length + unnamed }));
	}
	return sentences;
}
