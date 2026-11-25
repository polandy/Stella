<script lang="ts">
	import { useTranslate } from '#lib/i18n/context.svelte.js';
	import type { ThenOrNow } from '#lib/circles/then-preference.js';

	/*
	 * *Then · Now* in a members header (docs/dev/02 §2.4.2): two pressed-state buttons, so a
	 * screen reader hears which one shows. The page decides whether it is there at all.
	 */
	let { then, onchoose }: { then: boolean; onchoose: (choice: ThenOrNow) => void } = $props();

	const t = useTranslate();
</script>

{#snippet segment(choice: ThenOrNow, pressed: boolean, label: string)}
	<button
		type="button"
		aria-pressed={pressed}
		onclick={() => onchoose(choice)}
		class="tap-target rounded-full px-3 py-1 text-xs font-medium transition-colors {pressed
			? 'bg-primary text-primary-fg'
			: 'text-fg-muted hover:text-fg'}">{label}</button
	>
{/snippet}

<div
	role="group"
	aria-label={t('circles.then.label')}
	class="flex items-center rounded-full border border-border bg-card p-0.5"
	data-testid="then-now"
>
	{@render segment('then', then, t('circles.then.then'))}
	{@render segment('now', !then, t('circles.then.now'))}
</div>
