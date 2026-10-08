<script lang="ts">
	import Button from '$lib/components/ui/Button.svelte';
	import DateField from '$lib/components/ui/DateField.svelte';
	import FormError from '$lib/components/ui/FormError.svelte';
	import KeptChip from '$lib/components/pwa/KeptChip.svelte';
	import RemoveButton from '$lib/components/ui/RemoveButton.svelte';
	import { enhance } from '$app/forms';
	import { isImportantDateKind } from '$lib/dates/kinds';
	import { dayLabel } from '$lib/dates/labels';
	import { useI18n } from '$lib/i18n/context.svelte';
	import { hasMessage } from '$lib/i18n/translate';
	import { keepable } from '$lib/pwa/keepable';
	import { isKept, type KeptOf } from '$lib/pwa/outbox';
	import { outbox } from '$lib/pwa/outbox.svelte';
	import { useRemovals } from '$lib/undo/context.svelte';
	import { removalKey } from '$lib/undo/keys';
	import { savedEnhance } from '$lib/undo/saved';
	import { tick } from 'svelte';
	import FactEditor from './FactEditor.svelte';
	import { INPUT } from './inputs';
	import type { PersonForm, PersonPageData } from './types';

	/*
	 * Every date of a person in one editor (docs/02 §2.13), opened from any of the identity
	 * card's date facts: the birthday — the profile's included — and the rest, each with what
	 * sets it apart (once, kept off Home) and a way to remove it, then *Add a date*. Opened on a
	 * person with no dates, it starts on the form.
	 */
	let { data, form, onclose }: { data: PersonPageData; form: PersonForm; onclose: () => void } =
		$props();

	const i18n = useI18n();
	const t = i18n.t;
	const c = $derived(data.contact);

	/** A stored vocabulary value in the viewer's language. */
	const kindLabel = (kind: string): string => {
		const key = `contact.dateKind.${kind}`;
		return hasMessage(key) ? t(key) : kind;
	};

	// A date on its way out (docs/02 §2.23) is gone from the list while its undo window is open.
	const removals = useRemovals();
	const visibleDates = $derived(
		data.dates.filter((date) => !removals.isPending(removalKey('date', date.id)))
	);
	/*
	 * Dates added while Stella was out of reach: kept on the device and shown as dashed chips
	 * above the real ones until they are sent (docs/02 §2.18).
	 */
	const keptDates = $derived(
		outbox.mine.filter(
			(item): item is KeptOf<'date.add'> =>
				isKept(item, 'date.add') && item.command.payload.contactId === c.id
		)
	);
	const holdsAny = $derived(
		visibleDates.length > 0 ||
			keptDates.length > 0 ||
			data.derivedBirthday !== null ||
			data.estimatedBirthYear !== null
	);

	/** The add form: open from the start when there is nothing to list, or after a refusal. */
	let adding = $state(false);
	const addOpen = $derived(adding || !holdsAny || (form?.dateError ?? null) !== null);

	let addForm = $state<HTMLFormElement>();
	async function startAdding() {
		adding = true;
		await tick();
		addForm?.querySelector<HTMLElement>('select')?.focus();
	}

	const saved = savedEnhance(removals, t('components.saved'), () => (adding = false));
	const dateForm = $derived(
		keepable(
			{
				toCommand: (formData, id) => {
					const kind = String(formData.get('kind') ?? '');
					// The date field posts `--MM-DD` itself when the year was left blank (§2.13).
					const date = String(formData.get('date') ?? '').trim();
					if (!isImportantDateKind(kind) || !date) return null;
					return {
						id,
						type: 'date.add',
						payload: {
							contactId: c.id,
							kind,
							label: String(formData.get('label') ?? '').trim() || null,
							date,
							recursYearly: formData.get('recursYearly') !== null,
							remind: formData.get('remind') !== null
						},
						issuedAt: Date.now()
					};
				},
				about: c.displayName,
				errorKey: 'dateError',
				onApplied: () => {
					removals.notify(t('components.saved'));
					adding = false;
				},
				onKept: () => (adding = false)
			},
			saved
		)
	);
</script>

<FactEditor icon="calendar" label={t('contact.section.dates')} name="dates" {onclose}>
	{#if keptDates.length > 0}
		<ul class="flex flex-wrap gap-1.5" data-testid="kept-dates">
			{#each keptDates as item (item.command.id)}
				<KeptChip
					{item}
					label={`${item.command.payload.label ?? kindLabel(item.command.payload.kind)} · ${dayLabel(i18n, item.command.payload.date)}`}
				/>
			{/each}
		</ul>
	{/if}
	{#if data.derivedBirthday || data.estimatedBirthYear || visibleDates.length > 0}
		<ul class="flex flex-col gap-1.5 text-sm" data-testid="dates-list">
			{#if data.estimatedBirthYear}
				<li class="flex items-center gap-3">
					<span class="w-24 shrink-0 text-fg-subtle">{t('contact.facts.born')}</span>
					<span class="flex-1 truncate text-fg">
						{t('contact.around', { year: data.estimatedBirthYear })}
					</span>
					<span class="text-xs text-fg-subtle">{t('contact.estimated')}</span>
				</li>
			{/if}
			{#if data.derivedBirthday}
				<li class="flex items-center gap-3">
					<span class="w-24 shrink-0 text-fg-subtle">{t('contact.facts.birthday')}</span>
					<span class="flex-1 truncate text-fg">{dayLabel(i18n, data.derivedBirthday)}</span>
					<span class="text-xs text-fg-subtle">{t('contact.fromProfile')}</span>
				</li>
			{/if}
			{#each visibleDates as d (d.id)}
				<li class="flex items-center gap-3">
					<span class="w-24 shrink-0 truncate text-fg-subtle">{d.label ?? kindLabel(d.kind)}</span>
					<span class="flex-1 truncate text-fg">{dayLabel(i18n, d.date)}</span>
					{#if !d.recursYearly}<span class="text-xs text-fg-subtle">{t('contact.once')}</span>{/if}
					{#if !d.remind}
						<span class="text-xs text-fg-subtle" title={t('contact.mutedHint')}>
							{t('contact.muted')}
						</span>
					{/if}
					<RemoveButton
						kind="date"
						id={d.id}
						action="?/removeDate"
						fields={{ dateId: d.id }}
						label={t('contact.removeDate', { what: d.label ?? kindLabel(d.kind) })}
						removed={t('contact.dateRemoved')}
					/>
				</li>
			{/each}
		</ul>
	{/if}

	{#if addOpen}
		<!-- One column with one left and one right edge: the checkboxes share a line with the
		     button that saves them. -->
		<form
			bind:this={addForm}
			method="POST"
			action="?/addDate"
			use:enhance={dateForm}
			class="grid gap-2"
			data-testid="add-date"
		>
			{#if holdsAny}
				<span class="text-xs font-medium text-fg-muted">{t('contact.dates.another')}</span>
			{/if}
			<select data-autofocus name="kind" aria-label={t('contact.kind')} class="w-full {INPUT}">
				{#each data.dateKinds as kind (kind)}
					<option value={kind}>{kindLabel(kind)}</option>
				{/each}
			</select>
			<DateField name="date" required allowYearUnknown stretch label={t('contact.day')} />
			<input
				name="label"
				placeholder={t('contact.dateNameForCustom')}
				aria-label={t('contact.dateNameForCustom')}
				class="w-full {INPUT}"
			/>
			<FormError message={form?.dateError} variant="inline" />
			<div class="flex flex-wrap items-center gap-x-4 gap-y-2">
				<label class="flex items-center gap-1.5 text-sm text-fg-muted">
					<input type="checkbox" name="recursYearly" checked />
					{t('contact.everyYear')}
				</label>
				<label class="flex items-center gap-1.5 text-sm text-fg-muted">
					<input type="checkbox" name="remind" checked />
					{t('contact.showOnHome')}
				</label>
				<span class="ml-auto flex gap-2">
					<Button variant="ghost" size="sm" type="button" onclick={onclose}>
						{t('common.cancel')}
					</Button>
					<Button variant="primary" size="sm">{t('common.add')}</Button>
				</span>
			</div>
		</form>
	{:else}
		<div class="flex flex-wrap items-center gap-2">
			<Button
				variant="ghost"
				size="sm"
				icon="add"
				type="button"
				onclick={startAdding}
				data-autofocus
			>
				{t('contact.dates.add')}
			</Button>
			<Button variant="primary" size="sm" type="button" class="ml-auto" onclick={onclose}>
				{t('common.done')}
			</Button>
		</div>
	{/if}
</FactEditor>
