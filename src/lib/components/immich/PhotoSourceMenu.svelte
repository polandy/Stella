<!--
  @component
  Where a photo comes from, once Immich is on the instance (docs/02 §2.24.9): the photo button of
  a moment or a journal entry opens *From this device* and *From Immich*. Offline, *From Immich*
  stays in the menu, greyed out, and says it needs a connection — nothing from Immich is kept for
  later. The file field is the caller's no longer: it lives here, out of sight, and the first item
  opens it.
-->
<script lang="ts">
	import type { Snippet } from 'svelte';
	import Icon from '$lib/components/ui/Icon.svelte';
	import MenuButton from '$lib/components/ui/MenuButton.svelte';
	import { useTranslate } from '$lib/i18n/context.svelte';
	import { reachability } from '$lib/pwa/reachability.svelte';

	interface Props {
		/** The button's accessible name: *Add photos*. */
		label: string;
		/** What the button shows. */
		trigger: Snippet;
		look: 'icon' | 'outline';
		/** Photos picked on the device. */
		onfiles: (files: File[]) => void;
		/** *From Immich* was chosen: the caller opens the picker. */
		onimmich: () => void;
	}

	let { label, trigger, look, onfiles, onimmich }: Props = $props();

	const t = useTranslate();
	let fileInput = $state<HTMLInputElement>();

	const ITEM =
		'flex items-center gap-2 rounded-control px-2.5 py-1.5 text-left text-sm text-fg hover:bg-primary-soft focus-visible:bg-primary-soft aria-disabled:cursor-not-allowed aria-disabled:text-fg-subtle aria-disabled:hover:bg-transparent';
</script>

<MenuButton {label} {trigger} {look}>
	{#snippet children({ close })}
		<button
			type="button"
			role="menuitem"
			class={ITEM}
			onclick={() => {
				close();
				fileInput?.click();
			}}
		>
			<Icon name="photo" size={14} />{t('immich.library.fromDevice')}
		</button>
		<button
			type="button"
			role="menuitem"
			class={ITEM}
			aria-disabled={!reachability.reachable}
			onclick={() => {
				if (!reachability.reachable) return;
				close();
				onimmich();
			}}
			data-testid="from-immich"
		>
			<Icon name="import" size={14} />
			<span class="flex flex-col">
				{t('immich.library.fromImmich')}
				{#if !reachability.reachable}
					<small class="text-xs text-fg-subtle">{t('immich.library.needsConnection')}</small>
				{/if}
			</span>
		</button>
	{/snippet}
</MenuButton>
<input
	bind:this={fileInput}
	type="file"
	accept="image/*"
	multiple
	tabindex="-1"
	aria-hidden="true"
	onchange={(event) => onfiles(Array.from(event.currentTarget.files ?? []))}
	class="hidden"
/>
