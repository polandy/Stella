<script lang="ts">
	import { useTranslate } from '$lib/i18n/context.svelte';
	import type { Snippet } from 'svelte';

	/*
	 * A phone's composer, as a sheet over the stream (docs/05 §5.5). A modal <dialog>, so the
	 * platform keeps focus inside, Escape closes and the stream behind is out of reach for a
	 * screen reader too (docs/05 §5.9). Not a scroll box: the day calendar and the @-picker open
	 * past its top edge. Closing is the page's: it hands the URL back.
	 */
	let { onclose, children }: { onclose: () => void; children: Snippet } = $props();

	const t = useTranslate();
</script>

<dialog
	{@attach (sheet: HTMLDialogElement) => sheet.showModal()}
	oncancel={(event) => {
		event.preventDefault();
		onclose();
	}}
	onclick={(event) => event.target === event.currentTarget && onclose()}
	aria-label={t('nav.writeMoment')}
	class="mt-auto mb-0 w-full max-w-none overflow-visible rounded-t-app bg-bg p-0 text-fg shadow-pop backdrop:bg-bg-sunken/70 backdrop:backdrop-blur-sm"
	data-testid="compose-sheet"
>
	<!-- The padding lives inside, so a tap on the sheet's edge is not a tap on the backdrop. -->
	<div class="p-3 pb-4">
		<div class="mx-auto mb-2 h-1 w-10 rounded-full bg-border"></div>
		{@render children()}
	</div>
</dialog>
