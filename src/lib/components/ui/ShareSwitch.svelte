<script lang="ts">
	import Icon from './Icon.svelte';
	import { useI18n } from '$lib/i18n/context.svelte';

	/*
	 * Shared or private, as a switch, because it is one (docs/05 §5.7): a checkbox in the switch
	 * role whose name stays put — "Share with household", on or off — so a screen reader hears one
	 * control changing state rather than a label that swaps under it. The visible word is the
	 * state with its icon, for the eye. On a touch screen the whole pill is a finger's height
	 * (§5.9). With `name` it posts `shared` or `private` under it.
	 */
	interface Props {
		shared: boolean;
		onchange?: (shared: boolean) => void;
		/** The form field the choice posts as, when the form reads it directly. */
		name?: string;
	}
	let { shared = $bindable(), onchange, name }: Props = $props();

	const t = useI18n().t;
</script>

<label
	class="group/share inline-flex cursor-pointer items-center gap-2 rounded-full px-1 py-1 text-xs text-fg-muted has-checked:font-semibold has-checked:text-fg has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-focus-ring pointer-coarse:min-h-11 pointer-coarse:px-2"
>
	<input
		type="checkbox"
		role="switch"
		class="sr-only"
		aria-label={t('composer.shareWithHousehold')}
		checked={shared}
		onchange={(e) => {
			shared = e.currentTarget.checked;
			onchange?.(shared);
		}}
	/>
	<span
		class="relative h-4.5 w-7.5 shrink-0 rounded-full bg-border transition-colors duration-(--motion-fade) ease-standard group-has-checked/share:bg-primary"
		aria-hidden="true"
		><span
			class="absolute top-0.5 left-0.5 size-3.5 rounded-full bg-card shadow-card transition-transform duration-(--motion-fade) ease-standard group-has-checked/share:translate-x-3"
		></span></span
	>
	<span class="inline-flex items-center gap-1" aria-hidden="true"
		><Icon name={shared ? 'shared' : 'private'} size={13} />{shared
			? t('common.shared')
			: t('common.private')}</span
	>
</label>
{#if name}<input type="hidden" {name} value={shared ? 'shared' : 'private'} />{/if}
