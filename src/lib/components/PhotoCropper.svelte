<script lang="ts">
	import { useTranslate } from '$lib/i18n/context.svelte';
	import {
		MAX_ZOOM,
		cropRect,
		imagePlacement,
		initialCrop,
		panBy,
		zoomTo,
		type Crop,
		type CropRect,
		type ImageSize,
		type WindowPoint
	} from '$lib/image/crop';
	import Button from './Button.svelte';

	/*
	 * Choosing which square of a picture becomes a person's photo (docs/02 §2.14). The picture
	 * moves behind a fixed round window: drag it, pinch or scroll to zoom, or use the slider and
	 * the arrow keys. All geometry lives in `$lib/image/crop`; this component only turns pointer
	 * and key events into calls there and draws the result. A native <dialog> gives focus
	 * trapping, Escape and the backdrop for free, as in the command palette.
	 */

	interface Props {
		/** The picked picture; the dialog is open while this is set. */
		file: Blob | null;
		onconfirm: (crop: CropRect) => void;
		oncancel: () => void;
	}
	let { file, onconfirm, oncancel }: Props = $props();

	const t = useTranslate();

	/** Screen pixels one arrow-key press moves the picture. */
	const KEY_STEP_PX = 12;
	/** How strongly a mouse wheel notch zooms; small so a trackpad stays smooth. */
	const WHEEL_ZOOM_PER_PX = 0.002;

	let dialog: HTMLDialogElement | undefined = $state();
	let windowPx = $state(0);
	let windowEl: HTMLDivElement | undefined = $state();
	let image = $state<ImageSize | null>(null);
	let crop = $state<Crop | null>(null);

	const url = $derived(file ? URL.createObjectURL(file) : null);
	$effect(() => {
		const current = url;
		return () => {
			if (current) URL.revokeObjectURL(current);
		};
	});

	$effect(() => {
		if (!dialog) return;
		if (file && !dialog.open) {
			image = null;
			crop = null;
			dialog.showModal();
		} else if (!file && dialog.open) {
			dialog.close();
		}
	});

	const placement = $derived(image && crop && windowPx > 0 ? imagePlacement(image, crop, windowPx) : null);

	function onLoad(event: Event) {
		const img = event.currentTarget as HTMLImageElement;
		image = { width: img.naturalWidth, height: img.naturalHeight };
		crop = initialCrop(image);
	}

	// ── Pointers: one drags, two pinch ─────────────────────────────────────────

	const pointers = new Map<number, { x: number; y: number }>();

	function windowPoint(clientX: number, clientY: number): WindowPoint {
		const box = windowEl!.getBoundingClientRect();
		return { x: (clientX - box.left) / box.width, y: (clientY - box.top) / box.height };
	}

	function spread(): { distance: number; midX: number; midY: number } {
		const [a, b] = [...pointers.values()];
		return { distance: Math.hypot(a.x - b.x, a.y - b.y), midX: (a.x + b.x) / 2, midY: (a.y + b.y) / 2 };
	}

	function onPointerDown(event: PointerEvent) {
		windowEl?.setPointerCapture(event.pointerId);
		pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
	}

	function onPointerMove(event: PointerEvent) {
		const previous = pointers.get(event.pointerId);
		if (!previous || !image || !crop) return;
		if (pointers.size === 1) {
			pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
			crop = panBy(image, crop, { dx: event.clientX - previous.x, dy: event.clientY - previous.y }, windowPx);
			return;
		}
		if (pointers.size !== 2) return;
		const before = spread();
		pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
		const after = spread();
		if (before.distance > 0) {
			const focus = windowPoint(before.midX, before.midY);
			crop = zoomTo(image, crop, (crop.zoom * after.distance) / before.distance, focus);
		}
		crop = panBy(image, crop, { dx: after.midX - before.midX, dy: after.midY - before.midY }, windowPx);
	}

	function onPointerUp(event: PointerEvent) {
		pointers.delete(event.pointerId);
	}

	function onWheel(event: WheelEvent) {
		if (!image || !crop) return;
		event.preventDefault();
		const focus = windowPoint(event.clientX, event.clientY);
		crop = zoomTo(image, crop, crop.zoom * Math.exp(-event.deltaY * WHEEL_ZOOM_PER_PX), focus);
	}

	function onKeydown(event: KeyboardEvent) {
		if (!image || !crop) return;
		const moves: Record<string, [number, number]> = {
			ArrowLeft: [KEY_STEP_PX, 0],
			ArrowRight: [-KEY_STEP_PX, 0],
			ArrowUp: [0, KEY_STEP_PX],
			ArrowDown: [0, -KEY_STEP_PX]
		};
		const move = moves[event.key];
		if (move) {
			event.preventDefault();
			crop = panBy(image, crop, { dx: move[0], dy: move[1] }, windowPx);
		} else if (event.key === '+' || event.key === '=') {
			event.preventDefault();
			crop = zoomTo(image, crop, crop.zoom * 1.1);
		} else if (event.key === '-') {
			event.preventDefault();
			crop = zoomTo(image, crop, crop.zoom / 1.1);
		}
	}

	function onSlide(event: Event) {
		if (!image || !crop) return;
		crop = zoomTo(image, crop, Number((event.currentTarget as HTMLInputElement).value));
	}

	function confirm() {
		if (image && crop) onconfirm(cropRect(image, crop));
	}
</script>

<dialog
	bind:this={dialog}
	onclose={() => file && oncancel()}
	aria-label={t('components.cropper.title')}
	class="m-auto w-full max-w-sm rounded-app border border-border bg-card p-0 text-fg shadow-pop backdrop:bg-bg-sunken/70 backdrop:backdrop-blur-sm"
	data-testid="photo-cropper"
>
	<div class="flex flex-col gap-4 p-4">
		<h2 class="text-base font-semibold">{t('components.cropper.title')}</h2>

		<!-- A drag-and-zoom surface has no native element; role="application" hands its keys to us. -->
		<!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions -->
		<div
			bind:this={windowEl}
			bind:clientWidth={windowPx}
			role="application"
			aria-label={t('components.cropper.window')}
			aria-describedby="cropper-hint"
			tabindex="0"
			onpointerdown={onPointerDown}
			onpointermove={onPointerMove}
			onpointerup={onPointerUp}
			onpointercancel={onPointerUp}
			onwheel={onWheel}
			onkeydown={onKeydown}
			class="relative aspect-square w-full cursor-grab touch-none overflow-hidden rounded-control bg-bg-sunken outline-offset-2 select-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--focus-ring)] active:cursor-grabbing"
		>
			{#if url}
				<img
					src={url}
					alt=""
					draggable="false"
					onload={onLoad}
					class="pointer-events-none absolute max-w-none"
					class:invisible={!placement}
					style:left="{placement?.left ?? 0}px"
					style:top="{placement?.top ?? 0}px"
					style:width="{placement?.width ?? 0}px"
					style:height="{placement?.height ?? 0}px"
				/>
			{/if}
			<!-- The round avatar the square will be worn as; the corners stay visible but dimmed. -->
			<div class="pointer-events-none absolute inset-0 rounded-full shadow-[0_0_0_100vmax_rgb(0_0_0/0.45)]"></div>
		</div>

		<p id="cropper-hint" class="text-xs text-fg-muted">{t('components.cropper.hint')}</p>

		<input
			type="range"
			min="1"
			max={MAX_ZOOM}
			step="0.01"
			value={crop?.zoom ?? 1}
			oninput={onSlide}
			disabled={!crop}
			aria-label={t('components.cropper.zoom')}
			class="w-full accent-[var(--primary)]"
		/>

		<div class="flex justify-end gap-2">
			<Button variant="ghost" onclick={oncancel}>{t('common.cancel')}</Button>
			<Button variant="primary" onclick={confirm} disabled={!crop}>{t('components.cropper.use')}</Button>
		</div>
	</div>
</dialog>
