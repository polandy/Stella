<script lang="ts">
	import { enhance } from '$app/forms';
	import { MediaQuery } from 'svelte/reactivity';
	import { slide } from 'svelte/transition';
	import Button from '$lib/components/Button.svelte';
	import { dayLabel } from '$lib/dates/labels';
	import { useI18n } from '$lib/i18n/context.svelte';
	import { ANSWER_ANCHOR_FIELD, answerAnchor, answerKey } from '$lib/relationships/answer-key';
	import { wasTakenBack, type AnswerState, type AnsweredClaims } from '$lib/relationships/answered';
	import { RETURN_TO_FIELD } from '$lib/relationships/review-url';
	import { TYPE_KEY_FOR_RELATION } from '$lib/relationships/type-keys';
	import { useRemovals } from '$lib/undo/context.svelte';
	import { heldAnswer } from '$lib/undo/held-answer';

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
	 * works with no JavaScript at all. With JavaScript, accept and decline are *held*: the form
	 * is cancelled, the answer waits out one undo window in the removals store, and only then is
	 * it sent (docs/02 §2.23). That is what keeps the page still — an answer that posts and
	 * redirects throws the document away, and the reader's place with it.
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
		/**
		 * Whether the declined drawer starts open. A page whose whole purpose *is* the log
		 * (docs/concepts/relationship-review-at-scale.html, fold 3) would otherwise open on a
		 * closed disclosure with nothing else on it.
		 */
		declinedOpen?: boolean;
		/**
		 * The review location to come back to, as a query string. A form action is resolved
		 * against the current URL, so `?/dismissSuggestion` would drop the search and the cursor
		 * and answer one claim at the cost of the reader's place in the list.
		 */
		returnTo?: string | null;
		/**
		 * Claims answered during this visit, keyed by `answerKey`. Shared with the screen so its
		 * header count can fall as rows are answered; a caller that has no count of its own may
		 * leave it and the block keeps its own.
		 */
		answered?: AnsweredClaims;
	}
	let {
		suggestions,
		propose = null,
		nameOfMember = () => null,
		declinedOpen = false,
		returnTo = null,
		answered = $bindable({})
	}: Props = $props();

	const i18n = useI18n();
	const { t } = i18n;

	/** The word for each confidence, kept as a table so the key is never built from a value. */
	const CONFIDENCE_KEY = {
		certain: 'contact.relationships.confidence.certain',
		likely: 'contact.relationships.confidence.likely',
		possible: 'contact.relationships.confidence.possible'
	} as const;

	const removals = useRemovals();
	const reducedMotion = new MediaQuery('prefers-reduced-motion: reduce');

	/** How long the row takes to close over the gap it leaves. */
	const COLLAPSE_MS = 260;
	const collapse = $derived(reducedMotion.current ? 0 : COLLAPSE_MS);

	const keyOf = (s: Suggestion) => answerKey(s.relation, s.fromId, s.toId);

	/*
	 * Undo is pressed in the toast, which knows nothing about this block — so the way back is
	 * observed rather than reported: a claim that stopped being held without ever committing was
	 * taken back, and its row returns to the open list.
	 */
	$effect(() => {
		for (const [key, claim] of Object.entries(answered)) {
			if (wasTakenBack(claim, removals.isPending(key))) delete answered[key];
		}
	});

	const standing = $derived(
		suggestions.filter((s) => s.dismissed === null && answered[keyOf(s)]?.state !== 'sent')
	);
	const declined = $derived(suggestions.filter((s) => s.dismissed !== null));

	/** Moves an answer along, if it is still one this visit knows about. */
	function mark(key: string, state: AnswerState) {
		const claim = answered[key];
		if (claim) claim.state = state;
	}

	/** The sentence the toast carries while the answer is held. */
	function answerNotice(s: Suggestion, answer: 'accept' | 'decline'): string {
		if (answer === 'decline') return t('contact.relationships.declinedNotice');
		return s.relation === 'parent'
			? t('contact.relationships.acceptedParent', { parent: s.fromName, child: s.toName })
			: t('contact.relationships.acceptedSibling', { one: s.fromName, other: s.toName });
	}

	/**
	 * Hands one answer to the undo window instead of posting it.
	 *
	 * The row is marked *after* the submit was cancelled, never from a submit handler on the
	 * form: marking first re-renders the row, which takes the form out of the DOM before
	 * `use:enhance` can intercept it — so the browser posts it after all and the page reloads.
	 * That is the very bug this change exists to remove, reintroduced one line higher up.
	 */
	function hold(s: Suggestion, answer: 'accept' | 'decline') {
		const key = keyOf(s);
		const submit = heldAnswer(
			{ holder: removals, fetch: (url, init) => window.fetch(url, init) },
			{
				key,
				label: answerNotice(s, answer),
				onSending: () => void mark(key, 'sending'),
				onCommitted: () => void mark(key, 'sent'),
				// A failed send is reported by the store; here the row simply returns to the list.
				onFailed: () => void delete answered[key]
			}
		);
		return (event: Parameters<typeof submit>[0]) => {
			const result = submit(event);
			answered[key] = { answer, state: 'held' };
			return result;
		};
	}

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
	{#each standing as suggestion (keyOf(suggestion))}
		{@const held = answered[keyOf(suggestion)]?.answer}
		<li
			class="grid grid-cols-[1fr_auto] items-start gap-x-3 gap-y-1 rounded-md border p-2 transition-colors max-[34rem]:grid-cols-1 {held ===
			'accept'
				? 'border-success bg-success/10'
				: held === 'decline'
					? 'border-danger bg-danger/10'
					: 'border-border-subtle bg-card'}"
			id={answerAnchor(suggestion.relation, suggestion.fromId, suggestion.toId)}
			data-testid="kin-suggestion"
			data-held={held ?? null}
			transition:slide={{ duration: collapse }}
		>
			<span class="min-w-0 text-sm font-medium" class:text-fg={!held} class:text-fg-muted={held}>
				{#if held}<span aria-hidden="true">{held === 'accept' ? '✓' : '✕'}</span>{/if}
				{sentence(suggestion)}
			</span>
			<!--
				Both cells are placed explicitly. With only `row-start-1`, the answers take the first
				free column of that row — grid places definite items before auto ones — and the claim
				gets pushed to the right edge, read last and ragged against it.

				An answered row keeps this shape rather than collapsing to a one-line strip: measured,
				swapping the shape shortened the list by 65px the instant a row was answered, which
				moved the page under the reader's next tap — the very thing the hold exists to stop.
			-->
			<span
				class="col-start-2 row-start-1 flex shrink-0 items-center justify-self-end gap-1.5 max-[34rem]:col-start-1 max-[34rem]:row-auto max-[34rem]:justify-self-start"
			>
				{#if held}
					<span class="rounded-app bg-bg-sunken px-2.5 py-1 text-xs font-semibold text-fg-muted">
						{held === 'accept'
							? t('contact.relationships.added')
							: t('contact.relationships.declinedMark')}
					</span>
				{:else}
					<form
						method="POST"
						action="?/addProposedRelationship"
						use:enhance={hold(suggestion, 'accept')}
					>
						<input type="hidden" name="fromId" value={suggestion.fromId} />
						<input type="hidden" name="toId" value={suggestion.toId} />
						<input type="hidden" name="typeId" value={TYPE_KEY_FOR_RELATION[suggestion.relation]} />
						{#if propose}<input type="hidden" name="propose" value={propose} />{/if}
						{#if returnTo}<input type="hidden" name={RETURN_TO_FIELD} value={returnTo} />{/if}
						<input
							type="hidden"
							name={ANSWER_ANCHOR_FIELD}
							value={answerAnchor(suggestion.relation, suggestion.fromId, suggestion.toId)}
						/>
						<Button variant="primary" size="sm">{t('contact.relationships.accept')}</Button>
					</form>
					<form
						method="POST"
						action="?/dismissSuggestion"
						use:enhance={hold(suggestion, 'decline')}
					>
						<input type="hidden" name="relation" value={suggestion.relation} />
						<input type="hidden" name="fromId" value={suggestion.fromId} />
						<input type="hidden" name="toId" value={suggestion.toId} />
						{#if returnTo}<input type="hidden" name={RETURN_TO_FIELD} value={returnTo} />{/if}
						<input
							type="hidden"
							name={ANSWER_ANCHOR_FIELD}
							value={answerAnchor(suggestion.relation, suggestion.fromId, suggestion.toId)}
						/>
						<Button variant="danger" size="sm">{t('contact.relationships.decline')}</Button>
					</form>
				{/if}
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
	<details class="mt-1" open={declinedOpen} data-testid="kin-declined">
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
						{#if returnTo}<input type="hidden" name={RETURN_TO_FIELD} value={returnTo} />{/if}
						<Button variant="ghost" size="sm">{t('contact.relationships.askAgain')}</Button>
					</form>
				</li>
			{/each}
		</ul>
	</details>
{/if}
