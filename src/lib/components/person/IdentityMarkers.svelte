<script lang="ts">
	import Icon from '$lib/components/ui/Icon.svelte';
	import { dayLabel } from '$lib/dates/labels';
	import { useI18n } from '$lib/i18n/context.svelte';

	/** The marks under a person's name: that this is you, that the record is private or archived. */
	let {
		isSelf,
		isPrivate,
		archived,
		archivedAt
	}: { isSelf: boolean; isPrivate: boolean; archived: boolean; archivedAt: number | null } =
		$props();

	const i18n = useI18n();
	const t = i18n.t;

	/** The day it happened, for the marker's tooltip. */
	const archivedOn = $derived(
		archivedAt === null ? null : dayLabel(i18n, new Date(archivedAt).toLocaleDateString('en-CA'))
	);
</script>

<div class="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-fg-subtle">
	{#if isSelf}
		<span
			data-testid="self-marker"
			class="inline-flex items-center gap-1 rounded-full bg-primary-soft px-2 py-0.5 text-primary"
			title={t('contact.self.badgeHint')}
		>
			<Icon name="self" size={11} />{t('common.you')}
		</span>
	{/if}
	{#if isPrivate}
		<span class="inline-flex items-center gap-1" title={t('contact.privateContact')}>
			<Icon name="private" size={11} />{t('contact.private')}
		</span>
	{/if}
	{#if archived}
		<span
			data-testid="archived-marker"
			class="inline-flex items-center gap-1 rounded-full bg-bg-sunken px-2 py-0.5 text-fg-muted"
			title={t('contact.archivedOn', { day: archivedOn ?? '' })}
		>
			<Icon name="archive" size={11} />{t('contact.archived')}
		</span>
	{/if}
</div>
