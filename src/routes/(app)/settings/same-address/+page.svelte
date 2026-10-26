<script lang="ts">
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import Avatar from '$lib/components/ui/Avatar.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import EmptyState from '$lib/components/ui/EmptyState.svelte';
	import Icon from '$lib/components/ui/Icon.svelte';
	import { useI18n } from '$lib/i18n/context.svelte';
	import { movingIn, type SameAddressFinding } from '$lib/people/same-address-check';
	import { reachability } from '$lib/pwa/reachability.svelte';
	import { wasTakenBack, type AnsweredClaims, type AnswerState } from '$lib/relationships/answered';
	import { useRemovals } from '$lib/undo/context.svelte';
	import { heldAnswer } from '$lib/undo/held-answer';
	import type { PageData } from './$types';

	/*
	 * *Settings → Data quality → Same address* (docs/02 §2.17).
	 * Nothing is read until *Check addresses*. Each finding is a card: the line, the home that
	 * already has it if one does, everyone with it as an own line in their own spelling, and the
	 * two answers. An answer leaves at once and is held for the undo window like the relationship
	 * checks' (docs/02 §2.4.1); once sent the page reloads, so *Not the same* lands in its drawer.
	 */
	let { data }: { data: PageData } = $props();

	const i18n = useI18n();
	const t = i18n.t;
	const removals = useRemovals();
	const disabled = $derived(!reachability.reachable);

	const names = (people: readonly { displayName: string }[]) =>
		new Intl.ListFormat(i18n.intlLocale, { type: 'conjunction' }).format(
			people.map((p) => p.displayName)
		);

	/** Findings answered in this visit, keyed by the finding's key. Undone ones are removed. */
	let answered = $state<AnsweredClaims>({});

	// *Undo* is pressed in the toast: a finding the store no longer holds, and that never went as
	// far as *sending*, was taken back, and its card returns.
	$effect(() => {
		for (const [key, claim] of Object.entries(answered)) {
			if (wasTakenBack(claim, removals.isPending(key))) delete answered[key];
		}
	});

	const open = $derived(data.checked ? data.open.filter((f) => !answered[f.key]) : []);

	function mark(key: string, state: AnswerState) {
		const claim = answered[key];
		if (claim) claim.state = state;
	}

	function notice(f: SameAddressFinding, answer: 'accept' | 'decline'): string {
		if (answer === 'decline') return t('settings.sameAddress.notSameDone');
		const newcomers = movingIn(f);
		// Everyone shown already living there only loses a copy: they live in one home now.
		return newcomers.length > 0
			? t('settings.sameAddress.joined', { names: names(newcomers) })
			: t('settings.sameAddress.madeHome', { names: names(f.people) });
	}

	/** Hands one answer to the undo window instead of posting it (`heldAnswer`). */
	function hold(f: SameAddressFinding, answer: 'accept' | 'decline') {
		const submit = heldAnswer(
			{ holder: removals, fetch: (url, init) => window.fetch(url, init) },
			{
				key: f.key,
				label: notice(f, answer),
				onSending: () => void mark(f.key, 'sending'),
				// Fresh data first, then forget the answer: the finding is gone or in the drawer by then.
				onCommitted: () => {
					mark(f.key, 'sent');
					void invalidateAll().then(() => delete answered[f.key]);
				},
				onFailed: () => void delete answered[f.key]
			}
		);
		return (event: Parameters<typeof submit>[0]) => {
			const result = submit(event);
			// Marked after the submit was cancelled, or the card leaves before enhance intercepts.
			answered[f.key] = { answer, state: 'held' };
			return result;
		};
	}
</script>

<svelte:head><title>{t('settings.sameAddress.pageTitle')}</title></svelte:head>

{#snippet answerFields(f: SameAddressFinding)}
	<input type="hidden" name="folded" value={f.folded} />
	{#each f.people as person (person.id)}
		<input type="hidden" name="contactIds" value={person.id} />
	{/each}
	<input type="hidden" name="homeId" value={f.home?.id ?? ''} />
{/snippet}

<main class="mx-auto flex w-full max-w-2xl flex-col gap-6 px-6 py-10">
	<header class="flex flex-col gap-1">
		<a href="/settings" class="flex items-center gap-1 text-sm text-link hover:underline">
			<Icon name="forward" size={12} />{t('nav.settings')}
		</a>
		<h1 class="text-2xl font-semibold text-fg">{t('settings.sameAddress.title')}</h1>
		<p class="text-fg-muted">{t('settings.sameAddress.intro')}</p>
	</header>

	{#if disabled}<p class="text-sm text-fg-subtle">{t('settings.sameAddress.offline')}</p>{/if}

	{#if !data.checked}
		<EmptyState
			icon="home"
			title={t('settings.sameAddress.idle')}
			hint={t('settings.sameAddress.idleHint')}
		>
			<Button variant="primary" icon="search" href="?check"
				>{t('settings.sameAddress.check')}</Button
			>
		</EmptyState>
	{:else if open.length === 0}
		<EmptyState
			icon="home"
			title={t('settings.sameAddress.done')}
			hint={t('settings.sameAddress.doneHint')}
		>
			<Button href="/settings">{t('nav.settings')}</Button>
		</EmptyState>
	{:else}
		<p class="text-sm text-fg-muted" role="status">
			{t('settings.sameAddress.openCount', { count: open.length })}
		</p>
		<ul class="flex flex-col gap-3">
			{#each open as finding (finding.key)}
				<li
					class="flex flex-col gap-3 rounded-app bg-card p-4 shadow-card"
					data-testid="same-address-finding"
				>
					<div class="flex items-start gap-3">
						<span class="mt-0.5 text-primary" aria-hidden="true"
							><Icon name="home" size={18} /></span
						>
						<div class="min-w-0 flex-1">
							<p class="font-medium break-words text-fg">{finding.line}</p>
							{#if finding.home}
								<p class="mt-1 text-xs text-fg-muted">
									{t('settings.sameAddress.homeOf', { names: names(finding.home.livesHere) })}
								</p>
								<p class="text-xs text-fg-subtle">{t('settings.sameAddress.joinHint')}</p>
							{/if}
						</div>
					</div>
					<ul class="flex flex-col gap-2">
						{#each finding.people as person (person.id)}
							<li class="flex items-center gap-3 text-sm">
								<Avatar id={person.id} name={person.displayName} size={28} />
								<!-- The spelling under the name: beside it, a phone cut the name short. -->
								<span class="min-w-0 flex-1">
									<a href="/contacts/{person.id}" class="block truncate text-fg hover:underline"
										>{person.displayName}</a
									>
									<span class="block truncate text-xs text-fg-subtle">{person.line}</span>
								</span>
							</li>
						{/each}
					</ul>
					<div class="flex flex-wrap justify-end gap-2">
						<form
							method="POST"
							action="?/declineSameAddress"
							use:enhance={hold(finding, 'decline')}
						>
							{@render answerFields(finding)}
							<Button variant="ghost" size="sm" {disabled}
								>{t('settings.sameAddress.notSame')}</Button
							>
						</form>
						<form method="POST" action="?/makeOneHome" use:enhance={hold(finding, 'accept')}>
							{@render answerFields(finding)}
							<Button variant="primary" size="sm" icon="home" {disabled}>
								{finding.home
									? t('settings.sameAddress.joinHome')
									: t('settings.sameAddress.makeHome')}
							</Button>
						</form>
					</div>
				</li>
			{/each}
		</ul>
	{/if}

	{#if data.checked && data.declined.length > 0}
		<details class="rounded-app bg-card p-3 shadow-card" data-testid="same-address-declined">
			<summary class="cursor-pointer text-sm font-medium text-fg-muted"
				>{t('settings.sameAddress.declined', { count: data.declined.length })}</summary
			>
			<ul class="mt-2 flex flex-col gap-2">
				{#each data.declined as finding (finding.dismissedAs)}
					<li class="flex items-center gap-3 text-sm">
						<span class="min-w-0 flex-1">
							<span class="block break-words text-fg">{finding.line}</span>
							<span class="block text-xs text-fg-muted">{names(finding.people)}</span>
						</span>
						<form method="POST" action="?/askAgainSameAddress" use:enhance>
							<input type="hidden" name="key" value={finding.dismissedAs} />
							<Button variant="ghost" size="sm" {disabled}
								>{t('settings.sameAddress.askAgain')}</Button
							>
						</form>
					</li>
				{/each}
			</ul>
		</details>
	{/if}
</main>
