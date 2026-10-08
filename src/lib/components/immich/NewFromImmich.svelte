<script lang="ts" module>
	/** How many rows the tab shows at first, and how many more each *Show more* adds. */
	export const NEWCOMER_PAGE = 30;
</script>

<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import Button from '$lib/components/Button.svelte';
	import EmptyState from '$lib/components/EmptyState.svelte';
	import NewcomerRow, {
		type Added,
		type Assigned,
		type NewcomerView
	} from '$lib/components/immich/NewcomerRow.svelte';
	import { useI18n } from '$lib/i18n/context.svelte';
	import { sendImmichFace } from '$lib/media/send-immich-face';
	import { reveal } from '$lib/motion/motion.svelte';
	import type { SelectablePerson } from '$lib/people/select';
	import { useRemovals } from '$lib/undo/context.svelte';
	import { deferredRemoval } from '$lib/undo/deferred-removal';
	import { removalKey, type RemovalKind } from '$lib/undo/keys';

	/*
	 * The *New from Immich* tab of *Find your people* (docs/02 §2.24.7): faces named in Immich
	 * that are nobody in Stella yet, most photos first. Immich can name hundreds of people, so the
	 * list shows a page of them and *Show more* adds the next; the whole list came with the page.
	 *
	 * A face assigned or added leaves the list here, with a toast — *Lena Köhler added · Open* —
	 * and the member stays in the list. Neither has an undo, like a link on the Matching tab.
	 * *Ignore* is held for the undo window like any removal (docs/02 §2.23), then kept for the
	 * household; ignored faces close the tab, folded, with who and when, and *Propose again*.
	 */
	interface IgnoredFace {
		personId: string;
		immichName: string | null;
		faceUrl: string;
		ignoredByName: string | null;
		ignoredAt: number;
	}
	interface Props {
		newcomers: NewcomerView[];
		ignored: IgnoredFace[];
		people: SelectablePerson[];
		/** Faces assigned or added during this visit, by Immich id; the page counts the tab by it. */
		gone: Record<string, true>;
	}
	let { newcomers, ignored, people, gone = $bindable() }: Props = $props();

	const i18n = useI18n();
	const t = i18n.t;
	const removals = useRemovals();
	const shownCount = (count: number) => new Intl.NumberFormat(i18n.intlLocale).format(count);
	const shownDate = (at: number) =>
		new Intl.DateTimeFormat(i18n.intlLocale, { dateStyle: 'medium' }).format(at);

	let shownUpTo = $state(NEWCOMER_PAGE);

	const rows = $derived(
		newcomers.filter(
			(row) =>
				!gone[row.personId] &&
				!removals.isPending(removalKey('immich-newcomer-ignore', row.personId))
		)
	);
	const stillIgnored = $derived(
		ignored.filter(
			(face) => !removals.isPending(removalKey('immich-newcomer-ignored', face.personId))
		)
	);

	/** Holds an Ignore or a Propose again for the undo window, then posts the form it came from. */
	function deferred(event: SubmitEvent, kind: RemovalKind, id: string, label: string) {
		event.preventDefault();
		const formEl = event.currentTarget as HTMLFormElement;
		removals.remove(
			deferredRemoval(
				{
					kind,
					id,
					label,
					action: formEl.getAttribute('action') ?? '',
					body: new FormData(formEl)
				},
				{ fetch, reload: invalidateAll }
			)
		);
	}

	function assigned({ personId, name }: Assigned, immichName: string) {
		gone[personId] = true;
		removals.notify(t('immich.new.assigned', { immichName, name }));
	}

	async function added({ personId, contactId, name, faceUrl }: Added) {
		gone[personId] = true;
		removals.notifyWithLink(t('immich.new.added', { name }), {
			label: t('immich.new.open'),
			href: `/contacts/${encodeURIComponent(contactId)}`
		});
		if (!faceUrl) return;
		try {
			await sendImmichFace(contactId, faceUrl);
		} catch {
			// The person is added and linked either way; only the photo is missing, and says so.
			removals.notify(t('immich.new.photoFailed'));
		}
	}
</script>

{#if rows.length === 0}
	<EmptyState icon="done" title={t('immich.new.done')} hint={t('immich.match.doneHint')}>
		<Button variant="ghost" icon="search" href="/settings/immich" data-sveltekit-reload>
			{t('immich.match.again')}
		</Button>
	</EmptyState>
{:else}
	<p class="text-sm text-fg-muted">
		{t('immich.new.summary', { count: rows.length, shown: shownCount(rows.length) })}
	</p>
	<ul class="flex flex-col gap-3" data-testid="immich-newcomers">
		{#each rows.slice(0, shownUpTo) as row (row.personId)}
			<NewcomerRow
				{row}
				{people}
				onIgnore={(event) =>
					deferred(
						event,
						'immich-newcomer-ignore',
						row.personId,
						t('immich.new.ignoredToast', { name: row.name })
					)}
				onAssigned={(answer) => assigned(answer, row.name)}
				onAdded={added}
			/>
		{/each}
	</ul>
	{#if rows.length > shownUpTo}
		<div class="flex justify-center">
			<Button variant="ghost" type="button" onclick={() => (shownUpTo += NEWCOMER_PAGE)}>
				{t('immich.new.showMore', { count: Math.min(NEWCOMER_PAGE, rows.length - shownUpTo) })}
			</Button>
		</div>
	{/if}
{/if}

{#if stillIgnored.length > 0}
	<!-- What the household said no to, and who: one fold away, and every no can be taken back. -->
	<details class="rounded-app bg-card p-3 shadow-card" data-testid="immich-newcomers-ignored">
		<summary class="cursor-pointer text-sm font-medium text-fg-muted">
			{t('immich.match.ignoredHeading', { count: stillIgnored.length })}
		</summary>
		<ul class="mt-3 flex flex-col gap-3">
			{#each stillIgnored as face (face.personId)}
				{@const name = face.immichName ?? t('immich.match.unnamedFace')}
				<li class="flex items-center gap-3" transition:reveal>
					<img
						src={face.faceUrl}
						alt={face.immichName ? t('immich.match.face', { name: face.immichName }) : ''}
						width="40"
						height="40"
						class="size-10 shrink-0 rounded-full bg-bg-sunken object-cover"
						loading="lazy"
					/>
					<div class="min-w-0 flex-1">
						<p class="truncate text-sm font-medium text-fg">{name}</p>
						<p class="text-xs text-fg-muted">
							{t('immich.match.ignoredBy', {
								name: face.ignoredByName ?? t('immich.match.formerMember'),
								date: shownDate(face.ignoredAt)
							})}
						</p>
					</div>
					<form
						method="POST"
						action="?/proposeNewcomerAgain"
						onsubmit={(event) =>
							deferred(
								event,
								'immich-newcomer-ignored',
								face.personId,
								t('immich.match.proposedAgainToast')
							)}
					>
						<input type="hidden" name="immichPersonId" value={face.personId} />
						<Button variant="ghost" size="sm" label={t('immich.match.proposeAgainLabel', { name })}>
							{t('immich.match.proposeAgain')}
						</Button>
					</form>
				</li>
			{/each}
		</ul>
	</details>
{/if}
