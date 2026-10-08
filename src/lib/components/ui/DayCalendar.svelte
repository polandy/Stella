<script lang="ts">
	import { tick, untrack } from 'svelte';
	import {
		addDays,
		firstDayOfWeek,
		inYear,
		monthGrid,
		monthName,
		monthOf,
		shiftMonth,
		weekdayNames,
		yearsBack
	} from '$lib/dates/month';
	import { useI18n } from '$lib/i18n/context.svelte';

	/*
	 * A month to pick a day from, in the language Stella is read in (docs/05 §5.7) — not the
	 * browser's calendar, which speaks the browser's language. Days after `max` cannot be
	 * picked. The arrow keys move a day or a week, Page Up/Down a month, Escape cancels.
	 */
	interface Props {
		/** The day shown as chosen, `YYYY-MM-DD`; its month opens first. */
		value: string;
		/** The latest day that can be picked. */
		max: string;
		onpick: (day: string) => void;
		oncancel: () => void;
	}
	let { value, max, onpick, oncancel }: Props = $props();

	const i18n = useI18n();

	// Seeded once from the chosen day, then moved by the reader.
	let focused = $state(untrack(() => value));
	let month = $state(untrack(() => monthOf(value)));
	let grid = $state<HTMLDivElement>();

	const weekStart = $derived(firstDayOfWeek(i18n.intlLocale));
	const weeks = $derived(monthGrid(month, weekStart));
	const lastMonth = $derived(monthOf(max));
	const years = $derived(yearsBack(max));
	const firstMonth = $derived(`${years[years.length - 1]}-01`);

	const longDay = (day: string) =>
		new Date(`${day}T00:00:00Z`).toLocaleDateString(i18n.intlLocale, {
			weekday: 'long',
			day: 'numeric',
			month: 'long',
			year: 'numeric',
			timeZone: 'UTC'
		});

	const KEY_STEPS: Record<string, number> = {
		ArrowLeft: -1,
		ArrowRight: 1,
		ArrowUp: -7,
		ArrowDown: 7
	};

	async function moveTo(day: string) {
		focused = day > max ? max : day < `${firstMonth}-01` ? `${firstMonth}-01` : day;
		month = monthOf(focused);
		await tick();
		grid?.querySelector<HTMLButtonElement>(`[data-day="${focused}"]`)?.focus();
	}

	function onKeydown(event: KeyboardEvent) {
		if (event.key === 'Escape') {
			event.preventDefault();
			oncancel();
			return;
		}
		const step = KEY_STEPS[event.key];
		const months = event.key === 'PageUp' ? -1 : event.key === 'PageDown' ? 1 : 0;
		if (step === undefined && months === 0) return;
		event.preventDefault();
		if (step !== undefined) void moveTo(addDays(focused, step));
		else {
			const target = `${shiftMonth(monthOf(focused), months)}${focused.slice(7)}`;
			// The 31st has no match in a shorter month: land on that month's last day.
			const inMonth = monthGrid(monthOf(target), weekStart)
				.flat()
				.filter((d) => d !== null);
			void moveTo(inMonth.includes(target) ? target : inMonth[inMonth.length - 1]);
		}
	}
</script>

<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<div
	role="group"
	aria-label={i18n.t('components.calendar.label')}
	onkeydown={onKeydown}
	class="w-72"
>
	<!-- Fixed columns, so the arrows stay put however long the month's name is. -->
	<div class="mb-1 grid grid-cols-[2rem_1fr_2rem] items-center gap-1">
		<button
			type="button"
			onclick={() => (month = shiftMonth(month, -1))}
			disabled={month <= firstMonth}
			aria-label={i18n.t('components.calendar.previous')}
			class="grid size-8 place-items-center rounded-control text-fg-muted hover:bg-primary-soft hover:text-fg disabled:opacity-30 disabled:hover:bg-transparent"
			>‹</button
		>
		<div class="flex items-center justify-center gap-1.5">
			<span class="text-sm font-semibold text-fg" aria-live="polite"
				>{monthName(month, i18n.intlLocale)}</span
			>
			<select
				value={Number(month.slice(0, 4))}
				onchange={(e) => (month = inYear(month, Number(e.currentTarget.value), lastMonth))}
				aria-label={i18n.t('components.dateField.year')}
				class="rounded-control border border-border-input bg-bg px-1.5 py-0.5 text-sm font-semibold text-fg tabular-nums"
			>
				{#each years as year (year)}
					<option value={year}>{year}</option>
				{/each}
			</select>
		</div>
		<button
			type="button"
			onclick={() => (month = shiftMonth(month, 1))}
			disabled={month >= lastMonth}
			aria-label={i18n.t('components.calendar.next')}
			class="grid size-8 place-items-center rounded-control text-fg-muted hover:bg-primary-soft hover:text-fg disabled:opacity-30 disabled:hover:bg-transparent"
			>›</button
		>
	</div>
	<div bind:this={grid} class="grid grid-cols-7 gap-0.5 text-center">
		{#each weekdayNames(i18n.intlLocale, weekStart) as name (name)}
			<span class="pb-1 text-[11px] font-medium text-fg-subtle" aria-hidden="true">{name}</span>
		{/each}
		{#each weeks as week, w (w)}
			{#each week as day, d (d)}
				{#if day === null}
					<span class="aspect-square" aria-hidden="true"></span>
				{:else}
					<button
						type="button"
						data-day={day}
						tabindex={day === focused ? 0 : -1}
						disabled={day > max}
						aria-label={longDay(day)}
						aria-pressed={day === value}
						onclick={() => onpick(day)}
						class="grid aspect-square place-items-center rounded-full text-sm text-fg tabular-nums hover:bg-primary-soft disabled:text-fg-subtle disabled:opacity-40 disabled:hover:bg-transparent aria-pressed:bg-primary aria-pressed:font-semibold aria-pressed:text-primary-fg"
						class:ring-1={day === max}
						class:ring-primary={day === max}>{Number(day.slice(8))}</button
					>
				{/if}
			{/each}
		{/each}
	</div>
</div>
