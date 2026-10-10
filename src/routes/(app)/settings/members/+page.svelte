<script lang="ts">
	import RemoveMemberStep from '$lib/components/members/RemoveMemberStep.svelte';
	import Avatar from '$lib/components/ui/Avatar.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import Icon from '$lib/components/ui/Icon.svelte';
	import { useI18n } from '$lib/i18n/context.svelte';
	import { useRemovals } from '$lib/undo/context.svelte';
	import type { PageData } from './$types';

	/*
	 * The household's members (docs/02 §2.1): who signs in, and how. An admin removes any other
	 * member from their row, after the confirm step; the member then moves to *Former members*,
	 * and the toast has no Undo — a removal is confirmed, not held back (docs/05 §5.7).
	 */
	let { data }: { data: PageData } = $props();
	const i18n = useI18n();
	const t = i18n.t;
	const removals = useRemovals();

	type Member = PageData['current'][number];

	/** The one row whose confirm step is open. */
	let removing = $state<string | null>(null);

	const signInOf = (m: Member) =>
		m.signIn.password && m.signIn.sso
			? t('settings.members.signIn.both')
			: m.signIn.sso
				? t('settings.members.signIn.sso')
				: t('settings.members.signIn.password');

	const day = (at: number) =>
		new Date(at).toLocaleDateString(i18n.intlLocale, { dateStyle: 'medium' });

	const PILL = 'rounded-full px-2 py-px text-[11px] font-semibold';
</script>

<svelte:head
	><title>{t('common.pageTitle', { page: t('settings.members.title') })}</title></svelte:head
>

<main class="mx-auto flex w-full max-w-2xl flex-col gap-8 px-6 py-10">
	<header class="flex flex-col gap-1">
		<a href="/settings" class="flex items-center gap-1 text-sm text-link hover:underline">
			<Icon name="forward" size={12} />{t('nav.settings')}
		</a>
		<h1 class="text-2xl font-semibold text-fg">{t('settings.members.title')}</h1>
		<p class="text-fg-muted">
			{t('settings.members.intro')}
			{#if !data.isAdmin}{t('settings.members.adminOnly')}{/if}
		</p>
	</header>

	<ul class="flex flex-col rounded-app bg-card px-4 shadow-card" data-testid="members">
		{#each data.current as member (member.id)}
			{@const preview = data.previews[member.id]}
			<li class="border-b border-border-subtle last:border-b-0">
				<div class="flex items-center gap-3 py-3">
					<Avatar id={member.id} name={member.name} size={40} />
					<div class="min-w-0 flex-1">
						<p class="flex flex-wrap items-center gap-1.5 font-medium text-fg">
							{member.name}
							{#if member.id === data.viewerId}
								<span class="{PILL} bg-bg-sunken text-fg-muted">{t('settings.members.you')}</span>
							{/if}
							{#if member.role === 'admin'}
								<span class="{PILL} bg-primary-soft text-primary"
									>{t('settings.members.admin')}</span
								>
							{/if}
						</p>
						<p class="truncate text-sm text-fg-muted">{member.email}</p>
						<p class="text-xs text-fg-subtle">{signInOf(member)}</p>
					</div>
					{#if preview}
						<Button
							variant="ghost"
							size="sm"
							icon="remove"
							label={t('settings.members.removeLabel', { name: member.name })}
							aria-expanded={removing === member.id}
							onclick={() => (removing = removing === member.id ? null : member.id)}
							>{t('settings.members.remove')}</Button
						>
					{/if}
				</div>
				{#if preview && removing === member.id}
					<RemoveMemberStep
						{preview}
						onkeep={() => (removing = null)}
						onremoved={() => {
							removing = null;
							removals.notify(t('settings.members.removed', { name: preview.name }));
						}}
					/>
				{/if}
			</li>
		{/each}
	</ul>

	{#if data.former.length > 0}
		<section class="flex flex-col gap-3">
			<h2 class="text-sm font-medium text-fg-muted">{t('settings.members.former')}</h2>
			<ul class="flex flex-col rounded-app bg-card px-4 shadow-card" data-testid="former-members">
				{#each data.former as member (member.id)}
					<li class="flex items-center gap-3 border-b border-border-subtle py-3 last:border-b-0">
						<span class="opacity-70"><Avatar id={member.id} name={member.name} size={40} /></span>
						<div class="min-w-0 flex-1">
							<p class="font-medium text-fg-muted">{member.name}</p>
							<p class="truncate text-sm text-fg-subtle">{member.email}</p>
							{#if member.removedAt !== null}
								<p class="text-xs text-fg-subtle">
									{t('settings.members.removedOn', { date: day(member.removedAt) })}
								</p>
							{/if}
						</div>
					</li>
				{/each}
			</ul>
		</section>
	{/if}
</main>
