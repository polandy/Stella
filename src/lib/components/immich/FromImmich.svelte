<!--
  @component
  *or From Immich* beside a gallery's file field (docs/02 §2.24.9): the picker opens on today, a
  gallery having no day of its own, and what it copies waits beside the field for the upload.
  Offline the button is greyed out and says it needs a connection.
-->
<script lang="ts">
	import Button from '$lib/components/ui/Button.svelte';
	import { useTranslate } from '$lib/i18n/context.svelte';
	import type { ImmichCopy } from '$lib/media/copy-immich-photo';
	import { reachability } from '$lib/pwa/reachability.svelte';
	import ImmichLibraryPicker from './ImmichLibraryPicker.svelte';

	interface Props {
		/** How many copies wait for the upload. */
		count: number;
		onadd: (copies: ImmichCopy[]) => void;
	}

	let { count, onadd }: Props = $props();

	const t = useTranslate();
	let open = $state(false);
</script>

<div class="flex flex-wrap items-center gap-2 text-sm">
	<span class="text-fg-subtle">{t('immich.library.or')}</span>
	<Button
		type="button"
		size="sm"
		icon="import"
		disabled={!reachability.reachable}
		onclick={() => (open = true)}
		data-testid="from-immich">{t('immich.library.fromImmich')}</Button
	>
	{#if !reachability.reachable}
		<span class="text-fg-subtle">{t('immich.library.needsConnection')}</span>
	{:else if count > 0}
		<span class="text-fg-muted" data-testid="from-immich-count"
			>{t('immich.library.ready', { count })}</span
		>
	{/if}
</div>
<ImmichLibraryPicker bind:open {onadd} />
