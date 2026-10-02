<script lang="ts">
	import { enhance } from '$app/forms';
	import Button from '$lib/components/Button.svelte';
	import { useI18n } from '$lib/i18n/context.svelte';
	import { reachability } from '$lib/pwa/reachability.svelte';
	import { useHeldNames } from '$lib/surnames/held-names.svelte';
	import { passOnOffer } from '$lib/surnames/pass-on';
	import NamePartsEditor from './NamePartsEditor.svelte';
	import type { PersonForm, PersonPageData } from './types';

	/*
	 * Under the shown name (docs/02 §2.2, docs/concepts/surnames.md §3.3, §3.4): *Name parts*,
	 * *Add last name* and Stella's proposal as a chip (*Brunner?*), which a tap gives with the
	 * usual undo. When the name parts give someone their first last name, their children and
	 * siblings who still have none are offered it right here; a chip's own toast offers it
	 * instead.
	 */
	let { data, form }: { data: PersonPageData; form: PersonForm } = $props();

	const i18n = useI18n();
	const t = i18n.t;
	const c = $derived(data.contact);
	const names = useHeldNames(() => data.lastNameHelp.passOn);
	const held = names.submit();
	const disabled = $derived(!reachability.reachable);

	/** Which field the name-parts editor opens on, or null while it is closed. */
	let focus = $state<'firstName' | 'lastName' | null>(null);
	const open = $derived(focus !== null || Boolean(form?.namePartsError));

	/*
	 * A first last name given through the fields: seen as the blank turning into a name once the
	 * page has reloaded. A chip's batch is left out — its toast has offered the name on already.
	 */
	// svelte-ignore state_referenced_locally
	let before = c.lastName;
	let passOn = $state<{ lastName: string; people: { id: string; name: string }[] } | null>(null);
	$effect(() => {
		const now = c.lastName;
		if (!before && now && !names.hidden.has(c.id)) {
			const people = passOnOffer(data.lastNameHelp.passOn, [c.id], now, new Set());
			passOn = people.length ? { lastName: now, people } : null;
		}
		before = now;
	});
	const listOf = (people: { name: string }[]) =>
		new Intl.ListFormat(i18n.intlLocale, { type: 'conjunction' }).format(people.map((p) => p.name));
</script>

{#if open}
	<NamePartsEditor
		name={c}
		shownNameChosen={data.shownNameChosen}
		focus={focus ?? 'firstName'}
		error={form?.namePartsError ?? null}
		onclose={() => (focus = null)}
	/>
{:else}
	<div class="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
		{#if !c.lastName && !names.hidden.has(c.id)}
			{#each data.lastNameHelp.chips as chip (chip.name)}
				<form method="POST" action="?/setLastNames" use:enhance={held}>
					<input type="hidden" name="lastName" value={chip.name} />
					<input type="hidden" name="contactId" value={c.id} />
					<button
						class="min-h-8 rounded-full border border-border bg-bg px-2.5 font-medium text-fg hover:border-primary hover:text-primary disabled:opacity-50"
						title={chip.why}
						aria-label={t('surnames.chipHint', { name: chip.name })}
						{disabled}
						data-testid="last-name-chip"
					>
						{t('surnames.chip', { name: chip.name })}
					</button>
				</form>
			{/each}
			<button type="button" class="min-h-8 text-link hover:underline" onclick={() => (focus = 'lastName')}>
				{t('contact.nameParts.addLastName')}
			</button>
		{/if}
		<button type="button" class="min-h-8 text-fg-subtle hover:text-fg hover:underline" onclick={() => (focus = 'firstName')}>
			{t('contact.nameParts.open')}
		</button>
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
		class="mt-2 flex flex-wrap items-center gap-2 rounded-app bg-primary-soft px-3 py-2 text-sm text-fg"
		data-testid="pass-on"
	>
		<input type="hidden" name="lastName" value={passOn.lastName} />
		{#each passOn.people as person (person.id)}<input type="hidden" name="contactId" value={person.id} />{/each}
		<span class="min-w-0 flex-1">
			{t('surnames.passOnPrompt', { people: listOf(passOn.people), count: passOn.people.length, name: passOn.lastName })}
		</span>
		<Button variant="primary" size="sm" {disabled}>{t('surnames.toast.yes')}</Button>
		<Button variant="ghost" size="sm" type="button" onclick={() => (passOn = null)}>{t('surnames.no')}</Button>
	</form>
{/if}
