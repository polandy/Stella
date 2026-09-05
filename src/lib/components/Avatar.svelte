<script lang="ts">
	import { avatarAccent, initials } from '$lib/avatar';
	import { accentAvatarStyle } from '$lib/design/tokens';

	interface Props {
		id: string;
		name: string;
		avatarPhotoId?: string | null;
		/** Pixel size of the avatar (square). */
		size?: number;
		deceased?: boolean;
	}
	let { id, name, avatarPhotoId = null, size = 36, deceased = false }: Props = $props();

	const accent = $derived(avatarAccent(id));
</script>

{#if avatarPhotoId}
	<img
		src="/media/{avatarPhotoId}?thumb"
		alt={name}
		width={size}
		height={size}
		class="shrink-0 rounded-full bg-bg-sunken object-cover"
		class:opacity-70={deceased}
		style="width:{size}px;height:{size}px"
		loading="lazy"
	/>
{:else}
	<span
		class="grid shrink-0 place-items-center rounded-full font-semibold"
		class:opacity-70={deceased}
		style="width:{size}px;height:{size}px;font-size:{Math.round(size * 0.38)}px;{accentAvatarStyle(
			accent
		)}"
		aria-hidden="true"
	>
		{initials(name)}
	</span>
{/if}
