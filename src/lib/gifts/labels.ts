import type { Translate } from '../i18n/translate';
import { isGiftOccasionPreset } from './gifts';

/*
 * How a gift's occasion reads (docs/02 §2.25). A preset is stored as its key and worded in the
 * reader's language, so a gift noted in German says *Christmas* to an English reader; an
 * occasion of the member's own wording is shown as typed.
 */

/** The occasion as the reader reads it. */
export function occasionLabel(t: Translate, occasion: string): string {
	return isGiftOccasionPreset(occasion) ? t(`gifts.occasion.${occasion}`) : occasion;
}
