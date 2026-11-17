<!--
  @component
  The picker's foot (docs/dev/02 §2.24.9): how many photos are ticked, *Clear*, and *Add N photos* —
  or, while they are copied, how far that has come.
-->
<script lang="ts">
	import Button from '$lib/components/ui/Button.svelte';
	import { useTranslate } from '$lib/i18n/context.svelte';
	import { LIBRARY_PICK_LIMIT } from '$lib/immich/library-pick';

	interface Props {
		ticked: number;
		full: boolean;
		copying: { done: number; count: number } | null;
		onclear: () => void;
		onadd: () => void;
	}

	let { ticked, full, copying, onclear, onadd }: Props = $props();

	const t = useTranslate();
</script>

<div class="flex items-center justify-between gap-3 border-t border-border pt-3 text-sm">
	{#if copying}
		<span class="text-fg-muted" aria-live="polite"
			>{t('immich.library.copying', { done: copying.done + 1, count: copying.count })}</span
		>
	{:else if ticked}
		<span class="flex items-center gap-1 text-fg-muted">
			<b class="text-fg">{t('immich.library.ticked', { count: ticked })}</b>
			{#if full}· {t('immich.library.atMost', { count: LIBRARY_PICK_LIMIT })}{/if}
			· <Button type="button" variant="ghost" size="sm" onclick={onclear}
				>{t('immich.library.clear')}</Button
			>
		</span>
	{:else}
		<span class="text-fg-subtle">{t('immich.library.tapToTick')}</span>
	{/if}
	<Button
		type="button"
		variant="primary"
		disabled={ticked === 0 || copying !== null}
		onclick={onadd}
		>{ticked ? t('immich.library.add', { count: ticked }) : t('immich.library.addPhotos')}</Button
	>
</div>
