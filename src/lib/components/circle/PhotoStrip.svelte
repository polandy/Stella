<script lang="ts">
	import Icon from '$lib/components/Icon.svelte';
	import { viewUrl } from '$lib/media/urls';

	/*
	 * A circle photo as a wide strip (docs/02 §2.4.2, docs/05 §5.5): the circle's cover at the top
	 * of its page, or a role's banner above that role's group. Filled from the centre with no
	 * cropping step — about 3:1 on a phone, a fixed and flatter height on a wide screen so the
	 * members stay in view. The whole strip is the button that opens the lightbox; the badge says
	 * how many photos the lightbox will walk.
	 */
	let {
		photoId,
		count,
		label,
		size,
		onopen
	}: {
		photoId: string;
		/** How many photos the lightbox walks from here. */
		count: number;
		/** The button's accessible name. */
		label: string;
		/** The cover is a little taller than a role's banner. */
		size: 'cover' | 'banner';
		onopen: (opener: HTMLElement) => void;
	} = $props();

	const height = $derived(size === 'cover' ? 'md:h-48' : 'md:h-36');
</script>

<button
	type="button"
	onclick={(event) => onopen(event.currentTarget)}
	aria-label={label}
	class="relative block aspect-[3/1] w-full overflow-hidden rounded-app bg-bg-sunken focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary md:aspect-auto {height}"
	data-testid="circle-{size}"
>
	<img src={viewUrl(photoId)} alt="" class="size-full object-cover object-center" />
	{#if count > 1}
		<span
			class="pointer-events-none absolute bottom-2 right-2 inline-flex items-center gap-1 rounded-full bg-black/60 px-2 py-0.5 text-[11px] font-semibold text-white"
			aria-hidden="true"
		>
			<Icon name="photo" size={12} />{count}
		</span>
	{/if}
</button>
