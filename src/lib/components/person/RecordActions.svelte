<script lang="ts">
	import FormError from '$lib/components/FormError.svelte';
	import Button from '$lib/components/Button.svelte';
	import PersonSearchSelect from '$lib/components/PersonSearchSelect.svelte';
	import { enhance } from '$app/forms';
	import { page } from '$app/state';
	import { useI18n } from '$lib/i18n/context.svelte';
	import { useRemovals } from '$lib/undo/context.svelte';
	import { savedEnhance } from '$lib/undo/saved';
	import { tick } from 'svelte';
	import type { PersonForm, PersonPageData } from './types';

	/*
	 * The confirm step of the identity card's record-keeping actions (docs/02 §2.2). The ⋯ menu
	 * only names them; what each one does to the record is said here, once it was asked for,
	 * beside the button that does it — never as standing prose on the page.
	 */
	let {
		data,
		form,
		otherContacts,
		archived,
		panel = $bindable()
	}: {
		data: PersonPageData;
		form: PersonForm;
		/** Everyone visible but this person: whom a duplicate can be. */
		otherContacts: PersonPageData['people'];
		archived: boolean;
		/** Which confirm step is open, if any; the menu opens one, Cancel closes it. */
		panel: 'archive' | 'merge' | 'delete' | null;
	} = $props();

	const i18n = useI18n();
	const t = i18n.t;
	const c = $derived(data.contact);
	const removals = useRemovals();

	const savedArchive = savedEnhance(removals, t('components.saved'), () => (panel = null));
	/*
	 * `?merge=<id>` arrives from *There is already a Lea Brunner — the same person?* after a
	 * last name was given (docs/concepts/surnames.md §5): the card opens this step with that
	 * person in it, and the merge still waits for the admin's own click.
	 */
	const proposedMerge = page.url.searchParams.get('merge');
	let mergeTargetId = $state<string[]>(proposedMerge ? [proposedMerge] : []);

	let box = $state<HTMLDivElement>();
	/*
	 * An opened step takes the cursor, so a keyboard reader lands where the menu sent them: in
	 * the picker, on the step's own button — or, for the one that cannot be undone, on *Keep
	 * them*, so a second Enter never deletes anybody.
	 */
	$effect(() => {
		if (panel === null || !box) return;
		const step = panel;
		void tick().then(() => {
			box?.scrollIntoView({ block: 'nearest' });
			const buttons = [...(box?.querySelectorAll<HTMLElement>('button') ?? [])];
			const target =
				box?.querySelector<HTMLElement>('input:not([type="hidden"])') ?? (step === 'delete' ? buttons.at(-1) : buttons[0]);
			target?.focus();
		});
	});

	function onKeydown(event: KeyboardEvent) {
		if (event.key !== 'Escape' || event.defaultPrevented) return;
		event.preventDefault();
		panel = null;
	}
</script>

{#if panel !== null}
	<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
	<div
		bind:this={box}
		id={panel === 'merge' ? 'merge' : undefined}
		role="group"
		onkeydown={onKeydown}
		class="flex scroll-mt-20 flex-col gap-2 rounded-app bg-bg-sunken p-3"
		data-testid="record-confirm"
	>
		{#if panel === 'archive'}
			<!-- Archiving takes someone out of the lists, it does not undo them (docs/02 §2.2). -->
			<form method="POST" action={archived ? '?/restore' : '?/archive'} use:enhance={savedArchive} class="flex flex-col gap-2">
				<p class="text-sm text-fg">
					{archived ? t('contact.archive.archivedHint') : t('contact.archive.hint')}
				</p>
				<div class="flex flex-wrap gap-2">
					<Button variant="primary" size="sm" icon="archive">
						{archived ? t('contact.archive.bringBack') : t('contact.archive.archive')}
					</Button>
					<Button variant="ghost" size="sm" type="button" onclick={() => (panel = null)}>{t('common.cancel')}</Button>
				</div>
			</form>
		{:else if panel === 'merge'}
			<!-- Merging ends a record, so it asks which duplicate to fold in; the survivor is this page. -->
			<form method="POST" action="?/merge" class="flex flex-col gap-2">
				<p class="text-sm text-fg">{t('contact.merge.explain', { name: c.displayName })}</p>
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
				<div class="flex flex-wrap gap-2">
					<Button variant="primary" size="sm">{t('contact.merge.submit', { name: c.displayName })}</Button>
					<Button variant="ghost" size="sm" type="button" onclick={() => (panel = null)}>{t('common.cancel')}</Button>
				</div>
			</form>
		{:else}
			<!-- The irreversible one: no undo window, there would be nothing left to put back. -->
			<form method="POST" action="?/delete" class="flex flex-col gap-2">
				<p class="text-sm text-fg">{t('contact.delete.explain', { name: c.displayName })}</p>
				<div class="flex flex-wrap gap-2">
					<Button variant="danger" size="sm">{t('contact.delete.submit', { name: c.displayName })}</Button>
					<Button variant="ghost" size="sm" type="button" onclick={() => (panel = null)}>{t('contact.delete.keep')}</Button>
				</div>
			</form>
		{/if}
	</div>
{/if}
