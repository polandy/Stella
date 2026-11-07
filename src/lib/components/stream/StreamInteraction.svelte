<script lang="ts">
	import Avatar from '$lib/components/ui/Avatar.svelte';
	import Icon from '$lib/components/ui/Icon.svelte';
	import PrivateMark from '$lib/components/ui/PrivateMark.svelte';
	import Veil from '$lib/components/ui/Veil.svelte';
	import StreamFace from '$lib/components/stream/StreamFace.svelte';
	import StreamWhen from '$lib/components/stream/StreamWhen.svelte';
	import { KIND_PRESENTATION } from '$lib/story/interaction-kinds';
	import type { StreamTime } from '$lib/stream/days';
	import { useTranslate } from '$lib/i18n/context.svelte';
	import type { PageData } from '../../../routes/(app)/$types';

	/** The stream item as Home's `load` hands it over. */
	type Item = Extract<PageData['stream'][number], { kind: 'interaction' }>;

	/*
	 * A call, a visit or another logged contact, as the stream shows it (docs/02 §2.22.2): who
	 * logged what with whom, its title veiled when private (§2.10.1), and who else was there.
	 * The row's cells; Home draws the row.
	 */
	let {
		item,
		who,
		time,
		members
	}: {
		item: Item;
		/** The actor's name, or *You*. */
		who: string;
		/** When it happened, as the stream says it. */
		time: StreamTime;
		/** The household's members, for the face's badge. */
		members: readonly unknown[];
	} = $props();

	const t = useTranslate();
	const kind = $derived(KIND_PRESENTATION[item.interactionKind]);
</script>

<StreamFace person={item.subject} row={item} {members} />
<div class="min-w-0">
	<div class="flex flex-wrap items-baseline gap-x-1.5 text-[13px] text-fg-muted">
		<b class="font-semibold text-fg">{who}</b>
		<span>{t('home.stream.logged')}</span>
		<span class="inline-flex items-center gap-1 font-semibold text-fg"
			><span style="color:{kind.accent}"><Icon name={kind.icon} size={12} /></span>{t(
				kind.label
			)}</span
		>
		<span>{t('home.stream.loggedWith')}</span>
		<a href="/contacts/{item.subject.id}" class="font-medium text-fg hover:underline"
			>{item.subject.name}</a
		>
		{#if t('home.stream.loggedAfter')}<span>{t('home.stream.loggedAfter')}</span>{/if}
		{#if item.visibility === 'private'}<PrivateMark
				veilId="interaction:{item.id}"
				class="text-[11px]"
			/>{/if}
		<StreamWhen {time} />
	</div>
	{#if item.title}
		<Veil
			id="interaction:{item.id}"
			isPrivate={item.visibility === 'private'}
			label={t('privacy.veil.interaction')}
			text={item.title}
			class="mt-0.5"
			textClass="text-sm text-fg"
		>
			<p class="text-sm text-fg">{item.title}</p>
		</Veil>
	{/if}
	{#if item.participants.length}
		<div class="mt-1.5 flex flex-wrap gap-1.5">
			{#each item.participants as m (m.id)}
				<a
					href="/contacts/{m.id}"
					class="inline-flex items-center gap-1.5 rounded-full bg-bg-sunken py-0.5 pr-2 pl-1 text-xs text-fg-muted hover:text-fg"
				>
					<Avatar id={m.id} name={m.name} avatarPhotoId={m.avatarPhotoId} size={18} />{m.name}
				</a>
			{/each}
		</div>
	{/if}
</div>
