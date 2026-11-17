<script lang="ts">
	import DateField from '$lib/components/ui/DateField.svelte';
	import { INPUT } from '$lib/components/person/inputs';
	import Icon from '$lib/components/ui/Icon.svelte';
	import type { PartialDate } from '$lib/dates/partial-date';
	import { useI18n } from '$lib/i18n/context.svelte';
	import { ageOn, knowsBirthYear, whenOutlook } from '$lib/when/resolve';
	import { monthLabel, whenPreview } from '$lib/when/labels';
	import { quickDays, type QuickPick } from '$lib/when/quick-picks';
	import { WHEN_AGE_MAX, WHEN_AGE_MIN, type When, type WhenKind } from '$lib/when/when';
	import { WHEN_FIELDS } from '$lib/when/form';
	import { shiftMonth } from '$lib/dates/month';
	import { dayLabel } from '$lib/dates/labels';

	// When a record is for (docs/dev/02 §2.25.8); hidden fields carry it to `whenFromForm`.
	interface Props {
		/** The when kept so far; null or absent is *now*. */
		when?: When | null;
		birth: PartialDate | null;
		/** The household's day (`todayFor`). */
		today: string;
		/** Where the person's birth year can be estimated; absent, the hint has no link. */
		estimateHref?: string | null;
		/** The whens this record type offers, after *now*. */
		kinds: readonly WhenKind[];
		/** What *now* is called: a gift idea's *Now*, an outing's *Some time*. */
		nowLabel?: 'now' | 'anytime';
		/** The days offered at one tap beside the day field. */
		picks?: readonly QuickPick[];
	}
	let {
		when = null,
		birth,
		today,
		estimateHref = null,
		kinds,
		nowLabel = 'now',
		picks = ['christmas']
	}: Props = $props();

	const i18n = useI18n();
	const t = i18n.t;
	const ageKnown = $derived(knowsBirthYear(birth));

	// svelte-ignore state_referenced_locally
	let kind = $state<'now' | WhenKind>(when?.kind ?? 'now');
	// svelte-ignore state_referenced_locally
	let age = $state(
		when && 'age' in when ? when.age : Math.max(WHEN_AGE_MIN, (ageOn(birth, today) ?? 0) + 1)
	);
	const quick = $derived(quickDays(picks, birth, today));
	// svelte-ignore state_referenced_locally
	let on = $state(when?.kind === 'on_date' ? when.on : (quickDays(picks, birth, today)[0]?.on ?? today));
	const thisMonth = $derived(today.slice(0, 7));
	// svelte-ignore state_referenced_locally
	let month = $state(when?.kind === 'in_month' ? when.on : shiftMonth(today.slice(0, 7), 1));
	/** The months a select offers: this one and the next two years, and a kept one gone by. */
	const MONTHS_AHEAD = 24;
	const months = $derived.by(() => {
		const ahead = Array.from({ length: MONTHS_AHEAD }, (_, i) => shiftMonth(thisMonth, i));
		return month < thisMonth ? [month, ...ahead] : ahead;
	});
	// The day field seeds itself once; a quick pick re-seeds it.
	let picked = $state(0);

	function pickLabel(pick: QuickPick, day: string): string {
		switch (pick) {
			case 'christmas':
				return t('when.christmas', { year: day.slice(0, 4) });
			case 'saturday':
				return t('when.saturday');
			case 'birthday':
				return t('when.birthday');
		}
	}
	function pick(day: string) {
		on = day;
		picked += 1;
	}

	const chosen = $derived<When | null>(
		kind === 'now'
			? null
			: kind === 'later'
				? { kind }
				: kind === 'on_date'
					? { kind, on }
					: kind === 'in_month'
						? { kind, on: month }
						: { kind, age }
	);
	const outlook = $derived(whenOutlook(chosen, birth, today));
	const problem = $derived(!['now', 'later', 'ageReached', 'due'].includes(outlook.kind));
	const previewId = $props.id();

	const CHIP =
		'cursor-pointer rounded-full border border-border bg-bg px-3 py-1 text-[0.8125rem] text-fg-muted transition-colors has-checked:border-primary has-checked:bg-primary-soft has-checked:font-medium has-checked:text-primary has-focus-visible:outline-2 has-focus-visible:outline-focus-ring has-disabled:cursor-not-allowed has-disabled:opacity-50';
	const STEP =
		'grid size-8 place-items-center rounded-full border border-border text-fg-muted hover:bg-primary-soft disabled:opacity-40';
	const isAge = (k: string) => k === 'from_age' || k === 'at_age';
</script>

<fieldset class="flex flex-col gap-1.5" aria-describedby={previewId} data-testid="when-picker">
	<legend class="mb-1.5 text-xs font-medium text-fg-muted">{t('when.label')}</legend>
	<input type="hidden" name={WHEN_FIELDS.kind} value={kind} />
	{#if isAge(kind)}<input type="hidden" name={WHEN_FIELDS.age} value={age} />{/if}
	<div class="flex flex-wrap gap-1.5">
		{#each ['now', ...kinds] as const as value (value)}
			<label class={CHIP}>
				<input
					type="radio"
					{value}
					bind:group={kind}
					disabled={isAge(value) && !ageKnown}
					class="sr-only"
				/>
				{t(value === 'now' ? `when.kind.${nowLabel}` : `when.kind.${value}`)}
			</label>
		{/each}
	</div>

	{#if !ageKnown && kinds.some(isAge)}
		<p class="text-xs text-fg-muted">
			{t('when.needsYear')}
			{#if estimateHref}
				<a href={estimateHref} class="text-link hover:underline" data-testid="when-estimate"
					>{t('when.estimate')}</a
				>
			{/if}
		</p>
	{/if}

	{#if isAge(kind)}
		<div class="flex items-center gap-2" role="group" aria-label={t('when.age')}>
			<button
				type="button"
				class={STEP}
				aria-label={t('when.younger')}
				disabled={age <= WHEN_AGE_MIN}
				onclick={() => (age -= 1)}><Icon name="subtract" size={14} /></button
			>
			<span
				class="min-w-8 text-center text-sm font-medium text-fg tabular-nums"
				data-testid="when-age">{age}</span
			>
			<button
				type="button"
				class={STEP}
				aria-label={t('when.older')}
				disabled={age >= WHEN_AGE_MAX}
				onclick={() => (age += 1)}><Icon name="add" size={14} /></button
			>
		</div>
	{:else if kind === 'on_date'}
		<div class="flex flex-wrap gap-1.5">
			{#each quick as { pick: which, on: day } (day + which)}
				<button
					type="button"
					class="rounded-full border border-border px-3 py-1 text-[0.8125rem] text-fg-muted hover:bg-primary-soft aria-pressed:border-primary aria-pressed:text-primary"
					aria-pressed={on === day}
					title={dayLabel(i18n, day)}
					data-testid="when-pick-{which}"
					onclick={() => pick(day)}>{pickLabel(which, day)}</button
				>
			{/each}
		</div>
		{#key picked}
			<DateField name={WHEN_FIELDS.on} bind:value={on} label={t('when.day')} required />
		{/key}
	{:else if kind === 'in_month'}
		<label class="flex flex-col gap-1 text-xs font-medium text-fg-muted">
			{t('when.month')}
			<select
				name={WHEN_FIELDS.on}
				bind:value={month}
				class={INPUT}
				data-testid="when-month"
			>
				{#each months as value (value)}
					<option {value}>{monthLabel(i18n, value)}</option>
				{/each}
			</select>
		</label>
	{/if}

	<p
		id={previewId}
		aria-live="polite"
		class="text-xs {problem ? 'text-danger' : 'text-fg-muted'}"
		data-testid="when-preview"
	>
		{whenPreview(i18n, outlook)}
	</p>
</fieldset>
