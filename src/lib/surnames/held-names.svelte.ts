import type { SubmitFunction } from '@sveltejs/kit';
import { invalidateAll } from '$app/navigation';
import { useTranslate } from '$lib/i18n/context.svelte';
import { useRemovals } from '$lib/undo/context.svelte';
import { submitAction } from '$lib/undo/submit-action';
import { held, hiddenIds, sending, settle, takenBack, type Batches } from './batches';

/*
 * Giving last names with an undo window (docs/concepts/surnames.md §7, docs/02 §2.23): the
 * adapter between a page's forms and the removals store. The form is not posted when it is
 * submitted; its people leave the lists at once, a toast offers *Undo* for eight seconds, and the
 * batch goes out only when that window closes or the page is left. The rules of which rows are
 * hidden are `batches.ts`; this holds the browser half.
 */

/** What a page learns when a batch is handed to the window. */
export interface HeldBatch {
	ids: string[];
	lastName: string;
}

export interface HeldNames {
	/** The people to leave out of the lists while their batch is held, sent, or on its way. */
	readonly hidden: ReadonlySet<string>;
	/** `use:enhance={names.submit(onHeld)}` on any form posting `?/setLastNames`. */
	submit(onHeld?: (batch: HeldBatch) => void): SubmitFunction;
}

/** Call once from a component's script; it reads the shell's removals store from context. */
export function useHeldNames(): HeldNames {
	const removals = useRemovals();
	const t = useTranslate();
	let batches = $state.raw<Batches>({});
	let counter = 0;

	// Undo is pressed in the toast: a batch the store let go of before sending was taken back.
	$effect(() => {
		void removals.snapshot;
		batches = takenBack(batches, removals.isPending);
	});

	return {
		get hidden() {
			return hiddenIds(batches);
		},
		submit(onHeld) {
			return ({ action, formData, cancel }) => {
				cancel();
				const ids = formData.getAll('contactId').map(String);
				const lastName = String(formData.get('lastName') ?? '').trim();
				if (ids.length === 0 || lastName === '') return;
				const key = `last-names:${++counter}`;
				batches = held(batches, key, ids);
				removals.remove({
					key,
					label: t('surnames.toast.set', { name: lastName, count: ids.length }),
					commit: async () => {
						batches = sending(batches, key);
						try {
							await submitAction(fetch, `${action.pathname}${action.search}`, formData);
						} catch {
							// Its own words rather than the store's "could not remove": nothing was removed.
							batches = settle(batches, key, 'failed');
							removals.notify(t('surnames.toast.failed'));
							return;
						}
						batches = settle(batches, key, 'sent');
						await invalidateAll();
					}
				});
				onHeld?.({ ids, lastName });
			};
		}
	};
}
