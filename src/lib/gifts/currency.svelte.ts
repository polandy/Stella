import { getContext, setContext } from 'svelte';
import { useI18n } from '#lib/i18n/context.svelte.js';
import { valueLabel } from './value.js';

/*
 * The one currency the instance is configured with (`GIFT_CURRENCY`, docs/dev/02 §2.25.16) comes
 * down with the app shell, and every row and field that shows a gift's value reads it from here.
 */

const CONTEXT_KEY = Symbol('gift-currency');

type Read = () => string;

/** Puts the instance's currency in reach of every gift row below. Call once, from the app shell. */
export function provideGiftCurrency(read: Read): void {
	setContext(CONTEXT_KEY, read);
}

/** The currency, and a gift's value spelled with it; empty outside the shell. */
export function useGiftCurrency(): {
	readonly currency: string;
	label: (value: number) => string;
} {
	const read = getContext<Read | undefined>(CONTEXT_KEY);
	const i18n = useI18n();
	return {
		get currency() {
			return read?.() ?? '';
		},
		label: (value) => valueLabel(value, read?.() ?? '', i18n.intlLocale)
	};
}
