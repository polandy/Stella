<script lang="ts">
	import type { Snippet } from 'svelte';

	/*
	 * The person page's lightbox (docs/02 §2.14), without what is in it: a modal <dialog> over a
	 * dimmed backdrop that closes on a click beside the picture or on Escape. Modal, so focus moves
	 * in and stays there; whoever opened it hands focus back on the way out (docs/05 §5.9). The
	 * gallery's photos and the Immich strip's open in the same frame.
	 */
	interface Props {
		/** The dialog's accessible name. */
		label: string;
		/** Closes it: Escape, a click on the backdrop, or the content's own Close. */
		onclose: () => void;
		/** Keys inside it — the arrows walk whatever it was opened from. */
		onkeydown?: (event: KeyboardEvent) => void;
		testid: string;
		children: Snippet;
	}
	let { label, onclose, onkeydown, testid, children }: Props = $props();
</script>

<dialog
	{@attach (lightbox: HTMLDialogElement) => lightbox.showModal()}
	oncancel={(event) => {
		event.preventDefault();
		onclose();
	}}
	onclick={(event) => event.target === event.currentTarget && onclose()}
	{onkeydown}
	aria-label={label}
	class="m-auto w-full max-w-3xl rounded-app bg-card p-0 text-fg shadow-pop backdrop:bg-bg-sunken/90 backdrop:backdrop-blur-sm"
	data-testid={testid}
>
	<div class="flex flex-col gap-3 p-4">
		{@render children()}
	</div>
</dialog>
