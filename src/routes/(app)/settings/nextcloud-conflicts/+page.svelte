<script lang="ts">
	import { enhance } from '$app/forms';
	import { dateText } from '$lib/components/import/review-text';
	import Avatar from '$lib/components/ui/Avatar.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import EmptyState from '$lib/components/ui/EmptyState.svelte';
	import FormError from '$lib/components/ui/FormError.svelte';
	import Icon from '$lib/components/ui/Icon.svelte';
	import { useI18n } from '$lib/i18n/context.svelte';
	import { thumbnailUrl } from '$lib/media/urls';
	import type { ActionData, PageData } from './$types';

	/*
	 * The differences a sync of the linked Nextcloud book found (docs/02 §2.16.3). Each row is one
	 * fact with both sides as buttons: the answer is one tap, and the row leaves the list.
	 */

	let { data, form }: { data: PageData; form: ActionData } = $props();
	const i18n = useI18n();
	const t = i18n.t;

	type Row = PageData['conflicts'][number];

	const title = (c: Row['conflict']) =>
		c.kind === 'photo' ? t('nextcloud.conflicts.photo') : t(`import.review.conflict.${c.kind}`);

	/** One side's value in words; a picture conflict shows pictures instead. */
	const side = (c: Row['conflict'], which: 'stella' | 'card') =>
		c.kind === 'photo' ? '' : c.kind === 'birthday' ? dateText(i18n, c[which]) : c[which];
</script>

<svelte:head><title>{t('nextcloud.conflicts.pageTitle')}</title></svelte:head>

<main class="mx-auto flex w-full max-w-2xl flex-col gap-6 px-6 py-10">
	<header class="flex flex-col gap-1">
		<a href="/settings" class="flex items-center gap-1 text-sm text-link hover:underline">
			<Icon name="forward" size={12} />{t('nav.settings')}
		</a>
		<h1 class="text-2xl font-semibold text-fg">{t('nextcloud.conflicts.title')}</h1>
		<p class="text-fg-muted">{t('nextcloud.conflicts.intro')}</p>
	</header>

	<FormError message={form?.gone ?? null} />

	{#if data.conflicts.length === 0}
		<EmptyState
			icon="done"
			title={t('nextcloud.conflicts.empty.title')}
			hint={t('nextcloud.conflicts.empty.hint')}
		>
			<Button href="/settings">{t('nav.settings')}</Button>
		</EmptyState>
	{:else}
		<ul class="flex flex-col gap-3" data-testid="nextcloud-conflicts">
			{#each data.conflicts as row (row.contactId + row.conflict.kind)}
				<li class="flex flex-col gap-3 rounded-app bg-card p-4 shadow-card">
					<div class="flex items-center gap-3">
						<Avatar
							id={row.contactId}
							name={row.displayName}
							avatarPhotoId={row.stellaPhotoId}
							size={32}
						/>
						<div class="min-w-0">
							<a
								href="/contacts/{row.contactId}"
								class="block truncate font-medium text-fg hover:underline">{row.displayName}</a
							>
							<p class="flex items-center gap-1.5 text-xs font-medium text-fg-muted">
								<Icon name="conflict" size={14} class="text-warning" />{title(row.conflict)}
							</p>
						</div>
					</div>
					<form method="POST" action="?/answer" use:enhance class="grid grid-cols-2 gap-2">
						<input type="hidden" name="contactId" value={row.contactId} />
						<input type="hidden" name="kind" value={row.conflict.kind} />
						{#each ['stella', 'card'] as const as which (which)}
							<button
								name="take"
								value={which}
								class="flex min-w-0 flex-col items-start gap-1 rounded-md border border-border px-3 py-2 text-left hover:border-primary hover:bg-primary-soft focus-visible:outline-2 focus-visible:outline-focus-ring"
							>
								<span class="text-xs text-fg-subtle">
									{which === 'stella'
										? t('nextcloud.conflicts.keepStella')
										: t('nextcloud.conflicts.takeCard')}
								</span>
								{#if row.conflict.kind === 'photo'}
									{@const picture =
										which === 'stella'
											? row.stellaPhotoId && thumbnailUrl(row.stellaPhotoId)
											: row.cardPicture}
									{#if picture}
										<img src={picture} alt="" class="size-16 rounded-md object-cover" />
									{:else}
										<span class="text-sm text-fg-muted">{t('nextcloud.conflicts.noPhoto')}</span>
									{/if}
								{:else}
									<span class="max-w-full truncate text-sm text-fg"
										>{side(row.conflict, which)}</span
									>
								{/if}
							</button>
						{/each}
					</form>
				</li>
			{/each}
		</ul>
	{/if}
</main>
