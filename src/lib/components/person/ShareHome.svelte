<script lang="ts">
	import Button from '$lib/components/ui/Button.svelte';
	import Icon from '$lib/components/ui/Icon.svelte';
	import PersonSearchSelect from '$lib/components/people/PersonSearchSelect.svelte';
	import { enhance } from '$app/forms';
	import { useI18n } from '$lib/i18n/context.svelte';
	import { oneLine, sharingCandidates } from '$lib/people/home';
	import type { SubmitFunction } from '@sveltejs/kit';
	import type { Snippet } from 'svelte';
	import type { PersonForm, PersonPageData } from './types';

	/*
	 * *Also lives here …* inside one address's frame (docs/02 §2.2, *A shared home*): a dashed
	 * “+” after the people who live there already — spelled out while nobody does — opens the
	 * picker, family and partners first. Someone with an own address that differs is asked about
	 * once — kept as a second address unless *replace* is ticked.
	 */
	let {
		data,
		form,
		address,
		housemateIds,
		offline,
		onclose,
		children
	}: {
		data: PersonPageData;
		form: PersonForm;
		/** `field:<id>` or `home:<id>`: the address the people picked come to live at. */
		address: string;
		housemateIds: readonly string[];
		offline: boolean;
		onclose: () => void;
		/** The chips of the people living here already; the “+” follows them. */
		children?: Snippet;
	} = $props();

	const t = useI18n().t;
	const uid = $props.id();

	let open = $state(false);
	let withIds = $state<string[]>([]);

	const candidates = $derived(
		sharingCandidates(
			data.people.filter((person) => person.id !== data.contact.id),
			data.relationships,
			housemateIds
		)
	);
	// Several addresses each carry a “+”: only the one that was sent asks.
	const decide = $derived(
		form && 'homeDecide' in form && form.homeDecide?.address === address ? form.homeDecide : null
	);
	const nameOf = (id: string) => data.people.find((person) => person.id === id)?.displayName ?? '';

	const share: SubmitFunction = () => {
		return async ({ result, update }) => {
			await update({ reset: false });
			if (result.type === 'redirect') onclose();
		};
	};
</script>

{#if children || !(open || decide)}
	<ul class="flex flex-wrap items-center gap-1.5" aria-label={t('contact.home.who')}>
		{@render children?.()}
		{#if !(open || decide)}
			<li>
				<button
					type="button"
					class="inline-flex min-h-7 items-center gap-1 rounded-full border border-dashed border-border px-2 py-0.5 text-sm text-fg-muted transition-colors hover:bg-card-hover"
					aria-label={t('contact.home.shareWith')}
					title={t('contact.home.shareWith')}
					data-testid="share-open"
					onclick={() => (open = true)}
				>
					<Icon name="add" size={13} />{#if !children}{t('contact.home.shareWith')}{/if}
				</button>
			</li>
		{/if}
	</ul>
{/if}

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
		class="flex flex-col gap-2 rounded-app bg-bg-sunken p-3"
		data-testid="share-home"
	>
		<input type="hidden" name="address" value={address} />
		<label for="{uid}-who" class="text-xs text-fg-muted">{t('contact.home.who')}</label>
		<PersonSearchSelect
			id="{uid}-who"
			people={candidates}
			name="withIds"
			bind:selectedIds={withIds}
			multiple
		/>
		<div class="flex items-center gap-2">
			<Button variant="ghost" size="sm" type="button" onclick={() => (open = false)}>
				{t('common.cancel')}
			</Button>
			<Button
				variant="primary"
				size="sm"
				class="ml-auto"
				disabled={offline || withIds.length === 0}
			>
				{t('contact.home.share')}
			</Button>
		</div>
	</form>
{/if}
