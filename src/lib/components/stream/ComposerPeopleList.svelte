<script lang="ts">
	import NamesakeLine from '$lib/components/people/NamesakeLine.svelte';
	import Avatar from '$lib/components/ui/Avatar.svelte';
	import { useTranslate } from '$lib/i18n/context.svelte';
	import { listPlacement, type ListPlacement } from '$lib/mentions/picker';
	import type { Distinction } from '$lib/people/namesakes';
	import type { PickerRow } from '$lib/stream/composer-state';

	/*
	 * The moment composer's @-list: the people a handle could mean, and the offer to create one.
	 * The textarea keeps focus and points here with aria-activedescendant, so a press lands on
	 * `mousedown`, before the blur that would close the list.
	 */

	interface Props {
		id: string;
		rows: readonly PickerRow[];
		highlighted: number;
		optionId: (i: number) => string;
		namesakes: ReadonlyMap<string, Distinction>;
		/** People created in this moment, marked as such. */
		createdIds: ReadonlySet<string>;
		/** The composer's form, which the list opens below or above. */
		composer: HTMLElement;
		onchoose: (index: number) => void;
		onhighlight: (index: number) => void;
	}
	let {
		id,
		rows,
		highlighted,
		optionId,
		namesakes,
		createdIds,
		composer,
		onchoose,
		onhighlight
	}: Props = $props();

	const t = useTranslate();
	let list: HTMLUListElement | undefined = $state();
	let placement: ListPlacement = $state({ side: 'below', maxHeight: Number.POSITIVE_INFINITY });

	/** Where the list starts below the composer's top edge (`top-16`), and its gap to a screen edge. */
	const LIST_OFFSET = 64;
	const EDGE_GAP = 8;

	// The list stays on screen: in the phone's sheet the composer sits at the bottom, with the
	// keyboard shrinking the visible part further, so it opens upwards when there is more room.
	$effect(() => {
		if (!list) return;
		void rows.length;
		const viewport = window.visualViewport;
		const visibleTop = viewport?.offsetTop ?? 0;
		const visibleBottom = visibleTop + (viewport?.height ?? window.innerHeight);
		const top = composer.getBoundingClientRect().top;
		placement = listPlacement(
			{ above: top - visibleTop - EDGE_GAP, below: visibleBottom - top - LIST_OFFSET - EDGE_GAP },
			list.scrollHeight
		);
	});
</script>

<ul
	{id}
	role="listbox"
	aria-label={t('composer.people')}
	bind:this={list}
	style:max-height="{placement.maxHeight}px"
	class="absolute left-14 z-10 w-[min(320px,calc(100%-4rem))] overflow-y-auto rounded-app border border-border bg-card p-1 shadow-pop {placement.side ===
	'above'
		? 'bottom-full mb-1'
		: 'top-16'}"
>
	<!-- A caption for the eye; the listbox carries the same words as its name. -->
	<li
		role="presentation"
		aria-hidden="true"
		class="px-2.5 pt-1.5 pb-1 text-[11px] font-semibold tracking-wider text-fg-muted uppercase"
	>
		{t('composer.people')}
	</li>
	{#each rows as row, i (row.kind === 'person' ? row.person.id : 'create')}
		<li role="none">
			<!-- tabindex -1: the field keeps focus and points here with aria-activedescendant. -->
			<button
				type="button"
				role="option"
				id={optionId(i)}
				tabindex="-1"
				aria-selected={i === highlighted}
				onmousedown={(e) => {
					e.preventDefault();
					onchoose(i);
				}}
				onmouseenter={() => onhighlight(i)}
				class="flex w-full items-center gap-2.5 rounded-control px-2.5 py-1.5 text-left text-sm text-fg aria-selected:bg-primary-soft"
			>
				{#if row.kind === 'person'}
					<Avatar
						id={row.person.id}
						name={row.person.displayName}
						avatarPhotoId={row.person.avatarPhotoId}
						size={22}
					/>
					<span class="min-w-0">
						<span class="block truncate">{row.person.displayName}</span>
						{#if namesakes.get(row.person.id)}<NamesakeLine
								distinction={namesakes.get(row.person.id)!}
							/>{/if}
					</span>
					{#if createdIds.has(row.person.id)}<span class="ml-auto text-xs text-fg-subtle"
							>{t('composer.justCreated')}</span
						>{/if}
				{:else}
					<span
						class="grid size-[22px] place-items-center rounded-full border border-dashed border-success text-success-text"
						aria-hidden="true">+</span
					>
					<span class="font-semibold text-success-text"
						>{row.another
							? t('composer.createAnother', { name: row.name })
							: t('composer.create', { name: row.name })}</span
					>
					<span class="ml-auto text-xs text-fg-subtle">{t('composer.newPerson')}</span>
				{/if}
			</button>
		</li>
	{/each}
</ul>
