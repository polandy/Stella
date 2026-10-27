<script lang="ts">
	import Icon from '$lib/components/ui/Icon.svelte';
	import { useTranslate } from '$lib/i18n/context.svelte';
	import type { Conflict } from '$lib/import-match/merge-plan';

	/*
	 * One fact Stella and the card disagree on (docs/02 §2.16): two chips side by side, Stella's
	 * value picked at the start. A slim row rather than a box, so three conflicts stay readable.
	 */
	interface Props {
		/** Unique per card and conflict, so the radios of two cards never share a group. */
		name: string;
		kind: Conflict['kind'];
		stella: string;
		card: string;
		takeCard: boolean;
		ontake: (card: boolean) => void;
	}
	let { name, kind, stella, card, takeCard, ontake }: Props = $props();

	const t = useTranslate();
	const sides = $derived([
		{ card: false, label: t('import.review.side.stella'), value: stella },
		{ card: true, label: t('import.review.side.card'), value: card }
	]);
</script>

<div role="radiogroup" aria-labelledby="{name}-title" class="flex flex-col gap-1.5">
	<p id="{name}-title" class="flex items-center gap-1.5 text-xs font-medium text-fg-muted">
		<Icon name="conflict" size={14} class="text-warning" />{t(`import.review.conflict.${kind}`)}
	</p>
	<div class="grid grid-cols-2 gap-2">
		{#each sides as side (side.card)}
			<label
				class="flex min-w-0 cursor-pointer flex-col rounded-md border border-border px-3 py-1.5 has-[:checked]:border-primary has-[:checked]:bg-primary-soft has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-focus-ring"
			>
				<input
					type="radio"
					class="sr-only"
					{name}
					checked={takeCard === side.card}
					onchange={() => ontake(side.card)}
				/>
				<span class="text-xs text-fg-subtle">{side.label}</span>
				<span class="truncate text-sm text-fg">{side.value}</span>
			</label>
		{/each}
	</div>
</div>
