<script lang="ts">
	import FormError from '$lib/components/ui/FormError.svelte';
	import Icon from '$lib/components/ui/Icon.svelte';
	import { useI18n } from '$lib/i18n/context.svelte';
	import type { PersonPageData } from './types';

	/*
	 * The line under a linked person's gallery (docs/02 §2.24.3): how many
	 * photos Immich has of them and, for every member, the way there. It fills in after the
	 * page — the answer is a promise — so a slow Immich never holds the page up, and a failure
	 * is one quiet line rather than an error page. A person deleted in Immich offers the unlink.
	 */
	interface Props {
		/** What Immich says about the linked person, or null when the person is not linked. */
		person: PersonPageData['immichPerson'];
		/** Why the last link was refused, from the form action. */
		error: string | null;
	}
	let { person, error }: Props = $props();

	const i18n = useI18n();
	const t = i18n.t;

	const shownCount = (count: number) => new Intl.NumberFormat(i18n.intlLocale).format(count);
</script>

{#if person || error}
	<div
		class="mt-4 flex flex-col gap-2 border-t border-border-subtle pt-3"
		data-testid="immich-line"
	>
		<FormError message={error} variant="inline" />
		{#if person}
			<div class="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
				<span class="text-fg-subtle" aria-hidden="true"><Icon name="photo" size={14} /></span>
				{#await person}
					<span class="text-fg-subtle">{t('immich.row.asking')}</span>
				{:then seen}
					{#if seen.state === 'linked'}
						<span class="text-fg" data-testid="immich-count">
							{seen.photoCount === null
								? t('immich.row.label')
								: t('immich.row.photos', {
										count: seen.photoCount,
										shown: shownCount(seen.photoCount)
									})}
						</span>
						<a
							href={seen.openUrl}
							target="_blank"
							rel="noopener noreferrer"
							class="inline-flex items-center gap-1 font-medium text-link hover:underline"
							data-testid="immich-open"
						>
							{t('immich.row.open')}<Icon name="openElsewhere" size={13} />
						</a>
					{:else if seen.state === 'personGone'}
						<span class="text-fg-muted">{t('immich.row.gone')}</span>
						<form method="POST" action="?/unlinkImmich" class="contents">
							<button type="submit" class="font-medium text-link hover:underline"
								>{t('immich.row.unlinkQuestion')}</button
							>
						</form>
					{:else}
						<span class="text-fg-muted">{t('immich.row.unreachable')}</span>
					{/if}
				{/await}
			</div>
		{/if}
	</div>
{/if}
