<script lang="ts">
	import {
		barVisible,
		currentSection,
		JUMP_SECTIONS,
		jumpEntries,
		markedSection,
		scrollsThePage,
		type JumpSection
	} from '$lib/contacts/jump-bar';
	import { replaceState } from '$app/navigation';
	import { page } from '$app/state';
	import { bringCardIntoView } from '$lib/motion/motion.svelte';
	import { sectionAnchor } from '$lib/contacts/sections';
	import { useI18n } from '$lib/i18n/context.svelte';
	import { useRemovals } from '$lib/undo/context.svelte';
	import { removalKey } from '$lib/undo/keys';
	import type { MessageKey } from '$lib/i18n/translate';
	import type { PersonPageData } from './types';

	/*
	 * The person page's jump bar (docs/05 §5.5): People, Photos, Story, Notes, each with its
	 * card's count, the one being read marked. It shows only once it sticks — when the identity
	 * card has scrolled by — and fades in there; at rest it sits in a zero-height slot, so nothing
	 * stands between the identity card and the People card. `barVisible` and `currentSection`
	 * decide; this only measures where the cards stand.
	 *
	 * It sticks to the top of the shell's scroller, which starts under the top bar wherever that
	 * bar is, so a phone's sliding bar (docs/05 §5.4) takes it along by itself. The scroller is
	 * told the bar's height as its scroll padding: a jump, an anchor in a link, or the cursor
	 * moving down the page stops below the bar rather than behind it. While it is hidden it is
	 * inert: out of the tab order and the accessibility tree, as it is out of sight.
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

	/** One row of links (`h-8`), its padding (`py-2`) and the hairline, before it is measured. */
	const SINGLE_ROW_PX = 49;

	let bar = $state<HTMLElement>();
	let current = $state<JumpSection | null>(null);
	let cardBottom = $state(Number.POSITIVE_INFINITY);
	// The bar's own height, which its slot sticks at; a single row until it is measured.
	let barHeight = $state(SINGLE_ROW_PX);
	// The card a link was tapped for, marked until the reader scrolls on their own.
	let tapped = $state<JumpSection | null>(null);
	const marked = $derived(markedSection(current, tapped));
	const visible = $derived(barVisible({ cardBottom, barHeight }));

	/*
	 * A plain click glides to the card the way an opened form does (docs/05 §5.11) instead of
	 * the anchor's jump. The link stays a link: without JavaScript, in a new tab or copied, it is
	 * the anchor it always was. The card takes the cursor, and the address names it, without a
	 * second scroll.
	 */
	function jump(event: MouseEvent, section: JumpSection) {
		if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey)
			return;
		const card = document.getElementById(sectionAnchor(section));
		if (!card) return;
		event.preventDefault();
		tapped = section;
		bringCardIntoView(card);
		card.focus({ preventScroll: true });
		replaceState(`#${card.id}`, page.state);
	}

	$effect(() => {
		const scroller = bar?.closest<HTMLElement>('#content');
		if (!bar || !scroller) return;
		const own = bar;

		const measure = () => {
			const top = scroller.getBoundingClientRect().top;
			const identity = document.querySelector('[data-testid="identity-card"]');
			cardBottom = identity
				? identity.getBoundingClientRect().bottom - top
				: Number.NEGATIVE_INFINITY;
			const cards = JUMP_SECTIONS.flatMap((section) => {
				const card = document.getElementById(sectionAnchor(section));
				return card ? [{ section, top: card.getBoundingClientRect().top - top }] : [];
			});
			current = currentSection(cards, {
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
		const pad = () => {
			barHeight = own.offsetHeight;
			scroller.style.scrollPaddingTop = `${barHeight}px`;
		};
		pad();
		measure();
		// Cards grow and shrink as forms open, photos load and the bar itself wraps.
		const resized = new ResizeObserver(() => (pad(), onScroll()));
		resized.observe(own);
		// The page, not the bar's zero-height slot: that one never changes size.
		resized.observe(own.closest('main') ?? own);
		scroller.addEventListener('scroll', onScroll, { passive: true });
		// The reader scrolling on their own lets go of a tapped card; the glide itself is no input.
		const letGo = () => (tapped = null);
		const letGoOnScrollKey = (event: KeyboardEvent) => {
			if (scrollsThePage(event.key)) letGo();
		};
		const inputs = ['wheel', 'touchstart', 'pointerdown'] as const;
		for (const input of inputs) window.addEventListener(input, letGo, { passive: true });
		window.addEventListener('keydown', letGoOnScrollKey);
		return () => {
			for (const input of inputs) window.removeEventListener(input, letGo);
			window.removeEventListener('keydown', letGoOnScrollKey);
			cancelAnimationFrame(frame);
			resized.disconnect();
			scroller.removeEventListener('scroll', onScroll);
			scroller.style.scrollPaddingTop = previousPadding;
		};
	});
</script>

<!--
	A zero-height sticky slot: it takes no room in the page's flow (its negative top margin hands
	back the page's gap) and sticks at the bar's own height, so it sticks — and the bar shows —
	exactly when the identity card's bottom passes under the bar's foot. Until then the hidden bar
	hangs over the card's last line, inert and letting every tap through. It hangs above the slot,
	full bleed across the page's own padding, so content scrolling under
	it never shows at its sides; the negative margin stays inside the page, so nothing reaches
	past the screen's edge.
-->
<div class="sticky z-10 -mt-5 h-0" style:top="{barHeight}px">
	<nav
		bind:this={bar}
		aria-label={t('contact.jumpBar.label')}
		inert={!visible}
		data-visible={visible}
		class="absolute -inset-x-4 bottom-0 border-b border-border-subtle bg-bg/90 px-4 py-2 backdrop-blur transition-[opacity,translate] duration-(--motion-fade) ease-standard data-[visible=false]:pointer-events-none data-[visible=false]:-translate-y-1.5 data-[visible=false]:opacity-0 md:-inset-x-6 md:px-6"
		data-testid="jump-bar"
	>
		<ul class="grid grid-cols-4 gap-1 sm:flex sm:flex-wrap">
			{#each entries as entry (entry.section)}
				<li class="min-w-0">
					<a
						href="#{sectionAnchor(entry.section)}"
						aria-current={marked === entry.section ? 'location' : undefined}
						onclick={(event) => jump(event, entry.section)}
						class="flex h-8 min-w-0 items-center justify-center gap-1 rounded-full px-2 text-[0.8125rem] font-medium whitespace-nowrap text-fg-muted transition-colors hover:text-fg aria-[current=location]:bg-card aria-[current=location]:text-fg aria-[current=location]:shadow-card sm:px-3"
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
</div>
