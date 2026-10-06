<script lang="ts">
	import Button from '$lib/components/Button.svelte';
	import KeptChip from '$lib/components/KeptChip.svelte';
	import RemoveButton from '$lib/components/RemoveButton.svelte';
	import Section from '$lib/components/Section.svelte';
	import { enhance } from '$app/forms';
	import { accentChipStyle } from '$lib/design/tokens';
	import { useI18n } from '$lib/i18n/context.svelte';
	import { keepable } from '$lib/pwa/keepable';
	import { isKept, type KeptOf } from '$lib/pwa/outbox';
	import { outbox } from '$lib/pwa/outbox.svelte';
	import { useRemovals } from '$lib/undo/context.svelte';
	import { removalKey, type RemovalKind } from '$lib/undo/keys';
	import { savedEnhance } from '$lib/undo/saved';
	import { INPUT } from './inputs';
	import type { PersonForm, PersonPageData } from './types';

	// Someone's tags (docs/02 §2.8): a row of the person page's profile card.
	let { data, form }: { data: PersonPageData; form: PersonForm } = $props();

	const i18n = useI18n();
	const t = i18n.t;
	const c = $derived(data.contact);

	// A row on its way out (docs/02 §2.23) is gone from the list while its undo window is open,
	// and back in it the moment Undo is pressed. The counts follow, so a section never says two
	// tags over one chip.
	const removals = useRemovals();
	const shown = <T extends { id: string }>(kind: RemovalKind, rows: T[]) =>
		rows.filter((row) => !removals.isPending(removalKey(kind, row.id)));
	const visibleTags = $derived(shown('tag', data.tags));

	/** What a folded profile row is worth reading for: the values themselves, not just a count. */
	const tagSummary = $derived(visibleTags.map((tag) => tag.name).join(', '));

	// Saving through `enhance` keeps the page — and with it any open undo window — alive, so
	// each section closes itself here instead of on the reload a redirect used to cause.
	let openSection = $state({ tags: false });
	type SectionName = keyof typeof openSection;
	const saved = (name: SectionName) =>
		savedEnhance(removals, t('components.saved'), () => (openSection[name] = false));
	/** What a form saved through the outbox does once Stella took it: say so, then `close`. */
	const savedThen = (close: () => void) => () => {
		removals.notify(t('components.saved'));
		close();
	};
	/*
	 * Tags and circles added here while Stella was out of reach: kept on the device and shown as
	 * dashed chips beside the real ones until they are sent (docs/02 §2.18).
	 */
	const keptTags = $derived(
		outbox.mine.filter(
			(item): item is KeptOf<'tag.assign'> =>
				isKept(item, 'tag.assign') && item.command.payload.contactId === c.id
		)
	);
	const tagForm = $derived(
		keepable(
			{
				toCommand: (form, id) => {
					const name = String(form.get('name') ?? '').trim();
					if (!name) return null;
					const color = form.get('color');
					return {
						id,
						type: 'tag.assign',
						payload: {
							contactId: c.id,
							name,
							color: typeof color === 'string' && color ? color : null
						},
						issuedAt: Date.now()
					};
				},
				about: c.displayName,
				errorKey: 'tagError',
				onApplied: savedThen(() => (openSection.tags = false)),
				onKept: () => (openSection.tags = false)
			},
			saved('tags')
		)
	);
</script>

<Section
	as="row"
	title={t('contact.section.tags')}
	count={visibleTags.length}
	summary={tagSummary}
	startOpen={visibleTags.length > 0}
	addLabel={t('common.add')}
	error={form?.tagError ?? null}
	bind:open={openSection.tags}
>
	{#if visibleTags.length || keptTags.length}
		<ul class="flex flex-wrap gap-1.5">
			{#each keptTags as item (item.command.id)}
				<KeptChip {item} label={item.command.payload.name} />
			{/each}
			{#each visibleTags as tag (tag.id)}
				<li
					class="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-sm font-medium"
					style={accentChipStyle(tag.color)}
				>
					{tag.name}
					<RemoveButton
						kind="tag"
						id={tag.id}
						action="?/removeTag"
						fields={{ tagId: tag.id }}
						label={t('contact.removeTag', { name: tag.name })}
						removed={t('contact.tagRemoved')}
						bare
						class="contents"
					/>
				</li>
			{/each}
		</ul>
	{:else}
		<p class="text-sm text-fg-subtle">{t('contact.noTags')}</p>
	{/if}

	{#snippet editor()}
		<form
			method="POST"
			action="?/addTag"
			use:enhance={tagForm}
			class="flex flex-wrap items-end gap-2"
		>
			<input
				name="name"
				placeholder={t('contact.tagName')}
				aria-label={t('contact.tagName')}
				required
				class="min-w-32 flex-1 {INPUT}"
			/>
			<select name="color" aria-label={t('contact.colour')} class={INPUT}>
				{#each data.tagColors as color (color)}<option value={color}>{color}</option>{/each}
			</select>
			<Button variant="primary" size="sm">{t('common.add')}</Button>
		</form>
	{/snippet}
</Section>
