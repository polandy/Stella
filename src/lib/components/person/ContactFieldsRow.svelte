<script lang="ts">
	import Button from '$lib/components/Button.svelte';
	import KeptChip from '$lib/components/KeptChip.svelte';
	import RemoveButton from '$lib/components/RemoveButton.svelte';
	import Section from '$lib/components/Section.svelte';
	import { enhance } from '$app/forms';
	import { isContactFieldKind } from '$lib/contact-fields/kinds';
	import { useI18n } from '$lib/i18n/context.svelte';
	import { hasMessage } from '$lib/i18n/translate';
	import { keepable } from '$lib/pwa/keepable';
	import { isKept, type KeptOf } from '$lib/pwa/outbox';
	import { outbox } from '$lib/pwa/outbox.svelte';
	import { useRemovals } from '$lib/undo/context.svelte';
	import { removalKey, type RemovalKind } from '$lib/undo/keys';
	import { savedEnhance } from '$lib/undo/saved';
	import { INPUT } from './inputs';
	import type { PersonForm, PersonPageData } from './types';

	// The profile's ways to reach someone (docs/02 §2.2): a row of the person page's profile card.
	let { data, form }: { data: PersonPageData; form: PersonForm } = $props();

	const i18n = useI18n();
	const t = i18n.t;
	const c = $derived(data.contact);

	/** A stored vocabulary value — a field or date kind — in the viewer's language. */
	const kindLabel = (group: 'fieldKind' | 'dateKind', kind: string): string => {
		const key = `contact.${group}.${kind}`;
		return hasMessage(key) ? t(key) : kind;
	};

	// A row on its way out (docs/02 §2.23) is gone from the list while its undo window is open,
	// and back in it the moment Undo is pressed. The counts follow, so a section never says two
	// tags over one chip.
	const removals = useRemovals();
	const shown = <T extends { id: string }>(kind: RemovalKind, rows: T[]) =>
		rows.filter((row) => !removals.isPending(removalKey(kind, row.id)));
	const visibleFields = $derived(shown('field', data.fields));

	// Saving through `enhance` keeps the page — and with it any open undo window — alive, so
	// each section closes itself here instead of on the reload a redirect used to cause.
	let openSection = $state({ contact: false });
	type SectionName = keyof typeof openSection;
	const saved = (name: SectionName) =>
		savedEnhance(removals, t('components.saved'), () => (openSection[name] = false));
	/** What a form saved through the outbox does once Stella took it: say so, then `close`. */
	const savedThen = (close: () => void) => () => {
		removals.notify(t('components.saved'));
		close();
	};
	/*
	 * Ways to reach someone and their dates, added while Stella was out of reach: kept on the
	 * device and shown as dashed chips above the real ones until they are sent (docs/02 §2.18).
	 */
	const keptFields = $derived(
		outbox.mine.filter(
			(item): item is KeptOf<'field.add'> =>
				isKept(item, 'field.add') && item.command.payload.contactId === c.id
		)
	);
	const fieldForm = $derived(
		keepable(
			{
				toCommand: (form, id) => {
					const kind = String(form.get('kind') ?? '');
					const value = String(form.get('value') ?? '').trim();
					if (!isContactFieldKind(kind) || !value) return null;
					return {
						id,
						type: 'field.add',
						payload: {
							contactId: c.id,
							kind,
							label: String(form.get('label') ?? '').trim() || null,
							value
						},
						issuedAt: Date.now()
					};
				},
				about: c.displayName,
				errorKey: 'fieldError',
				onApplied: savedThen(() => (openSection.contact = false)),
				onKept: () => (openSection.contact = false)
			},
			saved('contact')
		)
	);
</script>

<Section
	as="row"
	title={t('contact.section.contact')}
	count={visibleFields.length}
	startOpen={visibleFields.length > 0}
	addLabel={t('common.add')}
	error={form?.fieldError ?? null}
	bind:open={openSection.contact}
>
	{#if keptFields.length > 0}
		<ul class="mb-2 flex flex-wrap gap-1.5" data-testid="kept-fields">
			{#each keptFields as item (item.command.id)}
				<KeptChip
					{item}
					label={`${item.command.payload.label ?? kindLabel('fieldKind', item.command.payload.kind)} · ${item.command.payload.value}`}
				/>
			{/each}
		</ul>
	{/if}
	{#if visibleFields.length > 0}
		<dl class="grid grid-cols-[5rem_minmax(0,1fr)] gap-x-3 gap-y-1.5 text-sm">
			{#each visibleFields as f (f.id)}
				<dt class="truncate text-fg-subtle">{f.label ?? kindLabel('fieldKind', f.kind)}</dt>
				<dd class="flex min-w-0 items-center gap-2">
					{#if f.href}
						<a href={f.href} class="truncate text-link hover:underline">{f.value}</a>
					{:else}
						<span class="truncate text-fg">{f.value}</span>
					{/if}
					<RemoveButton
						kind="field"
						id={f.id}
						action="?/removeField"
						fields={{ fieldId: f.id }}
						label={t('contact.removeField', { what: f.label ?? kindLabel('fieldKind', f.kind) })}
						removed={t('contact.fieldRemoved')}
						class="ml-auto"
					/>
				</dd>
			{/each}
		</dl>
	{:else}
		<p class="text-sm text-fg-subtle">{t('contact.noFields')}</p>
	{/if}

	{#snippet editor()}
		<form
			method="POST"
			action="?/addField"
			use:enhance={fieldForm}
			class="flex flex-wrap items-end gap-2"
		>
			<select name="kind" aria-label={t('contact.kind')} class={INPUT}>
				{#each data.fieldKinds as kind (kind)}
					<option value={kind}>{kindLabel('fieldKind', kind)}</option>
				{/each}
			</select>
			<input
				name="label"
				placeholder={t('contact.labelOptional')}
				aria-label={t('contact.labelOptional')}
				class="w-28 {INPUT}"
			/>
			<input
				name="value"
				placeholder={t('contact.value')}
				aria-label={t('contact.value')}
				required
				class="min-w-40 flex-1 {INPUT}"
			/>
			<Button variant="primary" size="sm">{t('common.add')}</Button>
		</form>
	{/snippet}
</Section>
