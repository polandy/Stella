<script lang="ts">
	import { useTranslate } from '$lib/i18n/context.svelte';
	import { install } from '$lib/pwa/install.svelte';
	import Button from './Button.svelte';
	import Icon from './Icon.svelte';

	/*
	 * The standing offer to install Stella on this device (docs/02 §2.18).
	 *
	 * Deliberately in Settings rather than as a prompt over the app: an install banner on a
	 * page somebody opened to read about their aunt is an interruption, and the browser
	 * already suppresses its own after it is dismissed once. Here it waits to be found, and
	 * says so in every one of the three states a device can be in.
	 */
	const t = useTranslate();
</script>

<section class="flex flex-col gap-3" data-testid="install-card">
	<h2 class="text-sm font-medium text-fg-muted">{t('pwa.install.heading')}</h2>
	<div class="flex items-center gap-4 rounded-app bg-card p-4 shadow-card">
		<span
			class="grid size-10 shrink-0 place-items-center rounded-full bg-primary-soft text-primary"
			aria-hidden="true"
		>
			<Icon name="install" size={18} />
		</span>
		<div class="min-w-0 flex-1">
			<p class="font-medium text-fg">{t('pwa.install.label')}</p>
			<p class="text-sm text-fg-muted">
				{#if install.state === 'installed'}
					{t('pwa.install.installed')}
				{:else if install.state === 'ready'}
					{t('pwa.install.hint')}
				{:else}
					{t('pwa.install.byHand')}
				{/if}
			</p>
		</div>
		{#if install.state === 'ready'}
			<Button variant="secondary" size="sm" onclick={() => install.offer()}>
				{t('pwa.install.action')}
			</Button>
		{/if}
	</div>
</section>
