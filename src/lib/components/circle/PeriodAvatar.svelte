<script lang="ts">
	import Avatar from '#lib/components/ui/Avatar.svelte';
	import { isApproximate, type PeriodFace } from '#lib/circles/period-face.js';

	// A member's face, today's or the one from then, ringed dashed when only the closest (§2.4.2).
	let {
		id,
		name,
		avatarPhotoId,
		face,
		size
	}: {
		id: string;
		name: string;
		avatarPhotoId: string | null;
		/** The face *Then* shows; null in *Now*. */
		face: PeriodFace | null;
		size: number;
	} = $props();

	const approximate = $derived(face !== null && isApproximate(face));
</script>

<span
	class="shrink-0 rounded-full {approximate
		? 'outline-2 outline-offset-2 outline-fg-subtle outline-dashed'
		: ''}"
	data-testid="member-face"
	data-approximate={approximate || undefined}
>
	<Avatar {id} {name} avatarPhotoId={face ? face.photoId : avatarPhotoId} {size} />
</span>
