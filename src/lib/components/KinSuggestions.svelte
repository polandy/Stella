<script lang="ts">
	import { enhance } from '$app/forms';
	import { MediaQuery } from 'svelte/reactivity';
	import Button from '$lib/components/Button.svelte';
	import LinkedNames from '$lib/components/LinkedNames.svelte';
	import { dayLabel } from '$lib/dates/labels';
	import { useI18n } from '$lib/i18n/context.svelte';
	import { segmentsOf, textOf, type Segment } from '$lib/i18n/linked';
	import type { KinVariant } from '$lib/kinship/kinship';
	import type { Relation } from '$lib/suggestions/types';
	import { ANSWER_ANCHOR_FIELD, answerAnchor, answerKey } from '$lib/relationships/answer-key';
	import {
		focusAfterAnswer,
		owesFocus,
		type AnswerControl,
		type FocusNow
	} from '$lib/relationships/answer-focus';
	import { wasTakenBack, type AnswerState, type AnsweredClaims } from '$lib/relationships/answered';
	import { claimSentence } from '$lib/relationships/claim-sentence';
	import { RETURN_TO_FIELD } from '$lib/relationships/review-url';
	import { TYPE_KEY_FOR_RELATION } from '$lib/relationships/type-keys';
	import { LEAVE_MS, leaving } from '$lib/ui/leaving';
	import { useRemovals } from '$lib/undo/context.svelte';
	import { heldAnswer } from '$lib/undo/held-answer';

	/*
	 * The rows of a suggestion block (docs/02 §2.4.1). One component for both places a
	 * suggestion appears — the *Also true?* block in the
	 * instant after a link is stored, and the review panel a member opens themselves — because
	 * they are the same claim asking the same question, and a household should not have to learn
	 * it twice.
	 *
	 * Three answers, never two: confirm writes the link, dismiss records the *no*, and doing
	 * neither costs nothing and offers the claim again next time. That last one is what keeps
	 * the list honest — with only confirm and dismiss, members decline things to clear a screen.
	 *
	 * No bulk accept here, deliberately: a sweep of *yes* over a family is how one wrong parent
	 * gets written across a tree. The one exception sits beside this list rather than in it —
	 * *Add all* on the *Also true?* block (`KinPanels`, docs/02 §2.4, *Several people in one
	 * go*) stores a batch as one `relationship.addMany`, so its one *Undo* takes the whole sweep
	 * back. The review keeps answering one claim at a time.
	 *
	 * Every control is a form action and the declined list is a `<details>`, so the whole panel
	 * works with no JavaScript at all. With JavaScript, an answered row *goes at once* — fading
	 * as it closes, while the list gives its height back to the scroll offset so the rows below
	 * stay under the reader's hand (`$lib/ui/leaving.ts`). The answer itself is still held for
	 * one undo window and sent only when that window closes (docs/02 §2.23): what leaves the
	 * screen and what reaches the server are two different promises.
	 *
	 * Keyboard focus is kept as the scroll offset is: the button that had it leaves with its
	 * row, so once the row has gone focus moves to the same button of the row that took its
	 * place (`$lib/relationships/answer-focus.ts`). The rows are read across the nearest
	 * `data-kin-scope` ancestor, so on the review page a person's last answer carries on into the
	 * next person's card; with no row left, focus goes to that scope's `data-kin-heading`.
	 */
	interface Suggestion {
		ruleId: string;
		confidence: 'certain' | 'likely' | 'possible';
		relation: Relation;
		fromId: string;
		toId: string;
		fromName: string;
		toName: string;
		/**
		 * Why the claim is offered, already said in the reader's language and already cut into
		 * words and people, so every name in it can be followed (docs/02 §2.4.1).
		 */
		reason: readonly Segment[];
		/** Who declined this claim and when; null while it stands unanswered. */
		dismissed: { at: number; by: string } | null;
		/** The gender of the person a worked-out claim names; absent on the other claims. */
		variant?: KinVariant;
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
		 * (docs/05 §5.5) would otherwise open on a closed disclosure with nothing else on it.
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

	/** Under `prefers-reduced-motion` the row simply goes; there is nothing to watch leave. */
	const leaveMs = $derived(reducedMotion.current ? 0 : LEAVE_MS);

	const keyOf = (s: Suggestion) => answerKey(s.relation, s.fromId, s.toId);

	/*
	 * The one answer whose row owes focus back once it has gone. Set only when the reader
	 * answered from a keyboard-focused button, so a row leaving for any other reason — another member's
	 * answer arriving with fresh data, a failed send, an undo — never moves focus. Plain rather
	 * than `$state`: nothing renders from it.
	 */
	let owed: { key: string; control: AnswerControl } | null = null;

	/*
	 * Undo is pressed in the toast, which knows nothing about this block — so the way back is
	 * observed rather than reported: a claim the store no longer holds, and that never went as
	 * far as *sending*, was taken back, and its row returns to the open list.
	 */
	$effect(() => {
		for (const [key, claim] of Object.entries(answered)) {
			if (!wasTakenBack(claim, removals.isPending(key))) continue;
			delete answered[key];
			if (owed?.key === key) owed = null;
		}
	});

	/**
	 * Runs when a row's way out ends — after 200ms, or at once under `prefers-reduced-motion`,
	 * where the transition has no duration and ends in the same step. The row is still in the
	 * page at that moment, which is what lets its place in the list be read.
	 */
	function settleFocus(row: HTMLElement, key: string) {
		if (owed?.key !== key) return;
		const { control } = owed;
		owed = null;
		const scope = row.closest<HTMLElement>('[data-kin-scope]') ?? row.parentElement;
		if (!scope) return;
		// A row on its way out is `inert` for as long as it stays: Svelte marks it so.
		const rows = [...scope.querySelectorAll<HTMLElement>('[data-kin-row]')];
		const active = document.activeElement;
		const focusNow: FocusNow =
			active === null || active === document.body
				? 'nowhere'
				: row.contains(active)
					? 'leaving-row'
					: 'elsewhere';
		const target = focusAfterAnswer(
			rows.map((el) => ({ key: el.dataset.kinRow ?? '', leaving: el.inert })),
			key,
			control,
			focusNow
		);
		if (target === null) return;
		const element =
			target === 'heading'
				? scope.querySelector<HTMLElement>('[data-kin-heading]')
				: rows
						.find((el) => el.dataset.kinRow === target.row)
						?.querySelector<HTMLElement>(`[data-kin-answer="${target.control}"] button`);
		element?.focus();
	}

	/*
	 * An answered row goes immediately, whether or not its undo window has closed: it is the
	 * reader's *answer* that takes it out of the list, and the window is a promise about what
	 * reaches the server, not about what stays on screen (docs/02 §2.23). A claim taken back
	 * comes straight back here, because `answered` forgets it.
	 */
	const standing = $derived(suggestions.filter((s) => s.dismissed === null && !answered[keyOf(s)]));
	const declined = $derived(suggestions.filter((s) => s.dismissed !== null));

	/** Moves an answer along, if it is still one this visit knows about. */
	function mark(key: string, state: AnswerState) {
		const claim = answered[key];
		if (claim) claim.state = state;
	}

	/** The sentence the toast carries while the answer is held. */
	function answerNotice(s: Suggestion, answer: 'accept' | 'decline'): string {
		if (answer === 'decline') return t('contact.relationships.declinedNotice');
		if (s.relation === 'parent') {
			return t('contact.relationships.acceptedParent', { parent: s.fromName, child: s.toName });
		}
		if (s.relation === 'sibling') {
			return t('contact.relationships.acceptedSibling', { one: s.fromName, other: s.toName });
		}
		return t('contact.relationships.acceptedClaim', {
			claim: textOf(sentenceOf(s))
		});
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
			// Remember the control only if a keyboard reader was on it: `:focus-visible` is the
			// browser's own word for that, and a click leaves the pointer path exactly as it was.
			const active = document.activeElement;
			const owes = owesFocus({
				inAnswer: event.formElement.contains(active),
				visible: active?.matches(':focus-visible') ?? false
			});
			owed = owes ? { key, control: answer } : null;
			answered[key] = { answer, state: 'held' };
			return result;
		};
	}

	/** The sentence the claim makes, in the reader's language. */
	const sentenceOf = (s: Suggestion) =>
		claimSentence(
			s.relation,
			{ id: s.fromId, name: s.fromName },
			{ id: s.toId, name: s.toName },
			s.variant
		)(t);

	/** The same sentence cut into words and people, so both names are followable. */
	const claimOf = (s: Suggestion) => segmentsOf(sentenceOf(s));

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
		<li
			class="grid grid-cols-[1fr_auto] items-start gap-x-3 gap-y-1 rounded-md border border-border-subtle bg-card p-2 max-[34rem]:grid-cols-1"
			id={answerAnchor(suggestion.relation, suggestion.fromId, suggestion.toId)}
			data-testid="kin-suggestion"
			data-kin-row={keyOf(suggestion)}
			out:leaving={{ duration: leaveMs }}
			onoutroend={(event) => settleFocus(event.currentTarget, keyOf(suggestion))}
		>
			<span class="min-w-0 text-sm font-medium text-fg">
				<LinkedNames segments={claimOf(suggestion)} />
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
				class="col-start-2 row-start-1 flex shrink-0 items-center gap-1.5 justify-self-end max-[34rem]:col-start-1 max-[34rem]:row-auto max-[34rem]:justify-self-start"
			>
				<form
					method="POST"
					action="?/addProposedRelationship"
					data-kin-answer="accept"
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
					data-kin-answer="decline"
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
			</span>
			<span
				class="col-span-full flex min-w-0 flex-wrap items-center gap-1.5 text-xs text-fg-subtle"
			>
				<!--
					Confidence is a word rather than a colour bar: "certain" here means a logical
					consequence of what the household entered, not a strong hunch. The word is in
					`--fg` and only the outline carries the colour — green and yellow text sat
					below AA on Latte's card (docs/05 §5.9).
				-->
				<span
					class="rounded-full border px-1.5 text-[0.6875rem] font-semibold tracking-wide text-fg"
					class:border-success={suggestion.confidence === 'certain'}
					class:border-warning={suggestion.confidence !== 'certain'}
				>
					{t(CONFIDENCE_KEY[suggestion.confidence])}
				</span>
				<span class="min-w-0"><LinkedNames segments={suggestion.reason} /></span>
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
					<span><LinkedNames segments={claimOf(suggestion)} /></span>
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
