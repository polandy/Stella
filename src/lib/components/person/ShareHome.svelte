<script lang="ts">
	import Button from '$lib/components/ui/Button.svelte';
	import PersonSearchSelect from '$lib/components/people/PersonSearchSelect.svelte';
	import { enhance } from '$app/forms';
	import { useI18n } from '$lib/i18n/context.svelte';
	import { oneLine, sharingCandidates, type ShareableAddress } from '$lib/people/home';
	import type { SubmitFunction } from '@sveltejs/kit';
	import { INPUT } from './inputs';
	import type { PersonForm, PersonPageData } from './types';

	/*
	 * *Share with …* (docs/02 §2.2, *A shared home*): the people picked come to live at one of
	 * this person's addresses, family and partners offered first. Someone with an own address
	 * that differs is asked about once — kept as a second address unless *replace* is ticked.
	 */
	let {
		data,
		form,
		addresses,
		housemateIds,
		offline,
		onclose
	}: {
		data: PersonPageData;
		form: PersonForm;
		addresses: readonly ShareableAddress[];
		housemateIds: readonly string[];
		offline: boolean;
		onclose: () => void;
	} = $props();

	const t = useI18n().t;
	const uid = $props.id();

	let open = $state(false);
	// The first address is the one most people share; the choice is the person's from there.
	// svelte-ignore state_referenced_locally
	let address = $state(addresses[0]?.key ?? '');
	let withIds = $state<string[]>([]);

	const candidates = $derived(
		sharingCandidates(
			data.people.filter((person) => person.id !== data.contact.id),
			data.relationships,
			housemateIds
		)
	);
	const decide = $derived(form && 'homeDecide' in form ? form.homeDecide : null);
	const nameOf = (id: string) => data.people.find((person) => person.id === id)?.displayName ?? '';

	const share: SubmitFunction = () => {
		return async ({ result, update }) => {
			await update({ reset: false });
			if (result.type === 'redirect') onclose();
		};
	};
</script>

{#if decide}
	<form
		method="POST"
		action="?/shareAddress"
		use:enhance={share}
		class="flex flex-col gap-2 rounded-app bg-bg-sunken p-3 text-sm"
		data-testid="share-decide"
	>
		<input type="hidden" name="address" value={address} />
		<input type="hidden" name="decided" value="" />
		{#each decide.withIds as id (id)}
			<input type="hidden" name="withIds" value={id} />
		{/each}
		<p>{t('contact.home.decide')}</p>
		{#each decide.addresses as own (own.id)}
			<label class="flex items-start gap-2">
				<input type="checkbox" name="replace" value={own.id} class="mt-1" />
				<span>
					{t('contact.home.has', { name: nameOf(own.contactId), line: oneLine(own.value) })}
					<span class="block text-xs text-fg-muted">{t('contact.home.replaceOwn')}</span>
				</span>
			</label>
		{/each}
		<p class="text-xs text-fg-muted">{t('contact.home.keepsOwn')}</p>
		<div class="flex justify-end">
			<Button variant="primary" size="sm" disabled={offline}>{t('contact.home.share')}</Button>
		</div>
	</form>
{:else if open}
	<form
		method="POST"
		action="?/shareAddress"
		use:enhance={share}
		class="flex flex-col gap-2"
		data-testid="share-home"
	>
		{#if addresses.length > 1}
			<label class="flex flex-col gap-1 text-sm">
				<span class="text-xs text-fg-muted">{t('contact.home.which')}</span>
				<select name="address" bind:value={address} class={INPUT}>
					{#each addresses as choice (choice.key)}
						<option value={choice.key}
							>{choice.label ? `${choice.label}: ` : ''}{choice.line}</option
						>
					{/each}
				</select>
			</label>
		{:else}
			<input type="hidden" name="address" value={address} />
		{/if}
		<label for="{uid}-who" class="text-xs text-fg-muted">{t('contact.home.who')}</label>
		<PersonSearchSelect
			id="{uid}-who"
			people={candidates}
			name="withIds"
			bind:selectedIds={withIds}
			multiple
		/>
		<div class="flex justify-end">
			<Button variant="primary" size="sm" disabled={offline || withIds.length === 0}>
				{t('contact.home.share')}
			</Button>
		</div>
	</form>
{:else if addresses.length > 0}
	<Button variant="ghost" size="sm" icon="shared" type="button" onclick={() => (open = true)}>
		{t('contact.home.shareWith')}
	</Button>
{/if}
