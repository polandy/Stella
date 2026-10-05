<script lang="ts">
	import { applyAction, enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import type { SubmitFunction } from '@sveltejs/kit';
	import Avatar from '$lib/components/Avatar.svelte';
	import Button from '$lib/components/Button.svelte';
	import EmptyState from '$lib/components/EmptyState.svelte';
	import FormError from '$lib/components/FormError.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import { useI18n } from '$lib/i18n/context.svelte';
	import { reveal } from '$lib/motion/motion.svelte';
	import { useRemovals } from '$lib/undo/context.svelte';
	import { deferredRemoval } from '$lib/undo/deferred-removal';
	import { removalKey, type RemovalKind } from '$lib/undo/keys';
	import type { ActionData, PageData } from './$types';

	/*
	 * *Settings → Immich → Find your people* (docs/concepts/immich.md §4.2, docs/02 §2.24.7): a
	 * review list in the style of the relationship suggestions. Each row puts the Immich face next
	 * to the Stella avatar — you recognise your aunt faster than you read her name. A likely row
	 * links in one tap, and *Link all likely* takes every one of them; a maybe asks, showing every
	 * face it could be side by side, and links the one picked.
	 *
	 * A linked row leaves the list here, without asking Immich for the list again; a reload — or
	 * the page without JavaScript, where every control is a plain form — reads it afresh. *Not
	 * now* only hides a row for this visit: nothing is kept, and the next visit asks again. When
	 * no row is left the list ends quietly.
	 *
	 * *Ignore* is the lasting no (concept §9): the pair is kept with who said so and when, and is
	 * listed under *Ignored* at the end, where *Propose again* takes it back. Both are held for the
	 * undo window like any removal (docs/02 §2.23), then sent, and the list is read afresh. While
	 * it is read, the rows already on screen stay — the list does not flash back to "Asking".
	 */
	let { data, form }: { data: PageData; form: ActionData } = $props();

	const i18n = useI18n();
	const t = i18n.t;
	const shownCount = (count: number) => new Intl.NumberFormat(i18n.intlLocale).format(count);

	/** Rows linked or put aside during this visit. */
	let gone = $state<Record<string, true>>({});
	/** Why a row's link was refused, by contact, during this visit. */
	let refusedHere = $state<Record<string, string>>({});
	let linkedHere = $state(0);

	type LinkResult = { linked: string[]; refused: { contactId: string; message: string }[]; error: string | null };

	/** The action's answer when the page was posted without JavaScript. */
	const posted = $derived(form as LinkResult | null);

	const refusalFor = (contactId: string) =>
		refusedHere[contactId] ?? posted?.refused.find((r) => r.contactId === contactId)?.message ?? null;

	const linking: SubmitFunction = () => {
		return async ({ result }) => {
			if (result.type !== 'success' || !result.data) return applyAction(result);
			const { linked, refused } = result.data as LinkResult;
			for (const contactId of linked) gone[contactId] = true;
			for (const { contactId, message } of refused) refusedHere[contactId] = message;
			linkedHere += linked.length;
		};
	};

	const removals = useRemovals();
	const pairId = (contactId: string, personId: string) => `${contactId}/${personId}`;

	/** Holds an Ignore or a Propose again for the undo window, then posts the form it came from. */
	function deferred(event: SubmitEvent, kind: RemovalKind, id: string, label: string) {
		event.preventDefault();
		const formEl = event.currentTarget as HTMLFormElement;
		removals.remove(
			deferredRemoval(
				{ kind, id, label, action: formEl.getAttribute('action') ?? '', body: new FormData(formEl) },
				{ fetch, reload: invalidateAll }
			)
		);
	}

	type Matches = Awaited<PageData['matches']>;
	/** The last list read, shown while a fresh one is on its way. */
	let latest = $state<Matches | null>(null);
	$effect(() => {
		let current = true;
		void data.matches.then((matches) => {
			if (current) latest = matches;
		});
		return () => (current = false);
	});

	const shown = <T extends { contact: { id: string } }>(rows: T[]) =>
		rows.filter((row) => !gone[row.contact.id] && !removals.isPending(removalKey('immich-ignore', row.contact.id)));
	const stillIgnored = <T extends { contact: { id: string }; personId: string }>(pairs: T[]) =>
		pairs.filter((pair) => !removals.isPending(removalKey('immich-ignored', pairId(pair.contact.id, pair.personId))));
	const shownDate = (at: number) => new Intl.DateTimeFormat(i18n.intlLocale, { dateStyle: 'medium' }).format(at);
	const photoLine = (count: number | null) =>
		count === null ? null : t('immich.match.photos', { count, shown: shownCount(count) });
</script>

<svelte:head><title>{t('common.pageTitle', { page: t('immich.match.title') })}</title></svelte:head>

<main class="mx-auto flex w-full max-w-2xl flex-col gap-6 px-6 py-10">
	<header class="flex flex-col gap-1">
		<a href="/settings" class="flex items-center gap-1 text-sm text-link hover:underline">
			<Icon name="forward" size={12} />{t('nav.settings')}
		</a>
		<h1 class="text-2xl font-semibold text-fg">{t('immich.match.title')}</h1>
		<p class="text-fg-muted">{t('immich.match.intro')}</p>
	</header>

	<FormError message={posted?.error} />
	{#if linkedHere > 0 || (posted?.linked.length ?? 0) > 0}
		<p class="text-sm text-fg-muted" role="status" data-testid="immich-match-linked">
			{t('immich.match.linked', { count: linkedHere || (posted?.linked.length ?? 0) })}
		</p>
	{/if}

	{#await data.matches}
		{#if latest}
			{@render list(latest)}
		{:else}
			<p class="text-sm text-fg-subtle" role="status">{t('immich.match.asking')}</p>
		{/if}
	{:then matches}
		{@render list(matches)}
	{/await}
</main>

{#snippet ignoreButton(row: { contact: { id: string; displayName: string }; candidates: { personId: string }[] })}
	<form
		method="POST"
		action="?/ignore"
		onsubmit={(event) => deferred(event, 'immich-ignore', row.contact.id, t('immich.match.ignoredToast'))}
	>
		<input type="hidden" name="contactId" value={row.contact.id} />
		{#each row.candidates as face (face.personId)}
			<input type="hidden" name="immichPersonId" value={face.personId} />
		{/each}
		<Button variant="ghost" size="sm" label={t('immich.match.ignoreLabel', { name: row.contact.displayName })}>
			{t('immich.match.ignore')}
		</Button>
	</form>
{/snippet}

{#snippet list(matches: Matches)}
	{@const rows = shown(matches.rows)}
	{@const likely = rows.filter((row) => row.kind === 'likely')}
	{#if matches.error}
		<FormError message={matches.error} />
	{:else if rows.length === 0}
		<EmptyState icon="done" title={t('immich.match.done')} hint={t('immich.match.doneHint')}>
			<Button variant="ghost" icon="search" href="/settings/immich" data-sveltekit-reload>
				{t('immich.match.again')}
			</Button>
		</EmptyState>
	{:else}
		{#if likely.length > 1}
			<form method="POST" action="?/linkAll" use:enhance={linking} class="flex justify-end">
				{#each likely as row (row.contact.id)}
					<input type="hidden" name="contactId" value={row.contact.id} />
					<input type="hidden" name="immichPersonId" value={row.candidates[0].personId} />
				{/each}
				<Button variant="primary" size="sm" icon="done">
					{t('immich.match.linkAll', { count: likely.length })}
				</Button>
			</form>
		{/if}

		<ul class="flex flex-col gap-3" data-testid="immich-matches">
			{#each rows as row (row.contact.id)}
				<li
					class="flex flex-col gap-2 rounded-app bg-card p-3 shadow-card"
					data-testid="immich-match"
					data-kind={row.kind}
					transition:reveal
				>
					{#if row.kind === 'likely'}
						{@const face = row.candidates[0]}
						<div class="flex items-center gap-3">
							<img
								src={face.faceUrl}
								alt={t('immich.match.face', { name: face.name })}
								width="48"
								height="48"
								class="size-12 shrink-0 rounded-full bg-bg-sunken object-cover"
								loading="lazy"
							/>
							<Avatar id={row.contact.id} name={row.contact.displayName} avatarPhotoId={row.contact.avatarPhotoId} size={48} />
							<div class="min-w-0 flex-1">
								<a href="/contacts/{row.contact.id}" class="block truncate font-medium text-fg hover:underline">
									{row.contact.displayName}
								</a>
								<p class="truncate text-sm text-fg-muted">
									{t('immich.match.inImmich', { name: face.name })}{#if photoLine(face.photoCount)}
										· {photoLine(face.photoCount)}{/if}
								</p>
							</div>
							<form method="POST" action="?/link" use:enhance={linking}>
								<input type="hidden" name="contactId" value={row.contact.id} />
								<input type="hidden" name="immichPersonId" value={face.personId} />
								<Button
									variant="primary"
									size="sm"
									label={t('immich.picker.link', { immichName: face.name, name: row.contact.displayName })}
								>
									{t('immich.match.link')}
								</Button>
							</form>
							{@render ignoreButton(row)}
						</div>
					{:else}
						<div class="flex items-center gap-3">
							<Avatar id={row.contact.id} name={row.contact.displayName} avatarPhotoId={row.contact.avatarPhotoId} size={40} />
							<a href="/contacts/{row.contact.id}" class="min-w-0 flex-1 font-medium text-fg hover:underline">
								{row.candidates.length === 1
									? t('immich.match.maybeOne', { name: row.contact.displayName })
									: t('immich.match.maybeMany', { name: row.contact.displayName })}
							</a>
							<Button
								variant="ghost"
								size="sm"
								type="button"
								label={t('immich.match.skipLabel', { name: row.contact.displayName })}
								onclick={() => (gone[row.contact.id] = true)}
							>
								{t('immich.match.skip')}
							</Button>
							{@render ignoreButton(row)}
						</div>
						<!-- Same-named faces side by side: the face, not the name, says which one. -->
						<ul class="flex flex-wrap gap-2">
							{#each row.candidates as face (face.personId)}
								<li>
									<form method="POST" action="?/link" use:enhance={linking}>
										<input type="hidden" name="contactId" value={row.contact.id} />
										<input type="hidden" name="immichPersonId" value={face.personId} />
										<button
											class="flex w-28 flex-col items-center gap-1 rounded-app border border-border p-2 text-center transition-colors hover:bg-card-hover"
											aria-label={t('immich.picker.link', { immichName: face.name, name: row.contact.displayName })}
										>
											<img
												src={face.faceUrl}
												alt=""
												width="64"
												height="64"
												class="size-16 rounded-full bg-bg-sunken object-cover"
												loading="lazy"
											/>
											<span class="w-full truncate text-sm text-fg">{face.name}</span>
											{#if photoLine(face.photoCount)}
												<span class="text-xs text-fg-muted tabular-nums">{photoLine(face.photoCount)}</span>
											{/if}
											<span class="text-xs font-medium text-link">{t('immich.match.link')}</span>
										</button>
									</form>
								</li>
							{/each}
						</ul>
					{/if}
					<FormError message={refusalFor(row.contact.id)} variant="inline" />
				</li>
			{/each}
		</ul>
	{/if}
	{@const ignored = stillIgnored(matches.ignored)}
	{#if ignored.length > 0}
		<!-- What the household said no to, and who: one fold away, and every no can be taken back. -->
		<details class="rounded-app bg-card p-3 shadow-card" data-testid="immich-ignored">
			<summary class="cursor-pointer text-sm font-medium text-fg-muted">
				{t('immich.match.ignoredHeading', { count: ignored.length })}
			</summary>
			<ul class="mt-3 flex flex-col gap-3">
				{#each ignored as pair (pairId(pair.contact.id, pair.personId))}
					<li class="flex items-center gap-3" transition:reveal>
						<img
							src={pair.faceUrl}
							alt={pair.immichName ? t('immich.match.face', { name: pair.immichName }) : ''}
							width="40"
							height="40"
							class="size-10 shrink-0 rounded-full bg-bg-sunken object-cover"
							loading="lazy"
						/>
						<Avatar id={pair.contact.id} name={pair.contact.displayName} avatarPhotoId={pair.contact.avatarPhotoId} size={40} />
						<div class="min-w-0 flex-1">
							<p class="truncate text-sm text-fg">
								<a href="/contacts/{pair.contact.id}" class="font-medium hover:underline">{pair.contact.displayName}</a>
								· {pair.immichName ? t('immich.match.inImmich', { name: pair.immichName }) : t('immich.match.unnamedFace')}
							</p>
							<p class="text-xs text-fg-muted">
								{t('immich.match.ignoredBy', {
									name: pair.ignoredByName ?? t('immich.match.formerMember'),
									date: shownDate(pair.ignoredAt)
								})}
							</p>
						</div>
						<form
							method="POST"
							action="?/proposeAgain"
							onsubmit={(event) => {
								delete gone[pair.contact.id];
								deferred(event, 'immich-ignored', pairId(pair.contact.id, pair.personId), t('immich.match.proposedAgainToast'));
							}}
						>
							<input type="hidden" name="contactId" value={pair.contact.id} />
							<input type="hidden" name="immichPersonId" value={pair.personId} />
							<Button variant="ghost" size="sm" label={t('immich.match.proposeAgainLabel', { name: pair.contact.displayName })}>
								{t('immich.match.proposeAgain')}
							</Button>
						</form>
					</li>
				{/each}
			</ul>
		</details>
	{/if}
{/snippet}
