<script lang="ts">
	import { useTranslate } from '#lib/i18n/context.svelte.js';
	import {
		cropFromRect,
		cropRect,
		imagePlacement,
		initialCrop,
		keyStep,
		maxZoom,
		panBy,
		pinch,
		zoomTo,
		type Crop,
		type CropRect,
		type FingerPair,
		type ImageSize,
		type WindowPixel
	} from '#lib/media/crop.js';
	import {
		turnCrop,
		turned,
		turnedSize,
		turnStyle,
		type QuarterTurns,
		type TurnDirection
	} from '#lib/media/turn.js';
	import Button from './Button.svelte';
	import { syncModal } from './modal';

	/*
	 * Choosing which square of a picture becomes a person's photo (docs/dev/02 §2.14). The picture
	 * moves behind a fixed round window: drag it, pinch or scroll to zoom, or use the slider and
	 * the arrow keys; where `turnable`, turn it a quarter left or right. All geometry lives in
	 * `#lib/media/crop.js` and `#lib/media/turn.js`; this component only turns pointer
	 * and key events into calls there and draws the result. A native <dialog> gives focus
	 * trapping, Escape and the backdrop for free, as in the command palette. Keys stay inside it:
	 * the gallery's lightbox walks its photos with the same arrows on `window`.
	 */

	interface Props {
		/** The picked picture; the dialog is open while this is set. */
		file: Blob | null;
		/** The square chosen last time, to start from instead of the centre. */
		initial?: CropRect | null;
		/** Whether the picture may be turned a quarter at a time; only where the cut is re-encoded whole. */
		turnable?: boolean;
		/** `crop` is in the picture's pixels as turned by `turns`. */
		onconfirm: (crop: CropRect, turns: QuarterTurns) => void;
		oncancel: () => void;
	}
	let { file, initial = null, turnable = false, onconfirm, oncancel }: Props = $props();

	const t = useTranslate();

	/** How strongly a mouse wheel notch zooms; small so a trackpad stays smooth. */
	const WHEEL_ZOOM_PER_PX = 0.002;

	let dialog: HTMLDialogElement | undefined = $state();
	let windowPx = $state(0);
	let windowEl: HTMLDivElement | undefined = $state();
	let natural = $state<ImageSize | null>(null);
	let turns = $state<QuarterTurns>(0);
	/** The picture as shown, turned: every crop is in its pixels. */
	const image = $derived(natural ? turnedSize(natural, turns) : null);
	let crop = $state<Crop | null>(null);

	const url = $derived(file ? URL.createObjectURL(file) : null);
	$effect(() => {
		const current = url;
		return () => {
			if (current) URL.revokeObjectURL(current);
		};
	});

	$effect(() => {
		syncModal(dialog, file !== null, () => {
			natural = null;
			turns = 0;
			crop = null;
		});
	});

	const placement = $derived(
		image && crop && windowPx > 0 ? turnStyle(imagePlacement(image, crop, windowPx), turns) : null
	);

	function onLoad(event: Event) {
		const img = event.currentTarget as HTMLImageElement;
		const loaded = { width: img.naturalWidth, height: img.naturalHeight };
		natural = loaded;
		crop = initial ? cropFromRect(loaded, initial) : initialCrop(loaded);
	}

	// ── Pointers: one drags, two pinch ─────────────────────────────────────────

	/** Where each finger (or the mouse) is on the window, in window pixels. */
	const pointers = new Map<number, WindowPixel>();

	function onWindow(event: PointerEvent | WheelEvent): WindowPixel {
		const box = windowEl!.getBoundingClientRect();
		return { x: event.clientX - box.left, y: event.clientY - box.top };
	}

	function fingers(): FingerPair {
		const [a, b] = [...pointers.values()];
		return { a, b };
	}

	function onPointerDown(event: PointerEvent) {
		windowEl?.setPointerCapture(event.pointerId);
		pointers.set(event.pointerId, onWindow(event));
	}

	function onPointerMove(event: PointerEvent) {
		const previous = pointers.get(event.pointerId);
		if (!previous || !image || !crop) return;
		const now = onWindow(event);
		if (pointers.size === 1) {
			pointers.set(event.pointerId, now);
			crop = panBy(image, crop, { dx: now.x - previous.x, dy: now.y - previous.y }, windowPx);
		} else if (pointers.size === 2) {
			const before = fingers();
			pointers.set(event.pointerId, now);
			crop = pinch(image, crop, before, fingers(), windowPx);
		}
	}

	function onPointerUp(event: PointerEvent) {
		pointers.delete(event.pointerId);
	}

	function onWheel(event: WheelEvent) {
		if (!image || !crop) return;
		event.preventDefault();
		const at = onWindow(event);
		const focus = { x: at.x / windowPx, y: at.y / windowPx };
		crop = zoomTo(image, crop, crop.zoom * Math.exp(-event.deltaY * WHEEL_ZOOM_PER_PX), focus);
	}

	function onKeydown(event: KeyboardEvent) {
		if (!image || !crop) return;
		const next = keyStep(image, crop, event.key, windowPx);
		if (!next) return;
		event.preventDefault();
		crop = next;
	}

	function onSlide(event: Event) {
		if (!image || !crop) return;
		crop = zoomTo(image, crop, Number((event.currentTarget as HTMLInputElement).value));
	}

	function turn(direction: TurnDirection) {
		if (!image || !crop) return;
		crop = turnCrop(image, crop, direction);
		turns = turned(turns, direction);
	}

	function confirm() {
		if (image && crop) onconfirm(cropRect(image, crop), turns);
	}
</script>

<dialog
	bind:this={dialog}
	onclose={() => file && oncancel()}
	onkeydown={(event) => dialog?.open && event.stopPropagation()}
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
					style:transform={placement?.transform}
				/>
			{/if}
			<!-- The round avatar the square will be worn as; the corners stay visible but dimmed. -->
			<div
				class="pointer-events-none absolute inset-0 rounded-full shadow-[0_0_0_100vmax_color-mix(in_srgb,var(--bg-sunken)_70%,transparent)]"
			></div>
		</div>

		<p id="cropper-hint" class="text-xs text-fg-muted">{t('components.cropper.hint')}</p>

		<div class="flex items-center gap-2">
			{#if turnable}
				<Button
					variant="ghost"
					icon="turnLeft"
					label={t('components.cropper.turnLeft')}
					title={t('components.cropper.turnLeft')}
					onclick={() => turn('left')}
					disabled={!crop}
				/>
			{/if}
			<input
				type="range"
				min="1"
				max={image ? maxZoom(image) : 1}
				step="0.01"
				value={crop?.zoom ?? 1}
				oninput={onSlide}
				disabled={!crop}
				aria-label={t('components.cropper.zoom')}
				class="min-w-0 flex-1 accent-[var(--primary)]"
			/>
			{#if turnable}
				<Button
					variant="ghost"
					icon="turnRight"
					label={t('components.cropper.turnRight')}
					title={t('components.cropper.turnRight')}
					onclick={() => turn('right')}
					disabled={!crop}
				/>
			{/if}
		</div>

		<div class="flex justify-end gap-2">
			<Button variant="ghost" onclick={oncancel}>{t('common.cancel')}</Button>
			<Button variant="primary" onclick={confirm} disabled={!crop}
				>{t('components.cropper.use')}</Button
			>
		</div>
	</div>
</dialog>
