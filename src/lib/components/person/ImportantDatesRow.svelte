<script lang="ts">
	import Button from '$lib/components/Button.svelte';
	import DateField from '$lib/components/DateField.svelte';
	import KeptChip from '$lib/components/KeptChip.svelte';
	import RemoveButton from '$lib/components/RemoveButton.svelte';
	import Section from '$lib/components/Section.svelte';
	import { enhance } from '$app/forms';
	import { isImportantDateKind } from '$lib/dates/kinds';
	import { dayLabel } from '$lib/dates/labels';
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

	// The profile's dates (docs/02 §2.13): a row of the person page's profile card.
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
	const visibleDates = $derived(shown('date', data.dates));

	/** A birthday from the profile counts: the row holds something even with no date rows. */
	const hasDates = $derived(
		visibleDates.length > 0 || data.derivedBirthday !== null || data.estimatedBirthYear !== null
	);

	// Saving through `enhance` keeps the page — and with it any open undo window — alive, so
	// each section closes itself here instead of on the reload a redirect used to cause.
	let openSection = $state({ dates: false });
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
	const keptDates = $derived(
		outbox.mine.filter(
			(item): item is KeptOf<'date.add'> => isKept(item, 'date.add') && item.command.payload.contactId === c.id
		)
	);
	const dateForm = $derived(
		keepable(
			{
				toCommand: (form, id) => {
					const kind = String(form.get('kind') ?? '');
					// The date field posts `--MM-DD` itself when the year was left blank (§2.13).
					const date = String(form.get('date') ?? '').trim();
					if (!isImportantDateKind(kind) || !date) return null;
					return {
						id,
						type: 'date.add',
						payload: {
							contactId: c.id,
							kind,
							label: String(form.get('label') ?? '').trim() || null,
							date,
							recursYearly: form.get('recursYearly') !== null,
							remind: form.get('remind') !== null
						},
						issuedAt: Date.now()
					};
				},
				about: c.displayName,
				errorKey: 'dateError',
				onApplied: savedThen(() => (openSection.dates = false)),
				onKept: () => (openSection.dates = false)
			},
			saved('dates')
		)
	);
</script>

	<Section as="row" title={t('contact.section.dates')} count={visibleDates.length} startOpen={hasDates} addLabel={t('common.add')} error={form?.dateError ?? null} bind:open={openSection.dates}>
	{#if keptDates.length > 0}
		<ul class="mb-2 flex flex-wrap gap-1.5" data-testid="kept-dates">
			{#each keptDates as item (item.command.id)}
				<KeptChip {item} label={`${item.command.payload.label ?? kindLabel('dateKind', item.command.payload.kind)} · ${dayLabel(i18n, item.command.payload.date)}`} />
			{/each}
		</ul>
	{/if}
	{#if data.derivedBirthday || data.estimatedBirthYear || visibleDates.length > 0}
		<ul class="flex flex-col gap-1.5 text-sm">
			{#if data.estimatedBirthYear}
				<li class="flex items-center gap-3">
					<span class="w-20 shrink-0 text-fg-subtle">{t('contact.born')}</span>
					<span class="flex-1 truncate text-fg">
						{t('contact.around', { year: data.estimatedBirthYear })}
					</span>
					<span class="text-xs text-fg-subtle">{t('contact.estimated')}</span>
				</li>
			{/if}
			{#if data.derivedBirthday}
				<li class="flex items-center gap-3">
					<span class="w-20 shrink-0 text-fg-subtle">{t('contact.birthday')}</span>
					<span class="flex-1 truncate text-fg">{dayLabel(i18n, data.derivedBirthday)}</span>
					<span class="text-xs text-fg-subtle">{t('contact.fromProfile')}</span>
				</li>
			{/if}
			{#each visibleDates as d (d.id)}
				<li class="flex items-center gap-3">
					<span class="w-20 shrink-0 truncate text-fg-subtle">
						{d.label ?? kindLabel('dateKind', d.kind)}
					</span>
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
						label={t('contact.removeDate', { what: d.label ?? kindLabel('dateKind', d.kind) })}
						removed={t('contact.dateRemoved')}
					/>
				</li>
			{/each}
		</ul>
	{:else}
		<p class="text-sm text-fg-subtle">{t('contact.noDates')}</p>
	{/if}

	{#snippet editor()}
		<form method="POST" action="?/addDate" use:enhance={dateForm} class="flex flex-wrap items-end gap-2">
			<select name="kind" aria-label={t('contact.kind')} class={INPUT}>
				{#each data.dateKinds as kind (kind)}
					<option value={kind}>{kindLabel('dateKind', kind)}</option>
				{/each}
			</select>
			<DateField name="date" required allowYearUnknown label={t('contact.day')} />
			<input name="label" placeholder={t('contact.dateNameForCustom')} aria-label={t('contact.dateNameForCustom')} class="w-full {INPUT}" />
			<label class="flex items-center gap-1.5 text-sm text-fg-muted">
				<input type="checkbox" name="recursYearly" checked /> {t('contact.everyYear')}
			</label>
			<label class="flex items-center gap-1.5 text-sm text-fg-muted">
				<input type="checkbox" name="remind" checked /> {t('contact.showOnHome')}
			</label>
			<Button variant="primary" size="sm" class="ml-auto">{t('common.add')}</Button>
		</form>
	{/snippet}
</Section>
