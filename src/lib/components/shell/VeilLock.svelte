<script lang="ts">
	import Icon from '$lib/components/ui/Icon.svelte';
	import { useTranslate } from '$lib/i18n/context.svelte';
	import { revealPath, timeLeftLabel } from '$lib/privacy/veil';
	import { useVeil } from '$lib/privacy/veil.svelte';

	/*
	 * The page header's lock (docs/02 §2.10.1, docs/05 §5.4): *3 private* while the page holds
	 * blurred entries, a tap shows them all for five minutes — after the device's check where it
	 * is set up — and *Private shown · 4:59* meanwhile, a tap blurring them again. Absent on a
	 * page with nothing private, and for a member who does not blur.
	 */
	const t = useTranslate();
	const veil = useVeil();
	const time = $derived(timeLeftLabel(veil.secondsLeft));
	const asks = $derived(revealPath(veil.device.status) === 'verify');
</script>

{#if veil.enabled && veil.windowOpen}
	<button
		type="button"
		onclick={() => veil.toggleAll()}
		class="flex items-center gap-1.5 rounded-control bg-card px-3 py-2 text-sm font-medium text-primary shadow-card"
		aria-label={t('privacy.lock.lockAgain', { time })}
		data-testid="veil-lock"
	>
		<Icon name="unveiled" size={15} />
		<span class="hidden sm:inline">{t('privacy.lock.shown')} ·</span>
		<span class="tabular-nums">{time}</span>
	</button>
{:else if veil.enabled && veil.veiledCount > 0}
	<button
		type="button"
		onclick={() => veil.toggleAll()}
		class="flex items-center gap-1.5 rounded-control bg-card px-3 py-2 text-sm text-fg-muted shadow-card transition-colors hover:text-fg"
		aria-label={t('privacy.lock.showAll', { n: veil.veiledCount })}
		data-testid="veil-lock"
	>
		<Icon name={asks ? 'deviceUnlock' : 'private'} size={15} />
		{t('privacy.lock.count', { n: veil.veiledCount })}
	</button>
{/if}
