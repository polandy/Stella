<script lang="ts">
	import Avatar from '$lib/components/ui/Avatar.svelte';
	import Icon from '$lib/components/ui/Icon.svelte';
	import { useTranslate } from '$lib/i18n/context.svelte';

	/*
	 * The likely second parent (rule L3, docs/02 §2.4.1), offered under the person field while
	 * one parent is picked for "Child of": one tap makes them a chip, nothing is preselected.
	 */

	interface Props {
		partner: { id: string; displayName: string; avatarPhotoId: string | null };
		/** The parent already picked, whose partner this is. */
		parentName: string;
		onadd: () => void;
	}
	let { partner, parentName, onadd }: Props = $props();

	const t = useTranslate();
</script>

<div
	class="flex flex-wrap items-center gap-2 rounded-control border border-dashed border-primary bg-card px-2 py-1.5 text-sm text-fg-muted"
	data-testid="second-parent-offer"
>
	<span>{t('contact.relationships.secondParentAlso')}</span>
	<button
		type="button"
		class="inline-flex min-h-8 items-center gap-1.5 rounded-full border border-primary bg-card py-0.5 pr-2.5 pl-0.5 text-fg hover:bg-primary-soft"
		aria-label={t('contact.relationships.secondParentAdd', { name: partner.displayName })}
		onclick={onadd}
	>
		<Avatar
			id={partner.id}
			name={partner.displayName}
			avatarPhotoId={partner.avatarPhotoId}
			size={24}
		/>
		<Icon name="add" size={14} />
		{partner.displayName}
	</button>
	<span class="text-xs text-fg-subtle">
		{t('contact.relationships.secondParentWhy', { name: parentName })}
	</span>
</div>
