<!--
  @component
  The day view's heading (docs/dev/02 §2.24.9): the day, how many photos it has, and ‹ › to the
  nearest earlier and later day that has any.
-->
<script lang="ts">
	import Icon from '$lib/components/ui/Icon.svelte';
	import { useTranslate } from '$lib/i18n/context.svelte';

	interface Props {
		/** The day, as the heading says it. */
		label: string;
		/** How many photos the day has; null while it loads. */
		count: number | null;
		/** Each a step to the nearest day with photos, or null when there is none (or none yet). */
		onearlier: (() => void) | null;
		onlater: (() => void) | null;
	}

	let { label, count, onearlier, onlater }: Props = $props();

	const t = useTranslate();
	const STEP =
		'grid size-9 place-items-center rounded-full text-fg-muted enabled:hover:bg-card-hover disabled:opacity-35';
</script>

<div class="flex items-center gap-2" data-testid="immich-library-day">
	<button
		type="button"
		class={STEP}
		aria-label={t('immich.library.earlier')}
		disabled={onearlier === null}
		onclick={() => onearlier?.()}><Icon name="back" size={18} /></button
	>
	<div class="min-w-0 flex-1 text-center">
		<p class="truncate text-sm font-semibold">{label}</p>
		<p class="text-xs text-fg-subtle">
			{count === null ? ' ' : t('immich.library.photoCount', { count })}
		</p>
	</div>
	<button
		type="button"
		class={STEP}
		aria-label={t('immich.library.later')}
		disabled={onlater === null}
		onclick={() => onlater?.()}><Icon name="forward" size={18} /></button
	>
</div>
