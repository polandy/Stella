<script lang="ts">
	import { enhance } from '$app/forms';
	import { goto } from '$app/navigation';
	import { browser } from '$app/environment';
	import { giftGroupAddCommand, groupNotedOf } from '$lib/components/gifts/gift-group-command';
	import GroupPreviewRow from '$lib/components/gifts/GroupPreviewRow.svelte';
	import PersonSearchSelect from '$lib/components/people/PersonSearchSelect.svelte';
	import { INPUT } from '$lib/components/person/inputs';
	import Button from '$lib/components/ui/Button.svelte';
	import FormError from '$lib/components/ui/FormError.svelte';
	import Icon from '$lib/components/ui/Icon.svelte';
	import WhenPicker from '$lib/components/when/WhenPicker.svelte';
	import type { IconName } from '$lib/components/ui/icons';
	import { deviceDay, writersDay } from '$lib/dates/today';
	import { SURPRISE } from '$lib/gifts/gifts';
	import {
		groupLanding,
		groupSummary,
		previewRows,
		recipientsField,
		shortcutPressed,
		storedBirth,
		type GroupFormRow,
		type GroupShortcut
	} from '$lib/gifts/group-form';
	import { GIFT_GROUP_MAX_RECIPIENTS } from '$lib/gifts/group-plan';
	import { GIFT_WHEN_KINDS } from '$lib/gifts/idea-when';
	import { useI18n } from '$lib/i18n/context.svelte';
	import { contactSectionPath } from '$lib/people/sections';
	import { keepable } from '$lib/pwa/keepable';
	import { useRemovals } from '$lib/undo/context.svelte';
	import type { When } from '$lib/when/when';
	import type { ActionData, PageData } from './$types';

	/*
	 * One gift idea for several people (docs/dev/02 §2.25.11): who it is for — picked by name or by
	 * a shortcut — and one when, previewed per person before anything is noted. A grey row says why
	 * it does not fit, and how to help it. Saved through the outbox, as the Gifts card is (§2.18).
	 */
	let { data, form }: { data: PageData; form: ActionData } = $props();

	const i18n = useI18n();
	const t = i18n.t;
	const removals = useRemovals();
	const today = $derived(writersDay(data.today, browser ? deviceDay() : null));
	const byId = $derived(new Map(data.people.map((p) => [p.id, p])));
	const birthOf = (id: string) => storedBirth(byId.get(id)?.birthDate ?? null);
	const nameOf = (id: string) => byId.get(id)?.displayName ?? '';
	const names = (ids: readonly string[]) =>
		new Intl.ListFormat(i18n.intlLocale, { type: 'conjunction' }).format(ids.map(nameOf));

	// svelte-ignore state_referenced_locally
	const anchor = data.anchorId !== null && byId.has(data.anchorId) ? data.anchorId : null;
	let rows = $state<GroupFormRow[]>(anchor ? [{ contactId: anchor, ticked: true }] : []);
	let when = $state<When | null>(null);
	let title = $state('');
	let showMore = $state(false);
	let visibility = $state<'shared' | 'private' | typeof SURPRISE>('shared');
	let picked = $state<string[]>([]);

	const previews = $derived(previewRows(when, rows, birthOf, today));
	const summary = $derived(groupSummary(previews));
	const recipients = $derived(recipientsField(previews, rows));
	const ticked = $derived(new Set(rows.filter((row) => row.ticked).map((row) => row.contactId)));
	const rowOf = $derived(new Map(rows.map((row) => [row.contactId, row])));
	const offered = $derived(data.people.filter((p) => !rowOf.has(p.id)));
	// A surprise keeps it from every chosen member whose own person they are (§2.25.10).
	const keptFrom = $derived(
		recipients.map((r) => r.contactId).filter((id) => data.keptFrom.includes(id))
	);
	$effect(() => {
		if (visibility === SURPRISE && keptFrom.length === 0) visibility = 'shared';
	});

	const back = $derived(anchor ? contactSectionPath(anchor, 'gifts') : '/gifts');
	const full = $derived(rows.length >= GIFT_GROUP_MAX_RECIPIENTS);

	function add(ids: readonly string[]) {
		const known = ids.filter((id) => byId.has(id));
		rows = [
			...rows.map((row) => (known.includes(row.contactId) ? { ...row, ticked: true } : row)),
			...known.filter((id) => !rowOf.has(id)).map((contactId) => ({ contactId, ticked: true }))
		].slice(0, GIFT_GROUP_MAX_RECIPIENTS);
	}
	function press(shortcut: GroupShortcut) {
		if (!shortcutPressed(shortcut, ticked)) return add(shortcut.ids);
		rows = rows.map((row) =>
			shortcut.ids.includes(row.contactId) ? { ...row, ticked: false } : row
		);
	}
	function change(next: GroupFormRow) {
		rows = rows.map((row) => (row.contactId === next.contactId ? next : row));
	}

	const SHORTCUT_ICON = {
		children: 'people',
		siblings: 'people',
		home: 'home',
		circle: 'circles'
	} as const satisfies Record<GroupShortcut['kind'], IconName>;
	function shortcutLabel(shortcut: GroupShortcut): string {
		if (shortcut.kind === 'children') return t('gifts.several.childrenOf', { name: shortcut.name });
		if (shortcut.kind === 'siblings') return t('gifts.several.siblingsOf', { name: shortcut.name });
		return shortcut.name;
	}
	const missingText = $derived(
		(['needsBirthYear', 'tooOld', 'other'] as const)
			.map((reason) => {
				const ids = summary.missing.filter((m) => m.reason === reason).map((m) => m.contactId);
				return ids.length ? t(`gifts.several.missing.${reason}`, { names: names(ids) }) : '';
			})
			.filter(Boolean)
			.join(' · ')
	);
	const total = $derived(summary.chosen + summary.missing.length);

	const keep = $derived(
		keepable(
			{
				toCommand: (formData, id) => giftGroupAddCommand(formData, id, Date.now()),
				about: (formData) => {
					const command = giftGroupAddCommand(formData, '', 0);
					return names(command?.payload.recipients.map((r) => r.contactId) ?? []);
				},
				errorKey: 'giftError',
				onApplied: async (result, command) => {
					if (command.type !== 'giftGroup.add') return;
					const { noted, skipped } = groupNotedOf(result);
					removals.notify(
						skipped.length
							? t('gifts.several.notedBut', { count: noted, names: names(skipped) })
							: t('gifts.several.noted', { count: noted })
					);
					await goto(contactSectionPath(groupLanding(command.payload.recipients, anchor), 'gifts'));
				},
				onKept: () => goto(back)
			},
			() => {}
		)
	);
</script>

<svelte:head><title>{t('common.pageTitle', { page: t('gifts.several.title') })}</title></svelte:head
>

<main class="mx-auto flex w-full max-w-2xl flex-col gap-4 px-4 py-6 md:px-6 md:py-10">
	<header class="flex items-center gap-2">
		<a
			href={back}
			class="grid size-9 place-items-center rounded-full text-fg-muted hover:bg-primary-soft"
			aria-label={t('common.cancel')}
		>
			<Icon name="back" size={18} />
		</a>
		<h1 class="text-2xl font-semibold text-fg">{t('gifts.several.title')}</h1>
	</header>

	<form
		method="POST"
		action="?/add"
		use:enhance={keep}
		class="flex flex-col gap-4"
		data-testid="gift-group-form"
	>
		<input type="hidden" name="recipients" value={JSON.stringify(recipients)} />
		<section class="flex flex-col gap-4 rounded-app bg-card px-4 py-4 shadow-card">
			<label class="flex flex-col gap-1">
				<span class="text-xs font-medium text-fg-muted">{t('gifts.form.what')}</span>
				<input
					name="title"
					required
					bind:value={title}
					placeholder={t('gifts.form.whatPlaceholder')}
					class="{INPUT} w-full"
				/>
			</label>
			{#if showMore}
				<label class="flex flex-col gap-1">
					<span class="text-xs font-medium text-fg-muted">{t('gifts.form.note')}</span>
					<textarea
						name="note"
						rows="2"
						placeholder={t('gifts.form.notePlaceholder')}
						class="{INPUT} w-full"></textarea>
				</label>
				<label class="flex flex-col gap-1">
					<span class="text-xs font-medium text-fg-muted">{t('gifts.form.link')}</span>
					<input name="url" inputmode="url" placeholder="https://" class="{INPUT} w-full" />
				</label>
			{:else}
				<button
					type="button"
					onclick={() => (showMore = true)}
					class="inline-flex w-fit items-center gap-1 text-sm text-link hover:underline"
				>
					<Icon name="add" size={13} />{t('gifts.form.more')}
				</button>
			{/if}

			<div class="flex flex-col gap-2">
				<span class="text-xs font-medium text-fg-muted">{t('gifts.several.who')}</span>
				{#if data.shortcuts.length}
					<div class="flex flex-wrap gap-1.5" data-testid="group-shortcuts">
						{#each data.shortcuts as shortcut (shortcut.kind + shortcut.name + shortcut.ids.join())}
							<button
								type="button"
								class="inline-flex items-center gap-1 rounded-full border border-border bg-bg px-3 py-1 text-[0.8125rem] text-fg-muted hover:bg-primary-soft aria-pressed:border-primary aria-pressed:bg-primary-soft aria-pressed:text-primary"
								aria-pressed={shortcutPressed(shortcut, ticked)}
								onclick={() => press(shortcut)}
							>
								<Icon name={SHORTCUT_ICON[shortcut.kind]} size={13} />{shortcutLabel(shortcut)}
							</button>
						{/each}
					</div>
				{/if}
				{#if !full}
					<PersonSearchSelect
						people={offered}
						name="pick"
						bind:selectedIds={picked}
						placeholder={t('gifts.several.search')}
						onPick={(person) => {
							add([person.id]);
							picked = [];
						}}
					/>
				{/if}
			</div>

			<WhenPicker
				birth={null}
				{today}
				kinds={GIFT_WHEN_KINDS}
				several
				onchoose={(next) => (when = next)}
			/>
		</section>

		{#if previews.length}
			<section class="rounded-app bg-card px-4 py-1 shadow-card">
				<ul class="divide-y divide-border" aria-label={t('gifts.several.preview')}>
					{#each previews as preview (preview.contactId)}
						{@const row = rowOf.get(preview.contactId)}
						{@const person = byId.get(preview.contactId)}
						{#if row && person}
							<GroupPreviewRow
								{preview}
								{row}
								{person}
								unknownBirth={birthOf(person.id) === null}
								onchange={change}
							/>
						{/if}
					{/each}
				</ul>
			</section>
		{/if}

		<FormError message={form?.giftError ?? null} />

		<div class="flex flex-col gap-3 rounded-app bg-card px-4 py-3 text-sm shadow-card">
			<p data-testid="group-summary">
				<span class="font-medium text-fg"
					>{summary.missing.length
						? t('gifts.several.forOf', { chosen: summary.chosen, total })
						: t('gifts.several.for', { chosen: summary.chosen })}</span
				>{#if missingText}<span class="text-fg-muted"> – {missingText}</span>{/if}
			</p>
			<div class="flex flex-wrap items-center gap-4">
				<fieldset class="flex flex-wrap items-center gap-4">
					<legend class="sr-only">{t('common.visibility')}</legend>
					<label class="flex items-center gap-1.5">
						<input type="radio" name="visibility" value="shared" bind:group={visibility} />{t(
							'common.shared'
						)}
					</label>
					{#if keptFrom.length}
						<label class="flex items-center gap-1.5">
							<input type="radio" name="visibility" value={SURPRISE} bind:group={visibility} />{t(
								'gifts.surprise.choice',
								{ name: names(keptFrom) }
							)}
						</label>
					{/if}
					<label class="flex items-center gap-1.5">
						<input type="radio" name="visibility" value="private" bind:group={visibility} />{t(
							'common.private'
						)}
					</label>
				</fieldset>
				<span class="ml-auto flex gap-2">
					<Button variant="ghost" size="sm" href={back}>{t('common.cancel')}</Button>
					<Button variant="primary" size="sm" disabled={!title.trim() || summary.chosen === 0}
						>{t('common.save')}</Button
					>
				</span>
			</div>
		</div>
	</form>
</main>
