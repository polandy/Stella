<!--
  @component
  Export the family tree (docs/02 §2.7, docs/design/screens/graph.md): a title, a picture or a
  printed page, the paper, the years and the private people — beside a preview of the sheet as it
  comes out. The tree is drawn by `cytoscape/tree-image.ts`; this only asks and hands it on.
-->
<script lang="ts">
	import { onDestroy, untrack } from 'svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import FormError from '$lib/components/ui/FormError.svelte';
	import { useI18n } from '$lib/i18n/context.svelte';
	import { drawTreeImage, type TreeImage } from '$lib/graph/cytoscape/tree-image';
	import { lightPaletteFromDom } from '$lib/graph/cytoscape/theme';
	import {
		fileNameFor,
		NAME_PT_FOR_A3,
		printedSize,
		renderScale,
		type ExportChoices,
		type ExportFormat,
		type Paper
	} from '$lib/graph/tree-export';
	import type { ExportScene } from '$lib/graph/tree-export-scene';
	import ExportSheet from './ExportSheet.svelte';
	import { printPicture } from './print-picture';

	interface Props {
		open: boolean;
		/** "Family of Anna Example": what the title starts as. */
		defaultTitle: string;
		/** How many on the map are private, for the switch's hint; none hides the switch. */
		privateCount: number;
		/** The tree as it goes out under the two switches. */
		sceneFor: (choices: Pick<ExportChoices, 'dates' | 'withPrivate'>) => ExportScene;
		/** Whether the lines are named, as on screen. */
		edgeLabels: boolean;
		/** The shelf's caption in the reader's language. */
		outsideFamily: string;
	}

	let {
		open = $bindable(),
		defaultTitle,
		privateCount,
		sceneFor,
		edgeLabels,
		outsideFamily
	}: Props = $props();

	const i18n = useI18n();
	const t = i18n.t;
	const uid = $props.id();
	const titleId = `${uid}-export-title`;
	let dialog = $state<HTMLDialogElement>();
	let title = $state('');
	let format = $state<ExportFormat>('png');
	let paper = $state<Paper>('a4');
	let dates = $state(false);
	let withPrivate = $state(false);
	let preview = $state<{ url: string; picture: TreeImage } | null>(null);
	let failed = $state(false);
	let busy = $state(false);

	const madeOn = $derived(
		t('graph.export.madeOn', {
			date: new Date().toLocaleDateString(i18n.intlLocale, {
				day: 'numeric',
				month: 'long',
				year: 'numeric'
			})
		})
	);
	const shownTitle = $derived(title.trim() || t('graph.export.untitled'));
	// Paper is white whatever the screen's theme, and so is the preview's sheet.
	const light = $derived(open ? lightPaletteFromDom() : null);
	const printed = $derived(preview ? printedSize(preview.picture.size, paper) : null);
	const pt = (value: number) =>
		new Intl.NumberFormat(i18n.intlLocale, { maximumFractionDigits: 1 }).format(value);

	$effect(() => {
		if (!dialog) return;
		if (open && !dialog.open) {
			title = defaultTitle;
			dialog.showModal();
		} else if (!open && dialog.open) dialog.close();
	});

	/** Sharp in the dialog's preview on a dense display, and quick to draw. */
	const PREVIEW_WIDTH = 1400;
	// The preview is drawn again when the tree changes, never for a keystroke in the title.
	let drawing = 0;
	$effect(() => {
		if (!open) return;
		const scene = sceneFor({ dates, withPrivate });
		const mine = ++drawing;
		failed = false;
		// The title is measured, not drawn: reading it here would draw again on every keystroke.
		const drawn = untrack(() =>
			draw(scene, {
				writeHeader: false,
				scaleFor: (size) => Math.min(2, PREVIEW_WIDTH / size.width)
			})
		);
		drawn.then(
			(picture) => {
				if (mine !== drawing) return;
				show(picture);
			},
			() => {
				if (mine === drawing) failed = true;
			}
		);
	});

	function draw(
		scene: ExportScene,
		look: Pick<Parameters<typeof drawTreeImage>[0], 'writeHeader' | 'scaleFor'>
	) {
		return drawTreeImage({ scene, edgeLabels, outsideFamily, title: shownTitle, madeOn, ...look });
	}

	function show(picture: TreeImage | null) {
		if (preview) URL.revokeObjectURL(preview.url);
		preview = picture ? { url: URL.createObjectURL(picture.blob), picture } : null;
	}
	onDestroy(() => show(null));

	const DOWNLOAD_GRACE_MS = 30_000;

	async function exportNow() {
		busy = true;
		failed = false;
		try {
			const scene = sceneFor({ dates, withPrivate });
			const picture = await draw(scene, {
				writeHeader: true,
				scaleFor: (size) => renderScale(size, format, paper)
			});
			open = false;
			if (format === 'print') return await printPicture(picture, paper);
			const link = document.createElement('a');
			link.href = URL.createObjectURL(picture.blob);
			link.download = fileNameFor(shownTitle);
			link.click();
			// Safari still reads the file after `click()` returns; it is let go once the save is
			// well under way rather than straight away.
			setTimeout(() => URL.revokeObjectURL(link.href), DOWNLOAD_GRACE_MS);
		} catch {
			failed = true;
		} finally {
			busy = false;
		}
	}

	const GROUP = 'flex flex-col gap-1.5 text-sm font-semibold';
	const SEGMENTS = 'flex gap-1 rounded-control border border-border bg-bg p-0.5';
	const SEGMENT =
		'flex-1 rounded-control px-2 py-1.5 text-sm font-normal text-fg aria-pressed:bg-card aria-pressed:font-semibold aria-pressed:text-primary aria-pressed:shadow-card';
	const HINT = 'text-xs font-normal text-fg-subtle';
</script>

{#snippet toggle(
	id: string,
	label: string,
	hint: string | null,
	checked: boolean,
	flip: (on: boolean) => void
)}
	<div class="flex items-start gap-3 text-sm">
		<label for={id} class="min-w-0 flex-1">
			<span class="font-medium text-fg">{label}</span>
			{#if hint}<span class="mt-0.5 block {HINT}">{hint}</span>{/if}
		</label>
		<span class="group/switch relative mt-0.5 inline-flex shrink-0">
			<input
				{id}
				type="checkbox"
				role="switch"
				class="peer absolute inset-0 z-10 cursor-pointer opacity-0"
				{checked}
				onchange={(event) => flip(event.currentTarget.checked)}
			/>
			<span
				class="relative h-6 w-10 rounded-full bg-border transition-colors duration-(--motion-fade) ease-standard peer-checked:bg-primary peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-focus-ring"
				aria-hidden="true"
				><span
					class="absolute top-0.5 left-0.5 size-5 rounded-full bg-card shadow-card transition-transform duration-(--motion-fade) ease-standard group-has-checked/switch:translate-x-4"
				></span></span
			>
		</span>
	</div>
{/snippet}

<dialog
	bind:this={dialog}
	aria-labelledby={titleId}
	onclose={() => (open = false)}
	onclick={(event) => event.target === event.currentTarget && dialog?.close()}
	class="mx-auto mt-auto mb-0 w-full max-w-4xl rounded-t-app border border-border bg-card p-0 text-fg shadow-pop backdrop:bg-bg-sunken/70 backdrop:backdrop-blur-sm md:m-auto md:rounded-app"
	data-testid="tree-export"
>
	<div class="grid max-h-[92vh] overflow-y-auto md:grid-cols-[3fr_2fr]">
		<div
			class="grid place-items-center bg-bg-sunken p-4 [--preview-height:40vh] md:[--preview-height:70vh]"
			aria-label={t('graph.export.preview')}
			role="figure"
		>
			{#if light}
				<ExportSheet {light} {format} {paper} {preview} {failed} title={shownTitle} {madeOn} />
			{/if}
		</div>
		<div class="flex flex-col gap-4 p-4">
			<h2 id={titleId} class="text-base font-semibold">{t('graph.export.heading')}</h2>
			<label class={GROUP}>
				{t('graph.export.titleField')}
				<input
					type="text"
					bind:value={title}
					class="rounded-control border border-border-input bg-bg px-3 py-2 font-normal text-fg"
				/>
			</label>
			<div class={GROUP}>
				<span id="{titleId}-format">{t('graph.export.format')}</span>
				<div class={SEGMENTS} role="group" aria-labelledby="{titleId}-format">
					{#each [['png', 'graph.export.png'], ['print', 'graph.export.print']] as const as [value, key] (value)}
						<button
							type="button"
							class={SEGMENT}
							aria-pressed={format === value}
							onclick={() => (format = value)}
						>
							{t(key)}
						</button>
					{/each}
				</div>
			</div>
			{#if format === 'print'}
				<div class={GROUP}>
					<span id="{titleId}-paper">{t('graph.export.paper')}</span>
					<div class={SEGMENTS} role="group" aria-labelledby="{titleId}-paper">
						{#each ['a4', 'a3'] as const as value (value)}
							<button
								type="button"
								class={SEGMENT}
								aria-pressed={paper === value}
								onclick={() => (paper = value)}
							>
								{value.toUpperCase()}
							</button>
						{/each}
					</div>
					{#if printed}
						<span class={HINT} data-testid="tree-export-paper-hint">
							{printed.namePt < NAME_PT_FOR_A3 && paper === 'a4'
								? t('graph.export.smallNames', { pt: pt(printed.namePt) })
								: t('graph.export.fits', { pt: pt(printed.namePt) })}
						</span>
					{/if}
				</div>
			{/if}
			{@render toggle(
				`${titleId}-dates`,
				t('graph.export.dates'),
				null,
				dates,
				(on) => (dates = on)
			)}
			{#if privateCount > 0}
				{@render toggle(
					`${titleId}-private`,
					t('graph.export.withPrivate'),
					t('graph.export.privateHint', { count: privateCount }),
					withPrivate,
					(on) => (withPrivate = on)
				)}
			{/if}
			<FormError message={failed ? t('graph.export.failed') : null} />
			<div class="mt-auto flex justify-end gap-2">
				<Button variant="secondary" onclick={() => (open = false)}>{t('common.cancel')}</Button>
				<Button variant="primary" disabled={busy} onclick={exportNow} data-testid="tree-export-go">
					{format === 'print' ? t('graph.export.printButton') : t('graph.export.download')}
				</Button>
			</div>
		</div>
	</div>
</dialog>
