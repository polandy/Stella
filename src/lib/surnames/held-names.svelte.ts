import type { SubmitFunction } from '@sveltejs/kit';
import { invalidateAll } from '$app/navigation';
import { useI18n } from '$lib/i18n/context.svelte';
import { useRemovals } from '$lib/undo/context.svelte';
import { submitAction } from '$lib/undo/submit-action';
import { held, hiddenIds, sending, settle, takenBack, type Batches } from './batches';
import { passOnOffer, type PassOnMap } from './pass-on';

/*
 * Giving last names with an undo window (docs/concepts/surnames.md §3.3, §7, docs/02 §2.23):
 * the adapter between a page's forms and the removals store. The form is not posted when it is
 * submitted; its people leave the lists at once, a toast offers *Undo* for eight seconds, and the
 * batch goes out only when that window closes or the page is left.
 *
 * When the people given a name had none before and have children or siblings who still have
 * none, the same toast offers it to them — *Brunner too? [Yes]* — and *Yes* is a batch of its
 * own, whose toast offers the next generation in turn. Which rows are hidden is `batches.ts`;
 * whom the toast offers the name to is `pass-on.ts`; this holds the browser half.
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

/**
 * Call once from a component's script; it reads the shell's removals store from context.
 * `passOn` is the page's map of nameless children and siblings; without one nothing is offered.
 */
export function useHeldNames(passOn: () => PassOnMap = () => ({})): HeldNames {
	const removals = useRemovals();
	const i18n = useI18n();
	const t = i18n.t;
	let batches = $state.raw<Batches>({});
	/** Everyone named during this visit, so an offer never comes back for them. */
	const namedThisVisit = new Set<string>();
	let counter = 0;

	// Undo is pressed in the toast: a batch the store let go of before sending was taken back.
	$effect(() => {
		void removals.snapshot;
		batches = takenBack(batches, removals.isPending);
	});

	const listOf = (names: string[]) => new Intl.ListFormat(i18n.intlLocale, { type: 'conjunction' }).format(names);

	/**
	 * Hold one batch. `fresh` are those of `ids` who had no last name before — only they pass a
	 * name on, since changing a name that was there offers nothing to anyone (§3.3).
	 */
	function hold(actionUrl: string, formData: FormData, ids: string[], fresh: string[], lastName: string) {
		const key = `last-names:${++counter}`;
		for (const id of ids) namedThisVisit.add(id);
		const heirs = passOnOffer(passOn(), fresh, lastName, namedThisVisit);
		batches = held(batches, key, ids);
		removals.remove({
			key,
			label: heirs.length
				? t('surnames.toast.passOn', { people: listOf(heirs.map((h) => h.name)), count: heirs.length, name: lastName })
				: t('surnames.toast.set', { name: lastName, count: ids.length }),
			offer: heirs.length
				? {
						label: t('surnames.toast.yes'),
						accept: () => {
							const more = new FormData();
							more.set('lastName', lastName);
							for (const heir of heirs) more.append('contactId', heir.id);
							const heirIds = heirs.map((h) => h.id);
							hold(actionUrl, more, heirIds, heirIds, lastName);
						}
					}
				: undefined,
			commit: async () => {
				batches = sending(batches, key);
				try {
					await submitAction(fetch, actionUrl, formData);
				} catch {
					// Its own words rather than the store's "could not remove": nothing was removed.
					batches = settle(batches, key, 'failed');
					for (const id of ids) namedThisVisit.delete(id);
					removals.notify(t('surnames.toast.failed'));
					return;
				}
				batches = settle(batches, key, 'sent');
				await invalidateAll();
			}
		});
	}

	return {
		get hidden() {
			return hiddenIds(batches);
		},
		submit(onHeld) {
			return ({ action, formData, cancel }) => {
				cancel();
				const ids = formData.getAll('contactId').map(String);
				const replaced = new Set(formData.getAll('replaceId').map(String));
				const lastName = String(formData.get('lastName') ?? '').trim();
				if (ids.length === 0 || lastName === '') return;
				hold(
					`${action.pathname}${action.search}`,
					formData,
					ids,
					ids.filter((id) => !replaced.has(id)),
					lastName
				);
				onHeld?.({ ids, lastName });
			};
		}
	};
}
