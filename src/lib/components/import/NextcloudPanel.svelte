<script lang="ts">
	import { enhance } from '$app/forms';
	import Button from '$lib/components/ui/Button.svelte';
	import FormError from '$lib/components/ui/FormError.svelte';
	import Icon from '$lib/components/ui/Icon.svelte';
	import { useI18n } from '$lib/i18n/context.svelte';

	/*
	 * The household's linked Nextcloud book on the import page (docs/02 §2.16.3): when it last
	 * synced, *Sync now*, its new cards into the same review a vCard goes through, and the way to
	 * the differences waiting under Data quality. Opening Stella syncs it too; this is for now.
	 */
	interface Props {
		status: { syncedAt: number | null; failing: boolean; newCards: number; conflicts: number };
		synced: { written: number; updated: number; unlinked: number } | null;
		error: string | null;
	}
	let { status, synced, error }: Props = $props();

	const i18n = useI18n();
	const t = i18n.t;
	let syncing = $state(false);

	const syncedAt = $derived(
		status.syncedAt === null
			? null
			: new Intl.DateTimeFormat(i18n.intlLocale, {
					dateStyle: 'medium',
					timeStyle: 'short'
				}).format(status.syncedAt)
	);
</script>

<section
	class="flex flex-col gap-3 rounded-app bg-card p-5 shadow-card"
	aria-labelledby="nextcloud-title"
	data-testid="nextcloud-panel"
>
	<div class="flex items-start gap-3">
		<div class="min-w-0 flex-1">
			<h2 id="nextcloud-title" class="font-medium text-fg">{t('nextcloud.panel.title')}</h2>
			<p class="text-sm text-fg-muted">{t('nextcloud.panel.intro')}</p>
		</div>
		<form
			method="POST"
			action="?/nextcloudSync"
			use:enhance={() => {
				syncing = true;
				return async ({ update }) => {
					await update();
					syncing = false;
				};
			}}
		>
			<Button size="sm" disabled={syncing}>
				<Icon name="sync" size={14} class={syncing ? 'animate-spin' : ''} />
				{t('nextcloud.panel.syncNow')}
			</Button>
		</form>
	</div>

	<FormError message={error} />
	<p class="text-xs text-fg-subtle" data-testid="nextcloud-synced-at">
		{syncedAt ? t('nextcloud.panel.syncedAt', { when: syncedAt }) : t('nextcloud.panel.never')}
	</p>
	{#if status.failing && !error}
		<p class="flex items-center gap-1.5 text-sm text-warning" role="status">
			<Icon name="offline" size={14} />{t('nextcloud.panel.failing')}
		</p>
	{/if}
	{#if synced}
		<p class="rounded-md bg-success/10 px-3 py-2 text-sm text-fg" role="status">
			{t('nextcloud.panel.synced', synced)}
		</p>
	{/if}

	{#if status.newCards > 0}
		<form
			method="POST"
			action="?/nextcloudReview"
			class="flex items-center justify-between gap-3 border-t border-border pt-3"
		>
			<span class="text-sm text-fg" data-testid="nextcloud-new-cards">
				{t('nextcloud.panel.newCards', { count: status.newCards })}
			</span>
			<Button variant="primary" size="sm">{t('nextcloud.panel.review')}</Button>
		</form>
	{/if}
	{#if status.conflicts > 0}
		<a
			href="/settings/nextcloud-conflicts"
			class="flex items-center gap-1.5 text-sm text-link hover:underline"
		>
			<Icon name="conflict" size={14} class="text-warning" />
			{t('nextcloud.panel.conflicts', { count: status.conflicts })}
		</a>
	{/if}
</section>
