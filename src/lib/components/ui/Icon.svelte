<script lang="ts">
	import { ICONS, type IconName } from './icons';

	/*
	 * One icon, one stroke weight, one grid (docs/05 §5.10). Everything renders through here so
	 * the set stays visually consistent; components pass a meaning, never a glyph.
	 *
	 * Icons are decorative by default: they sit next to a label, and a screen reader that read
	 * them out would only repeat it. Pass a `label` for the rare icon-only control that carries
	 * the meaning on its own.
	 */
	interface Props {
		name: IconName;
		/** Pixel size of the square icon. */
		size?: number;
		/** Stroke weight; the default matches body text, 2.2 reads better on large icons. */
		strokeWidth?: number;
		/** Accessible name. Omit for an icon that only decorates a visible label. */
		label?: string;
		class?: string;
	}
	let { name, size = 16, strokeWidth = 1.9, label, class: className = '' }: Props = $props();

	const Glyph = $derived(ICONS[name]);
</script>

{#if label}
	<Glyph {size} {strokeWidth} class="shrink-0 {className}" role="img" aria-label={label} />
{:else}
	<Glyph {size} {strokeWidth} class="shrink-0 {className}" aria-hidden="true" />
{/if}
