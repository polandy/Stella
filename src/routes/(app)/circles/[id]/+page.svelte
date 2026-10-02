<script lang="ts">
	import { onMount } from 'svelte';
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import Avatar from '$lib/components/Avatar.svelte';
	import Button from '$lib/components/Button.svelte';
	import CirclePhotoLightbox from '$lib/components/circle/CirclePhotoLightbox.svelte';
	import CirclePhotosSection from '$lib/components/circle/CirclePhotosSection.svelte';
	import MemberCard from '$lib/components/circle/MemberCard.svelte';
	import MemberSelectionBar from '$lib/components/circle/MemberSelectionBar.svelte';
	import PhotoStrip from '$lib/components/circle/PhotoStrip.svelte';
	import { PhotoWalk } from '$lib/components/circle/photo-walk.svelte';
	import Combobox from '$lib/components/Combobox.svelte';
	import EmptyState from '$lib/components/EmptyState.svelte';
	import InlineEdit from '$lib/components/InlineEdit.svelte';
	import PersonSearchSelect from '$lib/components/PersonSearchSelect.svelte';
	import RemoveButton from '$lib/components/RemoveButton.svelte';
	import Section from '$lib/components/Section.svelte';
	import { circleKindLabel } from '$lib/circles/labels';
	import { roleKey } from '$lib/circles/role-key';
	import { dayLabel } from '$lib/dates/labels';
	import { allChosen, toggleEveryone, toggleGroup, toggleMember } from '$lib/circles/selection';
	import { accentDotStyle } from '$lib/design/tokens';
	import { useI18n } from '$lib/i18n/context.svelte';
	import { newPersonHref } from '$lib/people/new-person';
	import { reachability } from '$lib/pwa/reachability.svelte';
	import { householdSpellings } from '$lib/suggestions/surname-groups';
	import { useHeldNames } from '$lib/surnames/held-names.svelte';
	import { useRemovals } from '$lib/undo/context.svelte';
	import { deferredRemoval } from '$lib/undo/deferred-removal';
	import { removalKey } from '$lib/undo/keys';
	import { savedEnhance } from '$lib/undo/saved';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();
	// The shell's people who are not in the circle yet: the ones the picker can add.
	const candidates = $derived.by(() => {
		const members = new Set(data.memberIds);
		return data.people.filter((p) => !members.has(p.id));
	});
	const i18n = useI18n();
	const t = i18n.t;
	const circle = $derived(data.circle);

	/*
	 * The circle's photos (docs/02 §2.4.2): the cover, a banner over each role group and the
	 * Photos section all open one lightbox, which walks only the photos it was opened among —
	 * one role's, or the grid as filtered. It follows the photo by id, so a save that reloads
	 * the page keeps it open, and a photo that went away closes it.
	 */
	const photos = $derived(data.photos);
	const ofRole = (key: string | null) => photos.photos.filter((p) => p.roleKey === key).map((p) => p.id);
	const walk = new PhotoWalk();
	const walked = $derived(photos.photos.find((p) => p.id === walk.photoId) ?? null);
	const openPhotos = walk.open.bind(walk);
	// A photo removed (or made unseeable) from inside the lightbox closes it.
	$effect(() => {
		if (walk.current && !walked) walk.close();
	});
	const photoDate = (createdAt: number): string => dayLabel(i18n, new Date(createdAt).toISOString());

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
	/*
	 * *Set last name* for the chosen members (docs/concepts/surnames.md §3.2): *Family Brunner*
	 * is the natural place to give the family its name. The last names come from the shell's
	 * people, which carry them for every picker already.
	 */
	const heldNames = useHeldNames();
	const lastNameOf = $derived(new Map(data.people.map((p) => [p.id, p.lastName])));
	const lastNames = $derived({
		chosen: chosenMembers.map((m) => ({ id: m.contactId, displayName: m.displayName, lastName: lastNameOf.get(m.contactId) ?? null })),
		knownSurnames: [...householdSpellings(data.people.map((p) => p.lastName)).values()].sort((a, b) => a.localeCompare(b)),
		held: heldNames.submit(),
		disabled: !reachability.reachable,
		onheld: () => (selectedIds = [])
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
	// A role heading's look; the rename field it opens keeps body type to be legible while typing.
	const ROLE_HEADING = 'text-xs font-medium uppercase tracking-wide text-fg-subtle';
	// A failed rename belongs to the heading it was typed into, not to every role on the page.
	// (The photo actions live in their own module, so `form` is a loose union: read it by `in`.)
	function renameErrorFor(role: string): string | null {
		if (!form || !('renameFrom' in form) || !('renameError' in form)) return null;
		return form.renameFrom === role && typeof form.renameError === 'string' ? form.renameError : null;
	}
	const INPUT = 'rounded-md border border-border-input bg-bg px-3 py-2 text-fg';
</script>

<svelte:head><title>{t('circles.detail.title', { name: circle.name })}</title></svelte:head>

<main class="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-6 md:px-6 md:py-10">
	{#if photos.cover}
		{@const ids = ofRole(null)}
		<PhotoStrip
			photoId={photos.cover.id}
			count={ids.length}
			size="cover"
			label={t('circles.photos.openCover', { count: ids.length })}
			onopen={(opener) => openPhotos(ids, 0, opener)}
		/>
	{/if}
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
		addLabel={candidates.length ? t('circles.addPeople') : undefined}
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
							{#if group.role !== null}
								<!-- A role is renamed where it is read, for its people and its photos alike. -->
								<h3 class="flex min-w-0 items-center gap-1">
									<InlineEdit
										action="?/renameRole"
										name="role"
										value={group.role}
										extra={{ from: group.role }}
										label={t('circles.renameRole', { role: group.role })}
										error={renameErrorFor(group.role)}
										valueClass={ROLE_HEADING}
										pencil
									/>
									<span class={ROLE_HEADING}>· {group.members.length}</span>
								</h3>
							{:else}
								<h3 class={ROLE_HEADING}>{t('circles.noRole')} · {group.members.length}</h3>
							{/if}
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
						<!-- The role's lead photo stands above its people (concept §3.1); No role has the cover. -->
						{#if showRoles && group.role !== null && photos.banners[roleKey(group.role) ?? '']}
							{@const banner = photos.banners[roleKey(group.role) ?? '']}
							{@const ids = ofRole(banner.roleKey)}
							<PhotoStrip
								photoId={banner.id}
								count={ids.length}
								size="banner"
								label={t('circles.photos.openRole', { role: group.role, count: ids.length })}
								onopen={(opener) => openPhotos(ids, ids.indexOf(banner.id), opener)}
							/>
						{/if}
						<ul class="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
							{#each group.members as m (m.membershipId)}
								<MemberCard
									member={m}
									{selecting}
									chosen={selectedIds.includes(m.contactId)}
									ontoggle={() => (selectedIds = toggleMember(selectedIds, m.contactId))}
								/>
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
			>
				<!-- The header's Add opens the same form; with nobody to add yet, people come first. -->
				{#if candidates.length}
					<Button variant="primary" icon="add" type="button" onclick={() => (addOpen = true)}>{t('circles.noMembers.add')}</Button>
				{:else}
					<Button variant="primary" icon="add" href={newPersonHref()}>{t('nav.addPerson')}</Button>
				{/if}
			</EmptyState>
		{/if}

		{#snippet editor()}
			<form method="POST" action="?/addMembers" use:enhance={saved} class="flex flex-wrap items-end gap-3">
				<label class="flex basis-full items-center gap-2 text-sm text-fg-muted">
					<input type="checkbox" bind:checked={keepSearch} onchange={rememberKeepSearch} class="accent-primary" />
					{t('circles.keepSearch')}
				</label>
				<!-- The label names the field only, not the chips and list around it. -->
				<div class="flex flex-1 flex-col gap-1 text-sm">
					<label for="circle-member" class="text-fg-muted">{t('circles.people')}</label>
					<PersonSearchSelect
						id="circle-member"
						people={candidates}
						name="contactId"
						bind:selectedIds={newMemberIds}
						multiple
						{keepSearch}
						allowCreate
						required
					/>
				</div>
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

	<CirclePhotosSection {data} error={form && 'photoError' in form ? (form.photoError ?? null) : null} {photoDate} onopen={openPhotos} />
</main>

{#if walk.current && walked}
	<CirclePhotoLightbox
		photo={walked}
		at={walk.current.at}
		count={walk.current.ids.length}
		circleName={circle.name}
		viewerId={data.viewerId}
		members={data.memberGroups.flatMap((g) => g.members)}
		people={data.people}
		cuts={data.cuts[walked.id]}
		error={form && 'photoError' in form ? (form.photoError ?? null) : null}
		{photoDate}
		onclose={() => walk.close()}
		onkeydown={(event) => walk.onkeydown(event)}
		onstep={(by) => walk.step(by)}
	/>
{/if}

{#if selecting}
	<MemberSelectionBar
		chosenIds={chosenMembers.map((m) => m.contactId)}
		{everyoneChosen}
		roleSuggestions={data.roleSuggestions}
		{roleSaved}
		bind:bulkRole
		ontoggleeveryone={() => (selectedIds = toggleEveryone(selectedIds, allIds))}
		onremove={removeChosen}
		{lastNames}
	/>
{/if}
