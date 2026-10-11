<script lang="ts">
	import { accentDotStyle, type Accent } from '$lib/design/tokens';
	import { useTranslate } from '$lib/i18n/context.svelte';

	/*
	 * A circle's colour as round swatches (docs/05 §5.5), shared by the create form and the
	 * circle page's edit form so both offer the palette the same way. Each swatch is named for a
	 * screen reader and shows a focus ring of its own: the radio under it is visually hidden, so
	 * it cannot show one (WCAG 1.1.1, 2.4.7).
	 */
	interface Props {
		colors: readonly Accent[];
		/** The colour checked to begin with. */
		selected: string;
		/** The field the choice is posted under. */
		name?: string;
	}

	let { colors, selected, name = 'color' }: Props = $props();
	const t = useTranslate();
</script>

<fieldset class="flex flex-col gap-2">
	<legend class="mb-2 text-sm text-fg-muted">{t('circles.colour')}</legend>
	<div class="flex flex-wrap gap-2">
		{#each colors as color (color)}
			<label class="cursor-pointer" title={t(`components.colour.${color}`)}>
				<input
					type="radio"
					{name}
					value={color}
					checked={color === selected}
					class="peer sr-only"
				/>
				<span
					class="block size-7 rounded-full ring-offset-2 ring-offset-[var(--card)] transition-all peer-checked:ring-2 peer-checked:ring-[var(--fg)] peer-focus-visible:outline-2 peer-focus-visible:outline-offset-4 peer-focus-visible:outline-focus-ring hover:scale-110"
					style={accentDotStyle(color)}
					aria-hidden="true"
				></span>
				<span class="sr-only">{t(`components.colour.${color}`)}</span>
			</label>
		{/each}
	</div>
</fieldset>
