<script lang="ts">
	import { enhance } from '#lib/forms/enhance.js';
	import { INPUT } from '#lib/components/ui/inputs.js';
	import Button from '#lib/components/ui/Button.svelte';
	import WhenPicker from '#lib/components/ui/WhenPicker.svelte';
	import { previewRows } from '#lib/gifts/group-form.js';
	import { GIFT_WHEN_KINDS } from '#lib/gifts/idea-when.js';
	import { useI18n } from '#lib/i18n/context.svelte.js';
	import { useRemovals } from '#lib/undo/context.svelte.js';
	import { savedEnhance } from '#lib/undo/saved.js';
	import { whenPreview } from '#lib/when/labels.js';
	import { sameWhen, type When } from '#lib/when/when.js';
	import type { GiftGroupView } from '../../../routes/(app)/contacts/[id]/gift-group-view';

	/*
	 * *Change* in *Who has it?* (docs/dev/02 §2.25.11): for every open gift of it, or only for the
	 * person whose card it opened on. A new when is previewed per idea; one it no longer fits keeps
	 * its own (D6), and a given gift stays as it was given.
	 */
	interface Props {
		group: GiftGroupView;
		contactId: string;
		today: string;
		open: GiftGroupView['members'];
		onDone: () => void;
	}
	let { group, contactId, today, open, onDone }: Props = $props();

	const i18n = useI18n();
	const t = i18n.t;
	const removals = useRemovals();
	const list = (names: string[]) =>
		new Intl.ListFormat(i18n.intlLocale, { type: 'conjunction' }).format(names);

	// svelte-ignore state_referenced_locally
	let when = $state<When | null>(group.when);
	let scope = $state<'all' | 'one'>('all');
	const own = $derived(open.find((m) => m.contactId === contactId) ?? null);
	const ideas = $derived(open.filter((m) => m.state === 'idea'));
	const birthOf = (id: string) => ideas.find((m) => m.contactId === id)?.birth ?? null;
	const previews = $derived(
		scope === 'all' && !sameWhen(when, group.when)
			? previewRows(
					when,
					ideas.map((m) => ({ contactId: m.contactId, ticked: true })),
					birthOf,
					today
				)
			: []
	);
	const nameOf = (id: string) => open.find((m) => m.contactId === id)?.name ?? '';
	// An action keeps its first argument: the arrow reads the scope at submit.
	const saved = $derived(
		savedEnhance(
			removals,
			scope === 'one' && own
				? t('gifts.group.changedOne', { name: own.name })
				: t('gifts.group.changedAll', { count: open.length }),
			onDone
		)
	);
</script>

<form
	method="POST"
	action="?/editGiftGroup"
	use:enhance={(input) => saved(input)}
	class="flex flex-col gap-4"
	data-testid="gift-group-edit"
>
	<input type="hidden" name="groupId" value={group.id} />
	{#if scope === 'one' && own}<input type="hidden" name="only" value={own.giftId} />{/if}
	<label class="flex flex-col gap-1">
		<span class="text-xs font-medium text-fg-muted">{t('gifts.form.what')}</span>
		<input name="title" required value={group.title} class="{INPUT} w-full" />
	</label>
	<label class="flex flex-col gap-1">
		<span class="text-xs font-medium text-fg-muted">{t('gifts.form.note')}</span>
		<textarea name="note" rows="2" class="{INPUT} w-full">{group.note ?? ''}</textarea>
	</label>
	<label class="flex flex-col gap-1">
		<span class="text-xs font-medium text-fg-muted">{t('gifts.form.link')}</span>
		<input
			name="url"
			inputmode="url"
			value={group.url ?? ''}
			placeholder="https://"
			class="{INPUT} w-full"
		/>
	</label>
	<WhenPicker
		when={group.when}
		birth={null}
		{today}
		kinds={GIFT_WHEN_KINDS}
		several
		onchoose={(next) => (when = next)}
	/>
	{#if previews.length}
		<ul class="flex flex-col gap-1 text-sm" aria-label={t('gifts.several.preview')}>
			{#each previews as preview (preview.contactId)}
				<li class="flex gap-2">
					<span class="font-medium text-fg">{nameOf(preview.contactId)}</span>
					<span class={preview.problem ? 'text-fg-subtle' : 'text-fg-muted'}
						>{preview.problem ? t('gifts.group.keeps') : whenPreview(i18n, preview.outlook)}</span
					>
				</li>
			{/each}
		</ul>
	{/if}
	<fieldset class="flex flex-col gap-2 text-sm">
		<legend class="mb-1 text-xs font-medium text-fg-muted">{t('gifts.group.scope')}</legend>
		<label class="flex items-start gap-2">
			<span class="min-w-0 flex-1"
				>{t('gifts.group.scopeAll', { count: open.length })}<span
					class="block text-xs text-fg-subtle"
					>{t('gifts.group.scopeAllHint', { names: list(open.map((m) => m.name)) })}</span
				></span
			>
			<input type="radio" name="scope" value="all" bind:group={scope} class="mt-1" />
		</label>
		{#if own}
			<label class="flex items-start gap-2">
				<span class="min-w-0 flex-1"
					>{t('gifts.group.scopeOne', { name: own.name })}<span class="block text-xs text-fg-subtle"
						>{t('gifts.group.scopeOneHint')}</span
					></span
				>
				<input type="radio" name="scope" value="one" bind:group={scope} class="mt-1" />
			</label>
		{/if}
	</fieldset>
	<div class="flex justify-end gap-2">
		<Button variant="ghost" size="sm" type="button" onclick={onDone}>{t('common.cancel')}</Button>
		<Button variant="primary" size="sm">{t('common.save')}</Button>
	</div>
</form>
