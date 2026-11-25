import { onMount } from 'svelte';
import { thenPreference, type ThenOrNow } from './then-preference.js';

// The reader's Then · Now choice, read once mounted and kept for every circle (docs/dev/02 §2.4.2).

// Reached through calls, so a blocked `localStorage` throws inside the preference's own guard.
const browserStorage = {
	getItem: (key: string) => localStorage.getItem(key),
	setItem: (key: string, value: string) => localStorage.setItem(key, value)
};

export function useThenChoice(): { readonly choice: ThenOrNow | null; choose(c: ThenOrNow): void } {
	const preference = thenPreference(browserStorage);
	let choice = $state<ThenOrNow | null>(null);
	onMount(() => {
		choice = preference.load();
	});
	return {
		get choice() {
			return choice;
		},
		choose(c) {
			choice = c;
			preference.save(c);
		}
	};
}
