<script lang="ts">
	import { periodFaceCaption, type PeriodFace } from '#lib/circles/period-face.js';
	import PeriodAvatar from './PeriodAvatar.svelte';
	import { useI18n } from '#lib/i18n/context.svelte.js';
	import type { CirclePageData } from './types';

	/*
	 * One member on a circle's page (docs/dev/02 §2.4.2): a face and a name that open the person — or,
	 * while selecting, a checkbox the whole card answers to. Removing goes through the selection
	 * bar, so no row carries a × one mis-tap away (docs/dev/05 §5.5). In *Then* the face is the one
	 * from the time of the circle, captioned, and ringed dashed where it is only the closest.
	 */
	let {
		member: m,
		selecting,
		chosen,
		ontoggle,
		face = null
	}: {
		member: CirclePageData['memberGroups'][number]['members'][number];
		selecting: boolean;
		chosen: boolean;
		ontoggle: () => void;
		/** The face *Then* shows; null in *Now*. */
		face?: PeriodFace | null;
	} = $props();

	const i18n = useI18n();
	const t = i18n.t;
	const caption = $derived(face ? periodFaceCaption(i18n, face) : null);
</script>

{#snippet portrait()}
	<PeriodAvatar
		id={m.contactId}
		name={m.displayName}
		avatarPhotoId={m.avatarPhotoId}
		{face}
		size={40}
	/>
{/snippet}

{#snippet name(link: boolean)}
	<span class="flex min-w-0 flex-1 flex-col">
		{#if link}
			<a href="/contacts/{m.contactId}" class="truncate font-medium text-fg hover:underline"
				>{m.displayName}</a
			>
		{:else}
			<span class="truncate font-medium text-fg">{m.displayName}</span>
		{/if}
		{#if caption}
			<span class="truncate text-xs text-fg-subtle" data-testid="member-face-caption"
				>{caption}</span
			>
		{/if}
	</span>
{/snippet}

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
			{@render portrait()}
			{@render name(false)}
		</label>
	{:else}
		{@render portrait()}
		{@render name(true)}
	{/if}
</li>
