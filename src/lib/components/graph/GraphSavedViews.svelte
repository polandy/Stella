<script lang="ts">
	import { tick } from 'svelte';
	import Icon from '$lib/components/Icon.svelte';
	import { useTranslate } from '$lib/i18n/context.svelte';
	import { savedViewNamed, type SavedView } from '$lib/graph/model/saved-views';
	import { MENU_ITEM } from './menu-item';

	/*
	 * The Filter menu's saved views (docs/05 §5.8): one tap shows a view, the cross beside it
	 * deletes it, and "Save this view…" names what the menu shows now. It lives inside the open
	 * menu, so a half-typed name is forgotten when the menu closes.
	 */
	interface Props {
		views: readonly SavedView[];
		/** The view the map shows right now, ticked in the list. */
		current: string | null;
		onApply: (view: SavedView) => void;
		onSave: (name: string) => void;
		onDelete: (name: string) => void;
	}
	let { views, current, onApply, onSave, onDelete }: Props = $props();

	const t = useTranslate();
	const uid = $props.id();

	let naming = $state(false);
	let draft = $state('');
	let field = $state<HTMLInputElement>();
	let saveItem = $state<HTMLButtonElement>();
	const replaces = $derived(savedViewNamed(views, draft));

	async function startNaming() {
		naming = true;
		draft = current ?? '';
		await tick();
		field?.select();
	}

	async function stopNaming() {
		naming = false;
		await tick();
		saveItem?.focus();
	}

	function submit(event: SubmitEvent) {
		event.preventDefault();
		if (!draft.trim()) return;
		onSave(draft);
		void stopNaming();
	}

	/*
	 * The menu moves focus on the arrow keys and closes on Escape and Tab. In the name field
	 * those belong to the text: Escape gives up the name instead of the menu, and the rest stay
	 * in the field.
	 */
	function onFieldKeydown(event: KeyboardEvent) {
		event.stopPropagation();
		if (event.key === 'Escape') {
			event.preventDefault();
			void stopNaming();
		}
	}

	async function remove(name: string) {
		onDelete(name);
		// The row under focus is gone; the save item is the one that is always there.
		await tick();
		saveItem?.focus();
	}
</script>

<div role="group" aria-labelledby="{uid}-views">
	<div id="{uid}-views" class="px-2 pt-1 pb-0.5 text-[11px] text-fg-subtle">{t('graph.views')}</div>
	{#each views as view (view.name)}
		<div class="flex items-center gap-1">
			<button
				type="button"
				role="menuitemradio"
				aria-checked={current === view.name}
				onclick={() => onApply(view)}
				class={MENU_ITEM}
			>
				<span class="w-3 shrink-0 font-bold text-primary" aria-hidden="true">
					{#if current === view.name}✓{/if}
				</span>
				<span class="flex-1 truncate">{view.name}</span>
			</button>
			<!-- A full fingertip wide, so deleting is never a near miss for applying. -->
			<button
				type="button"
				role="menuitem"
				aria-label={t('graph.views.delete', { name: view.name })}
				onclick={() => void remove(view.name)}
				class="grid size-9 shrink-0 place-items-center rounded-lg text-fg-subtle hover:bg-bg-sunken hover:text-fg focus:bg-bg-sunken pointer-coarse:size-11"
			>
				<Icon name="remove" size={14} />
			</button>
		</div>
	{/each}
	{#if naming}
		<form class="grid gap-1 px-2 py-1" onsubmit={submit}>
			<label for="{uid}-name" class="text-[11px] text-fg-subtle">{t('graph.views.name')}</label>
			<div class="flex items-center gap-1.5">
				<input
					bind:this={field}
					bind:value={draft}
					id="{uid}-name"
					type="text"
					maxlength="60"
					autocomplete="off"
					enterkeyhint="done"
					placeholder={t('graph.views.namePlaceholder')}
					onkeydown={onFieldKeydown}
					class="w-0 min-w-0 flex-1 rounded-lg border border-border bg-bg px-2 py-1.5 text-[13px] text-fg placeholder:text-fg-subtle"
				/>
				<button
					type="submit"
					role="menuitem"
					disabled={!draft.trim()}
					class="shrink-0 rounded-lg bg-primary px-3 py-1.5 text-[13px] font-medium text-primary-fg disabled:opacity-50"
				>
					{t('graph.views.confirm')}
				</button>
			</div>
			{#if replaces}
				<p class="text-[11px] text-fg-subtle" aria-live="polite">
					{t('graph.views.replaces', { name: replaces.name })}
				</p>
			{/if}
		</form>
	{:else}
		<button
			bind:this={saveItem}
			type="button"
			role="menuitem"
			onclick={() => void startNaming()}
			class={MENU_ITEM}
		>
			<Icon name="saveView" size={14} class="text-fg-muted" />
			<span class="flex-1">{t('graph.views.save')}</span>
		</button>
	{/if}
</div>
