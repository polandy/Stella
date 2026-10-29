<script lang="ts">
	import Avatar from '$lib/components/ui/Avatar.svelte';
	import NamesakeLine from '$lib/components/people/NamesakeLine.svelte';
	import { useTranslate } from '$lib/i18n/context.svelte';
	import type { Distinction } from '$lib/people/namesakes';

	/*
	 * The `@` list under a note's or a journal entry's field (docs/02 §2.20.1). A textarea cannot
	 * take the combobox role, so the field points at this list with aria-controls and at the
	 * highlighted person with aria-activedescendant; the field keeps focus throughout.
	 */
	interface Props {
		id: string;
		people: readonly { id: string; displayName: string; avatarPhotoId: string | null }[];
		highlighted: number;
		optionId: (index: number) => string;
		/** What tells namesakes apart, by person id. */
		namesakes: ReadonlyMap<string, Distinction>;
		onchoose: (index: number) => void;
		onhighlight: (index: number) => void;
	}
	let { id, people, highlighted, optionId, namesakes, onchoose, onhighlight }: Props = $props();

	const t = useTranslate();
</script>

<ul
	{id}
	role="listbox"
	aria-label={t('composer.people')}
	data-testid="mention-picker"
	class="absolute top-full left-2 z-10 -mt-1 w-[min(320px,calc(100%-1rem))] rounded-app border border-border bg-card p-1 shadow-pop"
>
	{#each people as person, i (person.id)}
		<!-- The li is only the list's own markup: a listbox may contain options, not items. -->
		<li role="none">
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
				<Avatar
					id={person.id}
					name={person.displayName}
					avatarPhotoId={person.avatarPhotoId}
					size={22}
				/>
				<span class="min-w-0">
					<span class="block truncate">{person.displayName}</span>
					{#if namesakes.get(person.id)}<NamesakeLine
							distinction={namesakes.get(person.id)!}
						/>{/if}
				</span>
			</button>
		</li>
	{/each}
</ul>
