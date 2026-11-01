<script lang="ts">
	import { INPUT } from '$lib/components/person/inputs';
	import { useI18n } from '$lib/i18n/context.svelte';
	import type { ShareTarget } from '$lib/share/shared';

	/** What is saved for the picked target, editable before it is; the profile photo has none. */
	let {
		target,
		personName,
		linkAdded,
		momentBody = $bindable(),
		giftTitle = $bindable(),
		giftUrl = $bindable(),
		todoWords = $bindable(),
		visibility = $bindable()
	}: {
		target: ShareTarget | null;
		personName: string | null;
		/** The shared link goes on the end of the to-do, so the field says so. */
		linkAdded: boolean;
		momentBody: string;
		giftTitle: string;
		giftUrl: string;
		todoWords: string;
		visibility: 'shared' | 'private';
	} = $props();

	const t = useI18n().t;
</script>

{#if target === 'moment'}
	<label class="flex flex-col gap-2">
		<span class="text-sm text-fg-muted">{t('share.moment.label', { name: personName ?? '…' })}</span
		>
		<textarea
			bind:value={momentBody}
			rows="4"
			class="{INPUT} w-full resize-none font-serif text-[17px] leading-relaxed"
			data-testid="share-moment"></textarea>
	</label>
{:else if target === 'gift'}
	<div class="flex flex-col gap-3">
		<label class="flex flex-col gap-1.5">
			<span class="text-sm text-fg-muted">{t('share.gift.title')}</span>
			<input
				bind:value={giftTitle}
				class="{INPUT} w-full text-[15px]"
				data-testid="share-gift-title"
			/>
		</label>
		<label class="flex flex-col gap-1.5">
			<span class="text-sm text-fg-muted">{t('share.gift.link')}</span>
			<input type="url" bind:value={giftUrl} class="{INPUT} w-full text-[15px]" />
		</label>
	</div>
{:else if target === 'todo'}
	<label class="flex flex-col gap-1.5">
		<span class="text-sm text-fg-muted">{t('share.todo.label')}</span>
		<input bind:value={todoWords} class="{INPUT} w-full text-[15px]" data-testid="share-todo" />
		{#if linkAdded}
			<span class="text-xs text-fg-muted">{t('share.todo.linkAdded')}</span>
		{/if}
	</label>
{:else if target === 'avatar'}
	<p class="text-sm text-fg-muted">{t('share.avatar.hint')}</p>
{/if}

{#if target !== 'avatar'}
	<fieldset class="flex flex-wrap items-center gap-4 text-sm text-fg">
		<legend class="sr-only">{t('common.visibility')}</legend>
		<label class="flex items-center gap-1.5">
			<input type="radio" value="shared" bind:group={visibility} />
			{t('common.shared')}
		</label>
		<label class="flex items-center gap-1.5">
			<input type="radio" value="private" bind:group={visibility} />
			{t('common.private')}
		</label>
	</fieldset>
{/if}
