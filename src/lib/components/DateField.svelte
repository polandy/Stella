<script lang="ts">
	import { untrack } from 'svelte';
	import {
		isoToParts,
		monthNames,
		partsToIso,
		segmentOrder,
		type DateParts
	} from '$lib/dates/field';
	import { useI18n } from '$lib/i18n/context.svelte';

	/*
	 * A date field in the language Stella is being read in (docs/05 §5.7).
	 *
	 * It replaces `<input type="date">`, which takes its segment order, separators and month
	 * names from the *browser's* locale rather than the app's — so a German household on an
	 * English browser is asked for `mm/dd/yyyy` and offered an English calendar, and no
	 * attribute on the page can change that. Here the order comes from the app's own locale and
	 * the month is a named choice, which also ends the day/month ambiguity for good.
	 *
	 * Posts a single hidden field holding the ISO value, so it drops into an existing form
	 * action without changing what the server reads.
	 */

	interface Props {
		/** The form field the ISO value is posted under. */
		name: string;
		/** The stored value, `YYYY-MM-DD` or a year-less `--MM-DD`. */
		value?: string;
		/** Names the group for a screen reader; each segment is labelled on its own besides. */
		label: string;
		/** Let the year be left blank, for a birthday whose year nobody remembers (docs/03). */
		allowYearUnknown?: boolean;
		/** The latest day allowed, as an ISO day — for a date that cannot be in the future. */
		max?: string;
		required?: boolean;
		id?: string;
		class?: string;
	}
	let {
		name,
		value = '',
		label,
		allowYearUnknown = false,
		max,
		required = false,
		id,
		class: className = ''
	}: Props = $props();

	const i18n = useI18n();

	// Seeded once and then owned by whoever is typing: a later `value` must not overwrite
	// half-entered segments underneath them.
	let parts = $state<DateParts>(untrack(() => isoToParts(value)));
	let dayInput: HTMLInputElement | undefined = $state();

	const months = $derived(monthNames(i18n.intlLocale));
	const order = $derived(segmentOrder(i18n.intlLocale));
	const iso = $derived(partsToIso(parts));
	/** A year left blank is an answer in itself only where the caller allows it. */
	const yearAnswered = $derived(allowYearUnknown || parts.year.trim() !== '');
	const complete = $derived(parts.day !== '' && parts.month !== '' && yearAnswered);
	const problem = $derived.by(() => {
		// While a segment is still blank the browser's own `required` does the complaining.
		if (!complete) return null;
		if (iso === '') return i18n.t('components.dateField.noSuchDay');
		if (max !== undefined && !iso.startsWith('--') && iso > max) {
			return i18n.t('components.dateField.notInFuture');
		}
		return null;
	});

	/*
	 * The segments are separate controls, so the browser cannot see that together they make an
	 * impossible day. Hanging the verdict on the first one lets the form refuse to submit the
	 * way it would for any other invalid field, instead of quietly posting a blank.
	 */
	$effect(() => {
		dayInput?.setCustomValidity(problem ?? '');
	});
</script>

<fieldset class="min-w-0 {className}">
	<legend class="sr-only">{label}</legend>
	<input type="hidden" {name} value={iso} />

	<div class="flex items-end gap-1.5">
		{#each order as segment (segment)}
			{#if segment === 'month'}
				<select
					bind:value={parts.month}
					aria-label={i18n.t('components.dateField.month')}
					{required}
					class="min-w-0 rounded-control border border-border bg-bg px-2 py-2 text-sm text-fg"
				>
					<option value="">{i18n.t('components.dateField.monthEmpty')}</option>
					{#each months as monthName, index (monthName)}
						<option value={String(index + 1)}>{monthName}</option>
					{/each}
				</select>
			{:else if segment === 'day'}
				<input
					bind:this={dayInput}
					bind:value={parts.day}
					{id}
					type="text"
					inputmode="numeric"
					maxlength="2"
					autocomplete="off"
					{required}
					aria-label={i18n.t('components.dateField.day')}
					placeholder={i18n.t('components.dateField.dayPlaceholder')}
					class="w-12 rounded-control border border-border bg-bg px-2 py-2 text-sm text-fg placeholder:text-fg-subtle"
				/>
			{:else}
				<input
					bind:value={parts.year}
					type="text"
					inputmode="numeric"
					maxlength="4"
					autocomplete="off"
					required={required && !allowYearUnknown}
					aria-label={i18n.t('components.dateField.year')}
					placeholder={i18n.t('components.dateField.yearPlaceholder')}
					class="w-16 rounded-control border border-border bg-bg px-2 py-2 text-sm text-fg placeholder:text-fg-subtle"
				/>
			{/if}
		{/each}
	</div>

	{#if allowYearUnknown}
		<p class="mt-1 text-xs text-fg-subtle">{i18n.t('components.dateField.yearOptional')}</p>
	{/if}
	{#if problem}
		<p class="mt-1 text-xs text-danger" role="alert">{problem}</p>
	{/if}
</fieldset>
