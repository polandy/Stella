<script lang="ts">
	import FormError from '$lib/components/FormError.svelte';
	import Button from '$lib/components/Button.svelte';
	import PersonSearchSelect from '$lib/components/PersonSearchSelect.svelte';
	import { enhance } from '$app/forms';
	import { useI18n } from '$lib/i18n/context.svelte';
	import { useRemovals } from '$lib/undo/context.svelte';
	import { savedEnhance } from '$lib/undo/saved';
	import type { PersonForm, PersonPageData } from './types';

	// The record-keeping actions at the foot of the profile card (docs/02 §2.2, §2.1.3).
	let {
		data,
		form,
		otherContacts,
		isSelf,
		archived
	}: {
		data: PersonPageData;
		form: PersonForm;
		/** Everyone visible but this person: whom a duplicate can be. */
		otherContacts: PersonPageData['people'];
		isSelf: boolean;
		archived: boolean;
	} = $props();

	const i18n = useI18n();
	const t = i18n.t;
	const c = $derived(data.contact);
	const removals = useRemovals();

	const savedArchive = savedEnhance(removals, t('components.saved'));
	/** The second click that a deletion asks for; there is no undo after it. */
	let confirmingDelete = $state(false);
	/** Whether the merge picker is open; the survivor is always this page's person. */
	let merging = $state(false);
	let mergeTargetId = $state<string[]>([]);
</script>

<!--
	Rarely wanted, so it sits at the foot of the profile rather than beside Write:
	archiving takes someone out of the lists, it does not undo them (docs/02 §2.2).
-->
<!-- Which of these people you are (docs/02 §2.1.3); the same button lets go again. -->
<form method="POST" action="?/setSelf">
	<Button variant="ghost" size="sm" icon="self">
		{isSelf ? t('contact.self.notMe') : t('contact.self.thisIsMe')}
	</Button>
	<p class="mt-1 text-xs text-fg-subtle">
		{isSelf ? t('contact.self.isMeHint') : t('contact.self.hint')}
	</p>
</form>

<form method="POST" action={archived ? '?/restore' : '?/archive'} use:enhance={savedArchive}>
	{#if archived}
		<Button variant="ghost" size="sm" icon="archive">{t('contact.archive.bringBack')}</Button>
	{:else}
		<Button variant="ghost" size="sm" icon="archive">{t('contact.archive.archive')}</Button>
	{/if}
	<p class="mt-1 text-xs text-fg-subtle">
		{archived ? t('contact.archive.archivedHint') : t('contact.archive.hint')}
	</p>
</form>

<!--
	Merging ends a record too, so it lives with the other admin-only tool and asks
	which duplicate to fold in (docs/02 §2.2). The survivor is the page you are on.
-->
{#if data.isAdmin}
	<div>
		<Button
			type="button"
			variant="ghost"
			size="sm"
			icon="people"
			aria-expanded={merging}
			onclick={() => (merging = !merging)}
		>
			{merging ? t('common.cancel') : t('contact.merge.open')}
		</Button>
		{#if merging}
			<form method="POST" action="?/merge" class="mt-2 flex flex-col gap-2 rounded-app bg-bg-sunken p-3">
				<p class="text-xs text-fg">
					{t('contact.merge.explain', { name: c.displayName })}
				</p>
				<!-- The label names the field only: wrapped around the picker, it would also
				     take in the chips' remove buttons and the list (docs/05 §5.7). -->
				<div class="flex flex-col gap-1">
					<label for="merge-target" class="text-xs text-fg-muted">{t('contact.merge.who')}</label>
					<PersonSearchSelect
						id="merge-target"
						people={otherContacts}
						name="mergedId"
						bind:selectedIds={mergeTargetId}
						placeholder={t('contact.merge.choose')}
						required
					/>
				</div>
				<FormError message={form?.mergeError} variant="inline" size="xs" />
				<div>
					<Button variant="primary" size="sm">
						{t('contact.merge.submit', { name: c.displayName })}
					</Button>
				</div>
			</form>
		{/if}
	</div>
{/if}

<!--
	The irreversible one, so it asks twice and only an admin sees it (docs/02 §2.2).
	No undo window: there would be nothing left to put back.
-->
{#if data.isAdmin}
	<div>
		<Button
			type="button"
			variant="ghost"
			size="sm"
			icon="remove"
			aria-expanded={confirmingDelete}
			onclick={() => (confirmingDelete = !confirmingDelete)}
		>
			{confirmingDelete ? t('contact.delete.keep') : t('contact.delete.open')}
		</Button>
		{#if confirmingDelete}
			<form method="POST" action="?/delete" class="mt-2 flex flex-col gap-2 rounded-app bg-bg-sunken p-3">
				<p class="text-xs text-fg">
					{t('contact.delete.explain', { name: c.displayName })}
				</p>
				<div>
					<Button variant="danger" size="sm">
						{t('contact.delete.submit', { name: c.displayName })}
					</Button>
				</div>
			</form>
		{/if}
	</div>
{/if}
