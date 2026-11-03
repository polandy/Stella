<!--
  @component
  The export dialog's preview (docs/design/screens/graph.md): the sheet as it comes out — the
  page and its margins for a print, the picture alone for a PNG. The picture is drawn with its
  header's room blank and the title typed over it at the picture's own measures, so a keystroke
  in the title never draws the tree again.
-->
<script lang="ts">
	import { useI18n } from '$lib/i18n/context.svelte';
	import { HEADER_LAYOUT, type TreeImage } from '$lib/graph/cytoscape/tree-image';
	import type { Palette } from '$lib/graph/cytoscape/theme';
	import {
		PAGE_MARGIN_MM,
		PAPER_MM,
		printedSize,
		type ExportFormat,
		type Paper
	} from '$lib/graph/tree-export';

	interface Props {
		/** The light theme's colours: paper is white whatever the screen's theme. */
		light: Palette;
		format: ExportFormat;
		paper: Paper;
		preview: { url: string; picture: TreeImage } | null;
		failed: boolean;
		title: string;
		madeOn: string;
	}

	let { light, format, paper, preview, failed, title, madeOn }: Props = $props();

	const { t } = useI18n();
	const page = $derived(PAPER_MM[paper]);
	const printed = $derived(preview ? printedSize(preview.picture.size, paper) : null);
	// Width over height, so a tall tree's preview leaves the dialog's controls in sight.
	const aspect = $derived(
		format === 'print'
			? page.width / page.height
			: preview
				? preview.picture.size.width / preview.picture.size.height
				: 1
	);
	/** A length on the picture, in canvas pixels, as a share of the preview's width. */
	const u = (px: number) => `${(px / (preview?.picture.size.width ?? 1)) * 100}cqw`;
	const { pad, titlePx, madeOnPx, ruleBelow } = HEADER_LAYOUT;
</script>

<div
	class="grid w-full place-items-center shadow-card"
	style:background={light.card}
	style:aspect-ratio={format === 'print' ? `${page.width} / ${page.height}` : null}
	style:padding={format === 'print' ? `${(PAGE_MARGIN_MM / page.width) * 100}%` : null}
	style:max-width="calc(var(--preview-height) * {aspect})"
>
	{#if preview}
		<div
			class="@container relative"
			style:width={format === 'print' && printed
				? `${(printed.widthMm / (page.width - 2 * PAGE_MARGIN_MM)) * 100}%`
				: '100%'}
		>
			<img src={preview.url} alt="" class="block h-auto w-full" />
			<div
				class="absolute flex items-baseline justify-between gap-[1cqw] leading-none"
				style:left={u(pad)}
				style:right={u(pad)}
				style:top={u(pad)}
			>
				<span
					class="truncate font-serif font-semibold"
					style:color={light.fg}
					style:font-size={u(titlePx)}>{title}</span
				>
				<span class="shrink-0" style:color={light.fgMuted} style:font-size={u(madeOnPx)}
					>{madeOn}</span
				>
			</div>
			<div
				class="absolute h-px"
				style:background={light.border}
				style:left={u(pad)}
				style:right={u(pad)}
				style:top={u(pad + titlePx + ruleBelow)}
			></div>
		</div>
	{:else if !failed}
		<p class="px-4 py-16 text-center text-xs" style:color={light.fgMuted}>
			{t('graph.export.drawing')}
		</p>
	{/if}
</div>
