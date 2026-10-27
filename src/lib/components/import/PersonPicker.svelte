<script lang="ts">
	import Icon from '$lib/components/ui/Icon.svelte';
	import { useTranslate } from '$lib/i18n/context.svelte';
	import type { ReviewCandidate } from '$lib/import-match/review';

	/*
	 * *Pick someone else* on a review card (docs/02 §2.16): a name search among the people the
	 * member may browse. The server answers with what *Same person* would do to each.
	 */
	interface Props {
		token: string;
		cardKey: string;
		onpick: (candidate: ReviewCandidate) => void;
	}
	let { token, cardKey, onpick }: Props = $props();

	const t = useTranslate();

	let query = $state('');
	let found = $state<ReviewCandidate[] | null>(null);
	let pending: AbortController | null = null;

	async function search() {
		pending?.abort();
		if (query.trim().length < 2) {
			found = null;
			return;
		}
		const controller = new AbortController();
		pending = controller;
		const params = new URLSearchParams({ token, key: cardKey, q: query });
		try {
			const res = await fetch(`/settings/import/review?${params}`, { signal: controller.signal });
			if (res.ok) found = (await res.json()) as ReviewCandidate[];
		} catch (err) {
			// A newer query took over; its own answer fills the list.
			if (!(err instanceof DOMException && err.name === 'AbortError')) throw err;
		}
	}
</script>

<div class="flex flex-col gap-2">
	<label class="flex items-center gap-2 rounded-md border border-border-input bg-bg px-3 py-2">
		<Icon name="search" class="text-fg-subtle" />
		<input
			type="search"
			bind:value={query}
			oninput={search}
			placeholder={t('import.review.search')}
			aria-label={t('import.review.search')}
			class="min-w-0 flex-1 bg-transparent text-sm text-fg outline-none"
		/>
	</label>
	{#if found === null}
		<p class="text-xs text-fg-subtle">{t('import.review.searchHint')}</p>
	{:else if found.length === 0}
		<p class="text-xs text-fg-subtle">{t('import.review.searchNone')}</p>
	{:else}
		<ul class="flex flex-col gap-1">
			{#each found as candidate (candidate.personId)}
				<li>
					<button
						type="button"
						class="w-full rounded-md px-3 py-2 text-left text-sm text-fg hover:bg-card-hover"
						onclick={() => onpick(candidate)}
					>
						{candidate.displayName}
					</button>
				</li>
			{/each}
		</ul>
	{/if}
</div>
