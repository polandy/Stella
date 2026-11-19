<script lang="ts">
	import type { SubmitFunction } from '$app/forms';
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import Button from '#lib/components/ui/Button.svelte';
	import { useI18n } from '#lib/i18n/context.svelte.js';
	import { reachability } from '#lib/pwa/reachability.svelte.js';
	import { giveFromChip, type ChipGiveDeps } from '#lib/surnames/chip-give.js';
	import { useHeldNames } from '#lib/surnames/held-names.svelte.js';
	import { passOnOffer } from '#lib/surnames/pass-on.js';
	import { renameOffer } from '#lib/surnames/rename-offer.js';
	import { usePending } from '#lib/sync/context.svelte.js';
	import { useRemovals } from '#lib/undo/context.svelte.js';
	import { submitAction } from '#lib/undo/submit-action.js';
	import type { PersonPageData } from './types';

	/*
	 * Under the shown name (docs/dev/02 §2.2, §2.2.4.5, §2.2.4.6): Stella's
	 * proposal for a missing last name as a chip (*Brunner?*). A tap saves it at once under the
	 * shell's activity indicator; once the page has reloaded with the new name, a toast offers
	 * *Undo* (`chip-give.ts`). When someone is given their first last name — by the chip or the
	 * name editor — their children and siblings who still have none are offered it right here,
	 * as a batch with the usual undo window; when a last name is changed, the family still
	 * carrying the old one is offered the new one, each ticked and untickable. Sized for a finger on a coarse pointer (docs/dev/05 §5.9).
	 */
	let { data }: { data: PersonPageData } = $props();

	const i18n = useI18n();
	const t = i18n.t;
	const c = $derived(data.contact);
	const names = useHeldNames(() => data.lastNameHelp.passOn);
	const held = names.submit();
	const disabled = $derived(!reachability.reachable);

	const chipDeps: ChipGiveDeps = {
		send: (action, body) => submitAction(fetch, action, body, { keepalive: false }),
		refresh: invalidateAll,
		pending: usePending(),
		notify: useRemovals().notify,
		t
	};
	/** A chip's name on its way: the chips step aside, and come back if the save fails. */
	let giving = $state(false);
	const giveChip: SubmitFunction = ({ action, formData, cancel }) => {
		cancel();
		giving = true;
		void giveFromChip(chipDeps, {
			page: action.pathname,
			contactId: c.id,
			lastName: String(formData.get('lastName') ?? ''),
			before: { displayName: c.displayName, firstName: c.firstName }
		}).finally(() => (giving = false));
	};

	/*
	 * A first last name given to this person: seen as the blank turning into a name once the
	 * page has reloaded. A name taken back (*Undo*) withdraws the offer with it.
	 */
	// svelte-ignore state_referenced_locally
	let before = { id: c.id, lastName: c.lastName };
	let passOn = $state<{ lastName: string; people: { id: string; name: string }[] } | null>(null);
	let rename = $state<{
		from: string;
		lastName: string;
		people: { id: string; name: string }[];
	} | null>(null);
	/** Those of `rename` unticked, to keep their name. */
	let keep = $state<Record<string, boolean>>({});
	$effect(() => {
		const now = { id: c.id, lastName: c.lastName };
		if (now.id !== before.id || !now.lastName) passOn = rename = null;
		else if (!before.lastName) {
			const people = passOnOffer(data.lastNameHelp.passOn, [c.id], now.lastName, new Set());
			passOn = people.length ? { lastName: now.lastName, people } : null;
		} else if (before.lastName !== now.lastName) {
			const people = renameOffer(data.lastNameHelp.family, before.lastName, now.lastName);
			rename = people.length ? { from: before.lastName, lastName: now.lastName, people } : null;
			keep = {};
		}
		before = now;
	});
	const renamed = $derived(rename?.people.filter((p) => !keep[p.id]) ?? []);
	const listOf = (people: { name: string }[]) =>
		new Intl.ListFormat(i18n.intlLocale, { type: 'conjunction' }).format(people.map((p) => p.name));
</script>

{#if !c.lastName && !giving && data.lastNameHelp.chips.length > 0}
	<div class="mt-1 flex flex-wrap items-center gap-2 text-xs pointer-coarse:gap-3">
		{#each data.lastNameHelp.chips as chip (chip.name)}
			<form method="POST" action="?/setLastNames" use:enhance={giveChip}>
				<input type="hidden" name="lastName" value={chip.name} />
				<input type="hidden" name="contactId" value={c.id} />
				<button
					type="submit"
					class="min-h-8 rounded-full border border-border bg-bg px-2.5 font-medium text-fg hover:border-primary hover:text-primary disabled:opacity-50 pointer-coarse:min-h-11 pointer-coarse:px-4 pointer-coarse:text-sm"
					title={chip.why}
					aria-label={t('surnames.chipHint', { name: chip.name })}
					{disabled}
					data-testid="last-name-chip"
				>
					{t('surnames.chip', { name: chip.name })}
				</button>
			</form>
		{/each}
	</div>
{/if}

{#if passOn}
	<form
		method="POST"
		action="?/setLastNames"
		use:enhance={(event) => {
			const submit = held(event);
			passOn = null;
			return submit;
		}}
		class="mt-2 flex flex-wrap items-center gap-2 rounded-app bg-primary-soft px-3 py-2 text-sm text-fg pointer-coarse:gap-3"
		data-testid="pass-on"
	>
		<input type="hidden" name="lastName" value={passOn.lastName} />
		{#each passOn.people as person (person.id)}<input
				type="hidden"
				name="contactId"
				value={person.id}
			/>{/each}
		<span class="min-w-0 flex-1">
			{t('surnames.passOnPrompt', {
				people: listOf(passOn.people),
				count: passOn.people.length,
				name: passOn.lastName
			})}
		</span>
		<Button
			variant="primary"
			size="sm"
			class="pointer-coarse:min-h-11 pointer-coarse:min-w-11 pointer-coarse:px-4"
			{disabled}>{t('surnames.toast.yes')}</Button
		>
		<Button
			variant="ghost"
			size="sm"
			type="button"
			class="pointer-coarse:min-h-11 pointer-coarse:min-w-11 pointer-coarse:px-4"
			onclick={() => (passOn = null)}
		>
			{t('surnames.no')}
		</Button>
	</form>
{/if}

{#if rename}
	<form
		method="POST"
		action="?/setLastNames"
		use:enhance={(event) => {
			const submit = held(event);
			rename = null;
			return submit;
		}}
		class="mt-2 flex flex-col gap-2 rounded-app bg-primary-soft px-3 py-2 text-sm text-fg"
		data-testid="rename-family"
	>
		<input type="hidden" name="lastName" value={rename.lastName} />
		{#each renamed as person (person.id)}
			<input type="hidden" name="contactId" value={person.id} />
			<input type="hidden" name="replaceId" value={person.id} />
		{/each}
		<p>
			{t('surnames.renamePrompt', {
				from: rename.from,
				name: rename.lastName,
				count: rename.people.length
			})}
		</p>
		<ul class="flex flex-col">
			{#each rename.people as person (person.id)}
				<li>
					<label class="flex min-h-8 items-center justify-between gap-3 pointer-coarse:min-h-11">
						<span class="min-w-0 truncate">{person.name}</span>
						<input
							type="checkbox"
							class="size-5 shrink-0"
							checked={!keep[person.id]}
							onchange={(e) => (keep = { ...keep, [person.id]: !e.currentTarget.checked })}
						/>
					</label>
				</li>
			{/each}
		</ul>
		<div class="flex flex-wrap gap-2 pointer-coarse:gap-3">
			<Button
				variant="primary"
				size="sm"
				class="pointer-coarse:min-h-11 pointer-coarse:min-w-11 pointer-coarse:px-4"
				disabled={disabled || renamed.length === 0}
				>{t('surnames.renameApply', { count: renamed.length })}</Button
			>
			<Button
				variant="ghost"
				size="sm"
				type="button"
				class="pointer-coarse:min-h-11 pointer-coarse:min-w-11 pointer-coarse:px-4"
				onclick={() => (rename = null)}
			>
				{t('surnames.no')}
			</Button>
		</div>
	</form>
{/if}
