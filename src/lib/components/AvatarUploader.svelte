<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import { processAvatar } from '$lib/image/process-avatar';
	import Avatar from './Avatar.svelte';

	interface Props {
		contactId: string;
		name: string;
		avatarPhotoId?: string | null;
		size?: number;
	}
	let { contactId, name, avatarPhotoId = null, size = 64 }: Props = $props();

	let input: HTMLInputElement;
	let busy = $state(false);
	let error = $state<string | null>(null);

	async function onPick(event: Event) {
		const file = (event.currentTarget as HTMLInputElement).files?.[0];
		if (!file) return;
		busy = true;
		error = null;
		try {
			const { image, thumb, width, height } = await processAvatar(file);
			const body = new FormData();
			body.append('image', image, 'avatar.jpg');
			body.append('thumb', thumb, 'thumb.jpg');
			body.append('width', String(width));
			body.append('height', String(height));

			const res = await fetch(`/contacts/${contactId}?/setAvatar`, { method: 'POST', body });
			if (!res.ok) throw new Error();
			await invalidateAll();
		} catch {
			error = 'Could not upload the photo. Try a JPEG or PNG image.';
		} finally {
			busy = false;
			if (input) input.value = '';
		}
	}
</script>

<div class="flex flex-col items-center gap-2">
	<button
		type="button"
		onclick={() => input.click()}
		disabled={busy}
		class="group relative rounded-full outline-offset-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--focus-ring)]"
		aria-label={avatarPhotoId ? 'Change photo' : 'Add a photo'}
		title={avatarPhotoId ? 'Change photo' : 'Add a photo'}
	>
		<Avatar id={contactId} {name} {avatarPhotoId} {size} />
		<span
			class="absolute inset-0 grid place-items-center rounded-full bg-black/45 text-xs font-medium text-white opacity-0 transition-opacity group-hover:opacity-100"
			class:opacity-100={busy}
		>
			{busy ? '…' : avatarPhotoId ? 'Change' : 'Add'}
		</span>
	</button>
	<input bind:this={input} onchange={onPick} type="file" accept="image/*" class="hidden" />
	{#if error}<p class="text-xs text-danger">{error}</p>{/if}
</div>
