<script lang="ts">
	import { avatarAccent, initials } from '$lib/avatar';
	import { accentAvatarStyle } from '$lib/design/tokens';
	import { thumbnailUrl } from '$lib/media/urls';

	interface Props {
		id: string;
		name: string;
		avatarPhotoId?: string | null;
		/** Pixel size of the avatar (square). */
		size?: number;
		deceased?: boolean;
		/**
		 * Fill the box it sits in and take its corners, instead of a fixed round `size`: the
		 * person page's portrait, whose size follows the screen (docs/05 §5.5).
		 */
		fill?: boolean;
	}
	let { id, name, avatarPhotoId = null, size = 36, deceased = false, fill = false }: Props = $props();

	const accent = $derived(avatarAccent(id));
</script>

{#if avatarPhotoId}
	<img
		src={thumbnailUrl(avatarPhotoId)}
		alt={name}
		width={size}
		height={size}
		class="shrink-0 bg-bg-sunken object-cover"
		class:rounded-full={!fill}
		class:fill
		class:opacity-70={deceased}
		style={fill ? undefined : `width:${size}px;height:${size}px`}
		loading="lazy"
	/>
{:else}
	<span
		class="grid shrink-0 place-items-center font-semibold"
		class:rounded-full={!fill}
		class:fill
		class:opacity-70={deceased}
		style="{fill ? '' : `width:${size}px;height:${size}px;font-size:${Math.round(size * 0.38)}px;`}{accentAvatarStyle(
			accent
		)}"
		aria-hidden="true"
	>
		{initials(name)}
	</span>
{/if}

<style>
	/*
	 * The box decides the size; the initials keep the round avatar's proportion of it, measured
	 * against the box, which the caller makes a size container.
	 */
	.fill {
		width: 100%;
		height: 100%;
		border-radius: inherit;
		font-size: 38cqw;
	}
</style>
