<!--
  @component
  What the picker's body says instead of photos (docs/dev/02 §2.24.9): none there, or Immich did
  not answer — then with *Try again*.
-->
<script lang="ts">
	import Button from '#lib/components/ui/Button.svelte';
	import Icon from '#lib/components/ui/Icon.svelte';
	import type { IconName } from '#lib/components/ui/icons.js';
	import { useTranslate } from '#lib/i18n/context.svelte.js';

	interface Props {
		icon: IconName;
		title: string;
		hint?: string | null;
		onretry?: (() => void) | null;
	}

	let { icon, title, hint = null, onretry = null }: Props = $props();

	const t = useTranslate();
</script>

<div class="flex flex-col items-center gap-2 py-10 text-center text-sm">
	<Icon name={icon} size={28} class="text-fg-subtle" />
	<b>{title}</b>
	{#if hint}<span class="text-fg-muted">{hint}</span>{/if}
	{#if onretry}
		<Button type="button" size="sm" onclick={onretry}>{t('immich.library.tryAgain')}</Button>
	{/if}
</div>
