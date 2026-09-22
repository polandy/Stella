<script lang="ts">
	import { onMount } from 'svelte';
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import Avatar from '$lib/components/Avatar.svelte';
	import Button from '$lib/components/Button.svelte';
	import Combobox from '$lib/components/Combobox.svelte';
	import EmptyState from '$lib/components/EmptyState.svelte';
	import PersonSearchSelect from '$lib/components/PersonSearchSelect.svelte';
	import RemoveButton from '$lib/components/RemoveButton.svelte';
	import Section from '$lib/components/Section.svelte';
	import { circleKindLabel } from '$lib/circles/labels';
	import { allChosen, toggleEveryone, toggleGroup, toggleMember } from '$lib/circles/selection';
	import { accentDotStyle } from '$lib/design/tokens';
	import { useTranslate } from '$lib/i18n/context.svelte';
	import { useRemovals } from '$lib/undo/context.svelte';
	import { deferredRemoval } from '$lib/undo/deferred-removal';
	import { removalKey } from '$lib/undo/keys';
	import { savedEnhance } from '$lib/undo/saved';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();
	const t = useTranslate();
	const circle = $derived(data.circle);

	// A member on their way out of the circle is off the grid while the undo window is open;
	// a role whose last member is leaving goes with them.
	const removals = useRemovals();
	const visibleGroups = $derived(
		data.memberGroups
			.map((g) => ({
				...g,
				members: g.members.filter(
					(m) => !removals.isPending(removalKey('membership', m.membershipId))
				)
			}))
			.filter((g) => g.members.length > 0)
	);
	const visibleCount = $derived(visibleGroups.reduce((sum, g) => sum + g.members.length, 0));
	// Headings only earn their place once someone has a role; a circle without any stays one grid.
	const showRoles = $derived(visibleGroups.some((g) => g.role !== null));
	let addOpen = $state(false);
	let newMemberIds = $state<string[]>([]);
	let newRole = $state('');
	const saved = savedEnhance(removals, t('components.saved'), () => {
		addOpen = false;
		newMemberIds = [];
		newRole = '';
	});

	/*
	 * Selecting several members to re-role or remove them together. The selection is kept as
	 * ids and read back through the visible members, so someone leaving the circle drops out of
	 * it instead of being sent to the server as a ghost.
	 */
	let selecting = $state(false);
	let selectedIds = $state<string[]>([]);
	let bulkRole = $state('');
	const allMembers = $derived(visibleGroups.flatMap((g) => g.members));
	const chosenMembers = $derived(allMembers.filter((m) => selectedIds.includes(m.contactId)));

	const allIds = $derived(allMembers.map((m) => m.contactId));
	const idsOf = (group: (typeof visibleGroups)[number]) => group.members.map((m) => m.contactId);
	const everyoneChosen = $derived(allChosen(allIds, selectedIds));
	function stopSelecting() {
		selecting = false;
		selectedIds = [];
		bulkRole = '';
	}
	const roleSaved = savedEnhance(removals, t('components.saved'), () => {
		selectedIds = [];
		bulkRole = '';
	});
	// Each leaves through the same undo window as a single removal, so Undo works per person.
	function removeChosen() {
		const count = chosenMembers.length;
		for (const m of chosenMembers) {
			const body = new FormData();
			body.set('contactId', m.contactId);
			removals.remove(
				deferredRemoval(
					{
						kind: 'membership',
						id: m.membershipId,
						label: count > 1 ? t('circles.removedManyFromCircle', { count }) : t('circles.removedFromCircle'),
						action: '?/removeMember',
						body
					},
					{ fetch, reload: invalidateAll }
				)
			);
		}
		selectedIds = [];
	}

	// Whether a search stays after picking someone: a surname then lists the whole family. It is
	// a habit rather than a setting, so it lives in this browser only.
	const KEEP_SEARCH_KEY = 'stella.circles.keepSearch';
	let keepSearch = $state(true);
	onMount(() => {
		try {
			keepSearch = localStorage.getItem(KEEP_SEARCH_KEY) !== 'off';
		} catch {
			// Storage can be blocked; the default stands.
		}
	});
	function rememberKeepSearch() {
		try {
			localStorage.setItem(KEEP_SEARCH_KEY, keepSearch ? 'on' : 'off');
		} catch {
			// Not remembered, still applied for this visit.
		}
	}
	const INPUT = 'rounded-md border border-border bg-bg px-3 py-2 text-fg';
</script>

<svelte:head><title>{t('circles.detail.title', { name: circle.name })}</title></svelte:head>

<main class="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-6 md:px-6 md:py-10">
	<header class="flex items-center gap-4">
		<span class="grid size-12 shrink-0 place-items-center rounded-full" style={accentDotStyle(circle.color)}>
			<span class="size-4 rounded-full bg-card/70"></span>
		</span>
		<div class="min-w-0 flex-1">
			<h1 class="truncate text-2xl font-semibold text-fg">{circle.name}</h1>
			<p class="text-sm text-fg-muted">
				<span>{circleKindLabel(t, circle.kind)}</span>
				{#if circle.description} · {circle.description}{/if}
				{#if circle.visibility === 'private'} · {t('circles.private')}{/if}
			</p>
		</div>
		<!-- The circle is a node of the graph, so it opens there like a person does (docs/02 §2.7). -->
		<Button size="sm" icon="graph" href="/graph?center={circle.id}">{t('graph.openInGraph')}</Button>
	</header>

	<Section
		title={t('circles.members')}
		count={visibleCount}
		addLabel={data.candidates.length ? t('circles.addPeople') : undefined}
		error={form?.error ?? null}
		bind:open={addOpen}
	>
		{#snippet action()}
			{#if visibleCount > 1}
				<Button size="sm" aria-pressed={selecting} onclick={() => (selecting ? stopSelecting() : (selecting = true))}>
					{selecting ? t('circles.selectDone') : t('circles.select')}
				</Button>
			{/if}
		{/snippet}
		{#if visibleCount}
			<div class="flex flex-col gap-4" data-testid="member-grid">
				{#each visibleGroups as group (group.role)}
					<section class="flex flex-col gap-2" data-testid="role-group">
						{#if showRoles}
							<div class="flex items-center gap-2">
							<h3 class="text-xs font-medium uppercase tracking-wide text-fg-subtle">
								{group.role ?? t('circles.noRole')} · {group.members.length}
							</h3>
							{#if selecting}
								<label class="flex items-center gap-1 text-xs text-primary">
									<input
										type="checkbox"
										checked={allChosen(idsOf(group), selectedIds)}
										onchange={() => (selectedIds = toggleGroup(selectedIds, idsOf(group)))}
										aria-label={t('circles.selectRole', { role: group.role ?? t('circles.noRole') })}
										class="accent-primary"
									/>
									{t('circles.selectAll')}
								</label>
							{/if}
							</div>
						{/if}
						<ul class="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
							{#each group.members as m (m.membershipId)}
								{@const chosen = selectedIds.includes(m.contactId)}
								<li
									class="flex items-center gap-3 rounded-app border-2 bg-bg px-3 py-2.5 {chosen
										? 'border-primary bg-primary-soft'
										: 'border-transparent'}"
								>
									{#if selecting}
										<!-- The whole card is the target, so a thumb finds it as easily as a cursor. -->
										<label class="flex min-w-0 flex-1 cursor-pointer items-center gap-3">
											<input
												type="checkbox"
												checked={chosen}
												onchange={() => (selectedIds = toggleMember(selectedIds, m.contactId))}
												aria-label={t('circles.selectMember', { name: m.displayName })}
												class="size-5 shrink-0 accent-primary"
											/>
											<Avatar id={m.contactId} name={m.displayName} avatarPhotoId={m.avatarPhotoId} size={40} />
											<span class="min-w-0 flex-1 truncate font-medium text-fg">{m.displayName}</span>
										</label>
									{:else}
										<Avatar id={m.contactId} name={m.displayName} avatarPhotoId={m.avatarPhotoId} size={40} />
										<a href="/contacts/{m.contactId}" class="min-w-0 flex-1 truncate font-medium text-fg hover:underline">{m.displayName}</a>
										<RemoveButton
											kind="membership"
											id={m.membershipId}
											action="?/removeMember"
											fields={{ contactId: m.contactId }}
											label={t('circles.removeMember', { name: m.displayName })}
											removed={t('circles.removedFromCircle')}
										/>
									{/if}
								</li>
							{/each}
						</ul>
					</section>
				{/each}
			</div>
		{:else}
			<EmptyState
				icon="people"
				title={t('circles.noMembers.title')}
				hint={t('circles.noMembers.hint')}
			/>
		{/if}

		{#snippet editor()}
			<form method="POST" action="?/addMembers" use:enhance={saved} class="flex flex-wrap items-end gap-3">
				<label class="flex basis-full items-center gap-2 text-sm text-fg-muted">
					<input type="checkbox" bind:checked={keepSearch} onchange={rememberKeepSearch} class="accent-primary" />
					{t('circles.keepSearch')}
				</label>
				<label for="circle-member" class="flex flex-1 flex-col gap-1 text-sm">
					<span class="text-fg-muted">{t('circles.people')}</span>
					<PersonSearchSelect
						id="circle-member"
						people={data.candidates}
						name="contactId"
						bind:selectedIds={newMemberIds}
						multiple
						{keepSearch}
						allowCreate
						required
					/>
				</label>
				<label class="flex flex-col gap-1 text-sm">
					<span class="text-fg-muted">{t('circles.roleLabel')}</span>
					<!-- The roles this circle already uses; typing something new is still allowed. -->
					<Combobox
						id="circle-role"
						name="role"
						bind:value={newRole}
						options={data.roleSuggestions}
						placeholder={t('circles.rolePlaceholder')}
						class="w-32 {INPUT}"
					/>
					{#if newMemberIds.length > 1}
						<!-- Only worth saying once the one role really does land on several people. -->
						<span class="pb-2 text-xs text-fg-subtle">{t('circles.roleAppliesToAll')}</span>
					{/if}
				</label>
				<Button variant="primary" size="sm">{t('common.add')}</Button>
			</form>
		{/snippet}
	</Section>
</main>

{#if selecting}
	<!-- Fixed to the bottom so it stays in reach however long the circle is; offset above the
	     mobile bottom tab bar (src/routes/(app)/+layout.svelte) so the two never overlap. Stays
	     below Toast's z-30 (Toast.svelte) so a save/undo toast is never hidden behind it. -->
	<div
		class="pointer-events-none fixed inset-x-0 bottom-[calc(4.75rem+env(safe-area-inset-bottom))] z-20 flex justify-center px-4 md:bottom-[max(0.75rem,env(safe-area-inset-bottom))]"
		data-testid="selection-bar"
	>
		<div class="pointer-events-auto flex w-full max-w-4xl flex-wrap items-center gap-2 rounded-app border border-border bg-card p-2.5 shadow-pop">
			<strong class="px-1 text-sm tabular-nums text-fg" aria-live="polite">
				{chosenMembers.length ? t('circles.selectedCount', { count: chosenMembers.length }) : t('circles.selectNone')}
			</strong>
			<Button type="button" size="sm" onclick={() => (selectedIds = toggleEveryone(selectedIds, allIds))}>
				{everyoneChosen ? t('circles.selectNoOne') : t('circles.selectEveryone')}
			</Button>
			<form method="POST" action="?/setRole" use:enhance={roleSaved} class="ml-auto flex flex-wrap items-center gap-2">
				{#each chosenMembers as m (m.contactId)}
					<input type="hidden" name="contactId" value={m.contactId} />
				{/each}
				<label for="bulk-role" class="text-sm text-fg-muted">{t('circles.bulkRole')}</label>
				<Combobox
					id="bulk-role"
					name="role"
					bind:value={bulkRole}
					options={data.roleSuggestions}
					placeholder={t('circles.bulkRoleHint')}
					placement="above"
					class="w-44 {INPUT}"
				/>
				<Button variant="primary" size="sm" disabled={chosenMembers.length === 0}>{t('circles.bulkApply')}</Button>
			</form>
			<Button type="button" variant="danger" size="sm" disabled={chosenMembers.length === 0} onclick={removeChosen}>
				{t('circles.bulkRemove')}
			</Button>
		</div>
	</div>
{/if}
