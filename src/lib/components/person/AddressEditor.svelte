<script lang="ts">
	import Button from '$lib/components/ui/Button.svelte';
	import FormError from '$lib/components/ui/FormError.svelte';
	import KeptChip from '$lib/components/pwa/KeptChip.svelte';
	import RemoveButton from '$lib/components/ui/RemoveButton.svelte';
	import { enhance } from '$app/forms';
	import { useI18n } from '$lib/i18n/context.svelte';
	import { keepable } from '$lib/pwa/keepable';
	import { isKept, type KeptOf } from '$lib/pwa/outbox';
	import { outbox } from '$lib/pwa/outbox.svelte';
	import { reachability } from '$lib/pwa/reachability.svelte';
	import { useRemovals } from '$lib/undo/context.svelte';
	import { removalKey } from '$lib/undo/keys';
	import { savedEnhance } from '$lib/undo/saved';
	import { tick } from 'svelte';
	import FactEditor from './FactEditor.svelte';
	import { INPUT } from './inputs';
	import type { PersonForm, PersonPageData } from './types';

	/*
	 * Where someone lives, edited where it is read (docs/02 §2.2): each address on record as a
	 * label and the address itself, saved or removed in place, and a new one added here — the
	 * *Contact* row no longer holds addresses. Editing is not kept on the phone like adding
	 * (docs/02 §2.18), so Save waits for a connection; adding one is kept like any other field.
	 */
	let { data, form, onclose }: { data: PersonPageData; form: PersonForm; onclose: () => void } =
		$props();

	const i18n = useI18n();
	const t = i18n.t;
	const c = $derived(data.contact);
	const uid = $props.id();

	const removals = useRemovals();
	const addresses = $derived(
		data.fields.filter(
			(field) => field.kind === 'address' && !removals.isPending(removalKey('field', field.id))
		)
	);
	const keptAddresses = $derived(
		outbox.mine.filter(
			(item): item is KeptOf<'field.add'> =>
				isKept(item, 'field.add') &&
				item.command.payload.contactId === c.id &&
				item.command.payload.kind === 'address'
		)
	);
	const offline = $derived(!reachability.reachable);

	let adding = $state(false);
	const addOpen = $derived(adding || (addresses.length === 0 && keptAddresses.length === 0));
	let addForm = $state<HTMLFormElement>();
	async function startAdding() {
		adding = true;
		await tick();
		addForm?.querySelector<HTMLElement>('input:not([type=hidden])')?.focus();
	}

	const saved = savedEnhance(removals, t('components.saved'), () => onclose());
	const addForm$ = $derived(
		keepable(
			{
				toCommand: (formData, id) => {
					const value = String(formData.get('value') ?? '').trim();
					if (!value) return null;
					return {
						id,
						type: 'field.add',
						payload: {
							contactId: c.id,
							kind: 'address',
							label: String(formData.get('label') ?? '').trim() || null,
							value
						},
						issuedAt: Date.now()
					};
				},
				about: c.displayName,
				errorKey: 'fieldError',
				onApplied: () => {
					removals.notify(t('components.saved'));
					onclose();
				},
				// Kept on the device: the editor stays, showing it as a dashed chip until it is sent.
				onKept: () => (adding = false)
			},
			saved
		)
	);
</script>

<FactEditor icon="home" label={t('contact.fieldKind.address')} name="address" {onclose}>
	{#if keptAddresses.length > 0}
		<ul class="flex flex-wrap gap-1.5" data-testid="kept-addresses">
			{#each keptAddresses as item (item.command.id)}
				<KeptChip {item} label={item.command.payload.value} />
			{/each}
		</ul>
	{/if}
	{#each addresses as address (address.id)}
		<div class="flex flex-col gap-2" data-address={address.id}>
			<form
				id="{uid}-{address.id}"
				method="POST"
				action="?/editField"
				use:enhance={saved}
				class="flex flex-col gap-2"
			>
				<input type="hidden" name="fieldId" value={address.id} />
				<input
					name="label"
					value={address.label ?? ''}
					placeholder={t('contact.labelOptional')}
					aria-label={t('contact.labelOptional')}
					class="max-w-56 {INPUT}"
				/>
				<textarea
					name="value"
					required
					rows="2"
					aria-label={t('contact.fieldKind.address')}
					placeholder={t('contact.address.placeholder')}
					class={INPUT}>{address.value}</textarea
				>
			</form>
			<div class="flex flex-wrap items-center gap-2">
				<RemoveButton
					kind="field"
					id={address.id}
					action="?/removeField"
					fields={{ fieldId: address.id }}
					label={t('contact.address.remove')}
					removed={t('contact.address.removed')}
					class="mr-auto"
				/>
				<Button variant="primary" size="sm" form="{uid}-{address.id}" disabled={offline}>
					{t('common.save')}
				</Button>
			</div>
		</div>
	{/each}
	{#if offline && addresses.length > 0}
		<p class="text-xs text-fg-muted">{t('surnames.offline')}</p>
	{/if}

	{#if addOpen}
		<form
			bind:this={addForm}
			method="POST"
			action="?/addField"
			use:enhance={addForm$}
			class="flex flex-col gap-2"
			data-testid="add-address"
		>
			<input type="hidden" name="kind" value="address" />
			<input
				name="label"
				placeholder={t('contact.labelOptional')}
				aria-label={t('contact.labelOptional')}
				class="max-w-56 {INPUT}"
			/>
			<textarea
				name="value"
				required
				rows="2"
				aria-label={t('contact.fieldKind.address')}
				placeholder={t('contact.address.placeholder')}
				class={INPUT}></textarea>
			<div class="flex flex-wrap items-center justify-end gap-2">
				<Button variant="ghost" size="sm" type="button" onclick={onclose}>
					{t('common.cancel')}
				</Button>
				<Button variant="primary" size="sm">{t('common.add')}</Button>
			</div>
		</form>
	{:else}
		<div class="flex flex-wrap items-center gap-2">
			<Button variant="ghost" size="sm" icon="add" type="button" onclick={startAdding}>
				{t('contact.address.another')}
			</Button>
			<Button variant="ghost" size="sm" type="button" class="ml-auto" onclick={onclose}>
				{t('common.cancel')}
			</Button>
		</div>
	{/if}
	<FormError message={form?.fieldError} variant="inline" />
</FactEditor>
