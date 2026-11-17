<script lang="ts">
	import DateField from '$lib/components/ui/DateField.svelte';
	import Icon from '$lib/components/ui/Icon.svelte';
	import type { PartialDate } from '$lib/dates/partial-date';
	import { useI18n } from '$lib/i18n/context.svelte';
	import { whenPreview } from '$lib/when/labels';
	import { ageOn, knowsBirthYear, whenOutlook } from '$lib/when/resolve';
	import { WHEN_AGE_MAX, WHEN_AGE_MIN, WHEN_KINDS, type When, type WhenKind } from '$lib/when/when';
	import { WHEN_FIELDS } from '$lib/when/form';

	/*
	 * When a record is for (docs/dev/02 §2.25.8): *Now* by default, an age, a birthday, a day, or
	 * *Later* — chips, a stepper for the age, quick picks for Christmas, and one plain line saying
	 * what the choice comes to. An age needs a birth year; without one its chips stay shut and
	 * point at estimating it. Hidden fields carry the choice, read by `whenFromForm`.
	 */
	interface Props {
		/** The when kept so far; null or absent is *now*. */
		when?: When | null;
		birth: PartialDate | null;
		/** The household's day (`todayFor`). */
		today: string;
		/** Where the person's birth year can be estimated; absent, the hint has no link. */
		estimateHref?: string | null;
	}
	let { when = null, birth, today, estimateHref = null }: Props = $props();

	const i18n = useI18n();
	const t = i18n.t;
	const year = $derived(Number(today.slice(0, 4)));
	const ageKnown = $derived(knowsBirthYear(birth));

	// svelte-ignore state_referenced_locally
	let kind = $state<'now' | WhenKind>(when?.kind ?? 'now');
	// svelte-ignore state_referenced_locally
	let age = $state(
		when && 'age' in when ? when.age : Math.max(WHEN_AGE_MIN, (ageOn(birth, today) ?? 0) + 1)
	);
	// svelte-ignore state_referenced_locally
	let on = $state(when?.kind === 'on_date' ? when.on : christmasOf(year, today));
	// The day field seeds itself once; a quick pick re-seeds it.
	let picked = $state(0);

	function christmasOf(year: number, today: string): string {
		const thisYear = `${year}-12-24`;
		return today <= thisYear ? thisYear : `${year + 1}-12-24`;
	}
	const christmases = $derived(
		[`${year}-12-24`, `${year + 1}-12-24`].filter((day) => day >= today)
	);
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
		{#each ['now', ...WHEN_KINDS] as const as value (value)}
			<label class={CHIP}>
				<input
					type="radio"
					{value}
					bind:group={kind}
					disabled={isAge(value) && !ageKnown}
					class="sr-only"
				/>
				{t(`when.kind.${value}`)}
			</label>
		{/each}
	</div>

	{#if !ageKnown}
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
			{#each christmases as day (day)}
				<button
					type="button"
					class="rounded-full border border-border px-3 py-1 text-[0.8125rem] text-fg-muted hover:bg-primary-soft aria-pressed:border-primary aria-pressed:text-primary"
					aria-pressed={on === day}
					onclick={() => pick(day)}>{t('when.christmas', { year: day.slice(0, 4) })}</button
				>
			{/each}
		</div>
		{#key picked}
			<DateField name={WHEN_FIELDS.on} bind:value={on} label={t('when.day')} required />
		{/key}
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
