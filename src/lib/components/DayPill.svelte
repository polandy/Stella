<script lang="ts">
	import { tick } from 'svelte';
	import DayCalendar from '$lib/components/DayCalendar.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import MenuButton from '$lib/components/MenuButton.svelte';
	import { pickedDayLabel, recentDays } from '$lib/dates/recent';
	import { menuOpensUpward, menuShift } from '$lib/menu/menu';
	import { useI18n } from '$lib/i18n/context.svelte';

	/*
	 * The day of a moment, as one pill beside Shared and Photo (docs/02 §2.22.1, docs/05 §5.7).
	 * Almost every moment is from today, so the pill stays quiet until another day is picked;
	 * the last week is one tap away, and *Another day…* opens a calendar for any earlier one.
	 */
	interface Props {
		/** The form field the ISO day is posted under. */
		name: string;
		/** The day the pill starts on — a stored day when editing; `today` otherwise. */
		value: string;
		/** The viewer's local day: the default, and the latest day allowed. */
		today: string;
	}
	let { name, value, today }: Props = $props();

	const i18n = useI18n();

	// Null follows `today`, so a page kept open past midnight moves on with it.
	let chosen = $state<string | null>(null);
	const day = $derived(chosen ?? (value === today ? today : value));
	const offTheDefault = $derived(day !== today);

	let root = $state<HTMLDivElement>();
	let calendar = $state<HTMLDivElement>();
	let calendarOpen = $state(false);
	let upward = $state(false);
	let shift = $state(0);

	/** Room kept between the calendar and the edge of the screen, as for a menu. */
	const EDGE_MARGIN = 12;

	const pill = () => root?.querySelector<HTMLButtonElement>('[aria-haspopup]');

	async function openCalendar() {
		upward = false;
		shift = 0;
		calendarOpen = true;
		await tick();
		if (!root || !calendar) return;
		const view = window.visualViewport;
		const band = view
			? { top: view.offsetTop, bottom: view.offsetTop + view.height }
			: { top: 0, bottom: window.innerHeight };
		upward = menuOpensUpward(root.getBoundingClientRect(), calendar.offsetHeight, band, EDGE_MARGIN);
		shift = menuShift(
			calendar.getBoundingClientRect(),
			{ left: 0, right: document.documentElement.clientWidth },
			EDGE_MARGIN
		);
		calendar.querySelector<HTMLButtonElement>('[data-day][tabindex="0"]')?.focus();
	}

	function closeCalendar() {
		calendarOpen = false;
		pill()?.focus();
	}

	function onWindowPointerdown(event: PointerEvent) {
		if (calendarOpen && calendar && !calendar.contains(event.target as Node)) calendarOpen = false;
	}
</script>

<svelte:window onpointerdown={onWindowPointerdown} />

<div bind:this={root} class="relative">
	<input type="hidden" {name} value={day} />
	<MenuButton
		label={i18n.t('composer.dayOf', { day: pickedDayLabel(i18n, day, today) })}
		highlighted={offTheDefault}
	>
		{#snippet trigger()}
			<Icon name="calendar" size={13} />
			{pickedDayLabel(i18n, day, today)}
		{/snippet}
		{#snippet children({ close })}
			{#each recentDays(i18n, today) as recent (recent.day)}
				<button
					type="button"
					role="menuitemradio"
					aria-checked={recent.day === day}
					onclick={() => {
						chosen = recent.day;
						close();
					}}
					class="flex items-center justify-between gap-4 rounded-control px-2.5 py-1.5 text-left text-sm text-fg hover:bg-primary-soft focus-visible:bg-primary-soft aria-checked:font-semibold aria-checked:text-primary"
				>
					{recent.name}
					<span class="text-xs font-normal text-fg-subtle tabular-nums">{recent.date}</span>
				</button>
			{/each}
			<div class="my-1 border-t border-border-subtle" role="separator"></div>
			<button
				type="button"
				role="menuitem"
				onclick={() => {
					close();
					void openCalendar();
				}}
				class="rounded-control px-2.5 py-1.5 text-left text-sm text-fg hover:bg-primary-soft focus-visible:bg-primary-soft"
			>
				{i18n.t('composer.dayOther')}
			</button>
		{/snippet}
	</MenuButton>

	{#if calendarOpen}
		<div
			bind:this={calendar}
			class="absolute left-0 z-30 rounded-app border border-border bg-card p-3 shadow-pop"
			class:top-full={!upward}
			class:mt-1.5={!upward}
			class:bottom-full={upward}
			class:mb-1.5={upward}
			style:translate={shift ? `${shift}px 0` : undefined}
		>
			<DayCalendar
				value={day}
				max={today}
				onpick={(picked) => {
					chosen = picked;
					closeCalendar();
				}}
				oncancel={closeCalendar}
			/>
		</div>
	{/if}
</div>
