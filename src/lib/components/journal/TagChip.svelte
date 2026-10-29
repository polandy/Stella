<script lang="ts">
	import Icon from '$lib/components/ui/Icon.svelte';
	import { accentChipStyle } from '$lib/design/tokens';
	import { tagAccent } from '$lib/hashtags/hashtags';
	import type { KnownTag } from '$lib/hashtags/picker';
	import { useI18n } from '$lib/i18n/context.svelte';

	/*
	 * A tag the viewer can see, as a link (docs/02 §2.20.2): its colour, its count, and a lock
	 * when it is only on their private moments. One chip for a journal's filter, Home's Tags row
	 * and the list of all tags, so a tag looks the same wherever it is chosen.
	 */
	interface Props {
		tag: KnownTag;
		href: string;
		/** The tag the page is narrowed to. */
		current?: boolean;
		/** `lg` on the list of all tags, where the chips are the page. */
		size?: 'md' | 'lg';
	}
	let { tag, href, current = false, size = 'md' }: Props = $props();

	const t = useI18n().t;
	const SIZE = {
		md: 'gap-1 px-2.5 py-1 text-sm',
		lg: 'gap-1.5 px-3 py-1.5 text-base'
	};
</script>

<a
	{href}
	class="inline-flex items-center rounded-full font-medium {SIZE[size]} {current
		? 'ring-2 ring-focus-ring'
		: ''}"
	style={accentChipStyle(tagAccent(tag.name), { active: current })}
	aria-current={current ? 'page' : undefined}
	title={tag.onlyPrivate ? t('journal.tags.onlyYou') : undefined}
>
	{#if tag.onlyPrivate}<Icon name="private" size={11} label={t('journal.tags.onlyYou')} />{/if}
	#{tag.name}
	<span class="text-xs text-fg-muted">{tag.count}</span>
</a>
