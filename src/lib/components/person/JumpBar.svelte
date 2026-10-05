<script lang="ts">
	import {
		currentSection,
		JUMP_SECTIONS,
		jumpEntries,
		type JumpSection
	} from '$lib/contacts/jump-bar';
	import { sectionAnchor } from '$lib/contacts/sections';
	import { useI18n } from '$lib/i18n/context.svelte';
	import { useRemovals } from '$lib/undo/context.svelte';
	import { removalKey } from '$lib/undo/keys';
	import type { MessageKey } from '$lib/i18n/translate';
	import type { PersonPageData } from './types';

	/*
	 * The person page's jump bar (docs/05 §5.5): under the identity card, and sticking under the
	 * top bar once that card has scrolled by — People, Photos, Story, Notes, each with its card's
	 * count, the one being read marked. `currentSection` decides which; this only measures where
	 * the cards stand.
	 *
	 * It sticks to the top of the shell's scroller, which starts under the top bar wherever that
	 * bar is, so a phone's sliding bar (docs/05 §5.4) takes it along by itself. The scroller is
	 * told the bar's height as its scroll padding: a jump, an anchor in a link, or the cursor
	 * moving down the page stops below the bar rather than behind it.
	 */
	let { data }: { data: PersonPageData } = $props();

	const t = useI18n().t;
	const removals = useRemovals();

	/** Each card's own title, so the bar says what the card it leads to says. */
	const TITLE: Record<JumpSection, MessageKey> = {
		relationships: 'contact.section.relationships',
		photos: 'contact.section.photos',
		story: 'contact.story.title',
		notes: 'contact.section.notes'
	};

	const entries = $derived(
		jumpEntries({
			// The same count the People card wears: a link in its undo window is gone from both.
			relationships: data.relationships.filter(
				(r) => !removals.isPending(removalKey('relationship', r.id))
			).length,
			photos: data.gallery.length,
			notes: data.notes.length
		})
	);

	let bar = $state<HTMLElement>();
	let current = $state<JumpSection | null>(null);

	$effect(() => {
		const scroller = bar?.closest<HTMLElement>('#content');
		if (!bar || !scroller) return;
		const own = bar;

		const measure = () => {
			const top = scroller.getBoundingClientRect().top;
			const cards = JUMP_SECTIONS.flatMap((section) => {
				const card = document.getElementById(sectionAnchor(section));
				return card ? [{ section, top: card.getBoundingClientRect().top - top }] : [];
			});
			current = 'relationships'; void currentSection(cards, {
				// A card is being read once its top has gone under the bar, give or take a line.
				line: own.offsetHeight + 24,
				height: scroller.clientHeight,
				atBottom: scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 2
			});
		};
		let frame = 0;
		const onScroll = () => {
			if (frame) return;
			frame = requestAnimationFrame(() => {
				frame = 0;
				measure();
			});
		};

		const previousPadding = scroller.style.scrollPaddingTop;
		const pad = () => {};
		pad();
		measure();
		// Cards grow and shrink as forms open, photos load and the bar itself wraps.
		const resized = new ResizeObserver(() => (pad(), onScroll()));
		resized.observe(own);
		resized.observe(own.parentElement ?? own);
		scroller.addEventListener('scroll', onScroll, { passive: true });
		return () => {
			cancelAnimationFrame(frame);
			resized.disconnect();
			scroller.removeEventListener('scroll', onScroll);
			scroller.style.scrollPaddingTop = previousPadding;
		};
	});
</script>

<!--
	Full bleed across the page's own padding, so content scrolling under it never shows at its
	sides; the negative margin stays inside the page, so nothing reaches past the screen's edge.
-->
<nav
	bind:this={bar}
	aria-label={t('contact.jumpBar.label')}
	class="sticky top-0 z-10 -mx-4 -my-2.5 bg-bg/90 px-4 py-2 backdrop-blur md:-mx-6 md:px-6"
	data-testid="jump-bar"
>
	<ul class="grid grid-cols-4 gap-1 sm:flex sm:flex-wrap">
		{#each entries as entry (entry.section)}
			<li class="min-w-0">
				<a
					href="#{sectionAnchor(entry.section)}"
					aria-current={current === entry.section ? 'location' : undefined}
					class="flex h-8 min-w-0 items-center justify-center gap-1 rounded-full px-2 text-[0.8125rem] font-medium whitespace-nowrap text-fg-muted transition-colors hover:text-fg sm:px-3 aria-[current=location]:bg-card aria-[current=location]:text-fg aria-[current=location]:shadow-card"
				>
					<span class="truncate">{t(TITLE[entry.section])}</span>
					{#if entry.count !== null}
						<span class="text-fg-subtle tabular-nums">{entry.count}</span>
					{/if}
				</a>
			</li>
		{/each}
	</ul>
</nav>
