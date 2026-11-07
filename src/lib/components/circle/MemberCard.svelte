<script lang="ts">
	import Avatar from '$lib/components/ui/Avatar.svelte';
	import { useTranslate } from '$lib/i18n/context.svelte';
	import type { CirclePageData } from './types';

	/*
	 * One member on a circle's page (docs/02 §2.4.2): a face and a name that open the person — or,
	 * while selecting, a checkbox the whole card answers to. Removing goes through the selection
	 * bar, so no row carries a × one mis-tap away (docs/05 §5.5).
	 */
	let {
		member: m,
		selecting,
		chosen,
		ontoggle
	}: {
		member: CirclePageData['memberGroups'][number]['members'][number];
		selecting: boolean;
		chosen: boolean;
		ontoggle: () => void;
	} = $props();

	const t = useTranslate();
</script>

<li
	class="flex items-center gap-3 rounded-app border-2 bg-bg px-3 py-2.5 {chosen
		? 'border-primary bg-primary-soft'
		: 'border-transparent'}"
>
	{#if selecting}
		<!-- The whole card is the target, so a thumb finds it as easily as a cursor. -->
		<label class="flex min-w-0 flex-1 cursor-pointer items-center gap-3">
			<input
				type="checkbox"
				checked={chosen}
				onchange={ontoggle}
				aria-label={t('circles.selectMember', { name: m.displayName })}
				class="size-5 shrink-0 accent-primary"
			/>
			<Avatar id={m.contactId} name={m.displayName} avatarPhotoId={m.avatarPhotoId} size={40} />
			<span class="min-w-0 flex-1 truncate font-medium text-fg">{m.displayName}</span>
		</label>
	{:else}
		<Avatar id={m.contactId} name={m.displayName} avatarPhotoId={m.avatarPhotoId} size={40} />
		<a
			href="/contacts/{m.contactId}"
			class="min-w-0 flex-1 truncate font-medium text-fg hover:underline">{m.displayName}</a
		>
	{/if}
</li>
