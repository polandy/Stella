<script lang="ts">
	import { enhance } from '$app/forms';
	import Avatar from '$lib/components/Avatar.svelte';
	import Button from '$lib/components/Button.svelte';
	import EmptyState from '$lib/components/EmptyState.svelte';
	import PersonSearchSelect from '$lib/components/PersonSearchSelect.svelte';
	import RemoveButton from '$lib/components/RemoveButton.svelte';
	import Section from '$lib/components/Section.svelte';
	import { circleKindLabel } from '$lib/circles/labels';
	import { accentDotStyle } from '$lib/design/tokens';
	import { useTranslate } from '$lib/i18n/context.svelte';
	import { useRemovals } from '$lib/undo/context.svelte';
	import { removalKey } from '$lib/undo/keys';
	import { savedEnhance } from '$lib/undo/saved';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();
	const t = useTranslate();
	const circle = $derived(data.circle);

	// A member on their way out of the circle is off the grid while the undo window is open.
	const removals = useRemovals();
	const visibleMembers = $derived(
		data.members.filter((m) => !removals.isPending(removalKey('membership', m.membershipId)))
	);
	let addOpen = $state(false);
	let newMemberId = $state<string[]>([]);
	const saved = savedEnhance(removals, t('components.saved'), () => {
		addOpen = false;
		newMemberId = [];
	});
	const INPUT = 'rounded-md border border-border bg-bg px-3 py-2 text-fg';
</script>

<svelte:head><title>{t('circles.detail.title', { name: circle.name })}</title></svelte:head>

<main class="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-6 md:px-6 md:py-10">
	<header class="flex items-center gap-4">
		<span class="grid size-12 shrink-0 place-items-center rounded-full" style={accentDotStyle(circle.color)}>
			<span class="size-4 rounded-full bg-card/70"></span>
		</span>
		<div class="min-w-0">
			<h1 class="truncate text-2xl font-semibold text-fg">{circle.name}</h1>
			<p class="text-sm text-fg-muted">
				<span>{circleKindLabel(t, circle.kind)}</span>
				{#if circle.description} · {circle.description}{/if}
				{#if circle.visibility === 'private'} · {t('circles.private')}{/if}
			</p>
		</div>
	</header>

	<Section
		title={t('circles.members')}
		count={visibleMembers.length}
		addLabel={data.candidates.length ? t('circles.addMember') : undefined}
		error={form?.error ?? null}
		bind:open={addOpen}
	>
		{#if visibleMembers.length}
			<ul class="grid gap-2 sm:grid-cols-2 lg:grid-cols-3" data-testid="member-grid">
				{#each visibleMembers as m (m.membershipId)}
					<li class="flex items-center gap-3 rounded-app bg-bg px-3 py-2.5">
						<Avatar id={m.contactId} name={m.displayName} avatarPhotoId={m.avatarPhotoId} size={40} />
						<span class="min-w-0 flex-1">
							<a href="/contacts/{m.contactId}" class="block truncate font-medium text-fg hover:underline">{m.displayName}</a>
							{#if m.role}<span class="block truncate text-xs text-fg-subtle">{m.role}</span>{/if}
						</span>
						<RemoveButton
							kind="membership"
							id={m.membershipId}
							action="?/removeMember"
							fields={{ contactId: m.contactId }}
							label={t('circles.removeMember', { name: m.displayName })}
							removed={t('circles.removedFromCircle')}
						/>
					</li>
				{/each}
			</ul>
		{:else}
			<EmptyState
				icon="people"
				title={t('circles.noMembers.title')}
				hint={t('circles.noMembers.hint')}
			/>
		{/if}

		{#snippet editor()}
			<form method="POST" action="?/addMember" use:enhance={saved} class="flex flex-wrap items-end gap-3">
				<label class="flex flex-1 flex-col gap-1 text-sm">
					<span class="text-fg-muted">{t('circles.person')}</span>
					<PersonSearchSelect
						people={data.candidates}
						name="contactId"
						bind:selectedIds={newMemberId}
						required
					/>
				</label>
				<label class="flex flex-col gap-1 text-sm">
					<span class="text-fg-muted">{t('circles.roleLabel')}</span>
					<input name="role" placeholder={t('circles.rolePlaceholder')} class="w-32 {INPUT}" />
				</label>
				<Button variant="primary" size="sm">{t('common.add')}</Button>
			</form>
		{/snippet}
	</Section>
</main>
