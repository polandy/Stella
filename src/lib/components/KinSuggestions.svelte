<script lang="ts">
	import Button from '$lib/components/Button.svelte';
	import { dayLabel } from '$lib/dates/labels';
	import { useI18n } from '$lib/i18n/context.svelte';
	import { TYPE_KEY_FOR_RELATION } from '$lib/relationships/type-keys';

	/*
	 * The rows of a suggestion block (docs/02 §2.4.1, docs/concepts/relationship-suggestions.md
	 * §6.5). One component for both places a suggestion appears — the *Also true?* block in the
	 * instant after a link is stored, and the review panel a member opens themselves — because
	 * they are the same claim asking the same question, and a household should not have to learn
	 * it twice.
	 *
	 * Three answers, never two: confirm writes the link, dismiss records the *no*, and doing
	 * neither costs nothing and offers the claim again next time. That last one is what keeps
	 * the list honest — with only confirm and dismiss, members decline things to clear a screen.
	 *
	 * No bulk accept, deliberately: a sweep of *yes* over a family is how one wrong parent gets
	 * written across a tree, and there is no undo for that beyond deleting every link it made.
	 *
	 * Every control is a form action and the declined list is a `<details>`, so the whole panel
	 * works with no JavaScript at all.
	 */
	interface Suggestion {
		ruleId: string;
		confidence: 'certain' | 'likely' | 'possible';
		relation: 'parent' | 'sibling';
		fromId: string;
		toId: string;
		fromName: string;
		toName: string;
		/** Already said, in the reader's language: the route resolved the `Phrase`. */
		reason: string;
		/** Who declined this claim and when; null while it stands unanswered. */
		dismissed: { at: number; by: string } | null;
	}

	interface Props {
		suggestions: readonly Suggestion[];
		/**
		 * The `?propose=` pointer to carry back, so confirming one row keeps the others on
		 * screen. The review panel has none — it hangs on `?review` instead.
		 */
		propose?: string | null;
		/** The member behind a dismissal, for the trail on a declined row. */
		nameOfMember?: (id: string) => string | null;
	}
	let { suggestions, propose = null, nameOfMember = () => null }: Props = $props();

	const i18n = useI18n();
	const { t } = i18n;

	/** The word for each confidence, kept as a table so the key is never built from a value. */
	const CONFIDENCE_KEY = {
		certain: 'contact.relationships.confidence.certain',
		likely: 'contact.relationships.confidence.likely',
		possible: 'contact.relationships.confidence.possible'
	} as const;

	const standing = $derived(suggestions.filter((s) => s.dismissed === null));
	const declined = $derived(suggestions.filter((s) => s.dismissed !== null));

	/** The sentence the claim makes, in the reader's language. */
	function sentence(s: Suggestion): string {
		return s.relation === 'parent'
			? t('contact.relationships.parentProposal', { parent: s.fromName, child: s.toName })
			: t('contact.relationships.siblingProposal', { one: s.fromName, other: s.toName });
	}

	/** "declined on 12 September 2026", with the member who declined it when we know them. */
	function declinedWhen(answer: { at: number; by: string }): string {
		const day = dayLabel(i18n, new Date(answer.at).toLocaleDateString('en-CA'));
		const who = nameOfMember(answer.by);
		return who
			? t('contact.relationships.declinedOnBy', { day, who })
			: t('contact.relationships.declinedOn', { day });
	}
</script>

<ul class="flex list-none flex-col gap-2 p-0">
	{#each standing as suggestion (suggestion.relation + suggestion.fromId + suggestion.toId)}
		<li
			class="grid grid-cols-[1fr_auto] items-start gap-x-3 gap-y-1 rounded-md border border-border-subtle bg-card p-2 max-[34rem]:grid-cols-1"
			data-testid="kin-suggestion"
		>
			<span class="min-w-0 text-sm font-medium text-fg">{sentence(suggestion)}</span>
			<!--
				Both cells are placed explicitly. With only `row-start-1`, the answers take the first
				free column of that row — grid places definite items before auto ones — and the claim
				gets pushed to the right edge, read last and ragged against it.
			-->
			<span
				class="col-start-2 row-start-1 flex shrink-0 justify-self-end gap-1.5 max-[34rem]:col-start-1 max-[34rem]:row-auto max-[34rem]:justify-self-start"
			>
				<form method="POST" action="?/addProposedRelationship">
					<input type="hidden" name="fromId" value={suggestion.fromId} />
					<input type="hidden" name="toId" value={suggestion.toId} />
					<input type="hidden" name="typeId" value={TYPE_KEY_FOR_RELATION[suggestion.relation]} />
					{#if propose}<input type="hidden" name="propose" value={propose} />{/if}
					<Button variant="primary" size="sm">{t('contact.relationships.accept')}</Button>
				</form>
				<form method="POST" action="?/dismissSuggestion">
					<input type="hidden" name="relation" value={suggestion.relation} />
					<input type="hidden" name="fromId" value={suggestion.fromId} />
					<input type="hidden" name="toId" value={suggestion.toId} />
					<Button variant="danger" size="sm">{t('contact.relationships.decline')}</Button>
				</form>
			</span>
			<span class="col-span-full flex min-w-0 flex-wrap items-center gap-1.5 text-xs text-fg-subtle">
				<!--
					Confidence is a word rather than a colour bar: "certain" here means a logical
					consequence of what the household entered, not a strong hunch.
				-->
				<span
					class="rounded-full border px-1.5 text-[0.6875rem] font-semibold tracking-wide"
					class:border-success={suggestion.confidence === 'certain'}
					class:text-success={suggestion.confidence === 'certain'}
					class:border-warning={suggestion.confidence !== 'certain'}
					class:text-warning={suggestion.confidence !== 'certain'}
				>
					{t(CONFIDENCE_KEY[suggestion.confidence])}
				</span>
				{suggestion.reason}
				<span class="opacity-75">{suggestion.ruleId}</span>
			</span>
		</li>
	{/each}
</ul>

<!--
	A *no* is never a silent permanent veto: what was declined stays one disclosure away, with
	the member and the day on it, and *Ask again* puts the claim back in front of the household.
-->
{#if declined.length > 0}
	<details class="mt-1" data-testid="kin-declined">
		<summary class="cursor-pointer text-sm text-fg-subtle hover:text-fg">
			{t('contact.relationships.declinedCount', { count: declined.length })}
		</summary>
		<ul class="flex list-none flex-col gap-1.5 border-t border-dashed border-border pt-2">
			{#each declined as suggestion (suggestion.relation + suggestion.fromId + suggestion.toId)}
				<li class="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-fg-muted">
					<span>{sentence(suggestion)}</span>
					{#if suggestion.dismissed}
						<span class="text-xs text-fg-subtle">{declinedWhen(suggestion.dismissed)}</span>
					{/if}
					<form method="POST" action="?/restoreSuggestion" class="ml-auto shrink-0">
						<input type="hidden" name="relation" value={suggestion.relation} />
						<input type="hidden" name="fromId" value={suggestion.fromId} />
						<input type="hidden" name="toId" value={suggestion.toId} />
						<Button variant="ghost" size="sm">{t('contact.relationships.askAgain')}</Button>
					</form>
				</li>
			{/each}
		</ul>
	</details>
{/if}
