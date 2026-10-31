<script lang="ts">
	import Avatar from '$lib/components/ui/Avatar.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import Icon from '$lib/components/ui/Icon.svelte';
	import { useI18n } from '$lib/i18n/context.svelte';
	import { contactSectionPath } from '$lib/people/sections';
	import { recallable, type KeptOf } from '$lib/pwa/outbox';
	import type { HouseholdTodoView } from '$lib/todos/household';
	import type { JustDoneTodos } from '$lib/todos/just-done.svelte';
	import { recallKeptTick } from '$lib/todos/kept-ticks.svelte';
	import { useRemovals } from '$lib/undo/context.svelte';
	import TodoDue from './TodoDue.svelte';
	import TodoTick from './TodoTick.svelte';

	/*
	 * One of the household's open to-dos, on Home's *To do* band or on `/todos` (docs/02 §2.26.6):
	 * the line, whom it is about and when, and the tick box on the right (`TodoTick`). The band
	 * leads with the person's face, as *Coming up* does; the list names them beside the line,
	 * under it on a phone. Rewriting and removing stay on the person's card, where the name leads.
	 */
	type Todo = HouseholdTodoView;
	interface Props {
		todo: Todo;
		variant: 'band' | 'list';
		/** The household's day, which *overdue* is read against. */
		today: string;
		/** Just ticked: struck through while its toast stands (`cardTodos`). */
		done: boolean;
		justDone: JustDoneTodos<Todo>;
		/** Ticked on this device while Stella was out of reach, and not sent yet. */
		keptTick: KeptOf<'todo.tick'> | null;
	}
	let { todo, variant, today, done, justDone, keptTick }: Props = $props();

	const t = useI18n().t;
	const removals = useRemovals();

	let ticking = $state(false);
	const ticked = $derived(ticking || done || keptTick !== null);
	const checkboxId = $derived(`todo-tick-${todo.id}`);
	const personHref = $derived(contactSectionPath(todo.contactId, 'todos'));
</script>

{#snippet line(textClass: string)}
	<!-- The whole line ticks: a 20 px box alone is too small a target on a phone. -->
	<label
		for={checkboxId}
		class="block break-words {textClass} {ticked
			? 'text-fg-muted line-through'
			: 'cursor-pointer text-fg'}"
	>
		{todo.title}
	</label>
{/snippet}

{#snippet notSent()}
	<span class="inline-flex items-center gap-1">
		<Icon name="offline" size={11} />{t('home.outbox.notSent')}
	</span>
{/snippet}

{#snippet recall()}
	{#if keptTick && recallable(keptTick)}
		<Button
			variant="ghost"
			size="sm"
			type="button"
			label={t('todos.recallTick', { title: todo.title })}
			onclick={() =>
				recallKeptTick(keptTick.command.id, () => removals.notify(t('todos.tickOnItsWay')))}
			data-testid="todo-recall">{t('common.undo')}</Button
		>
	{/if}
{/snippet}

{#if variant === 'band'}
	<li
		class="grid grid-cols-[28px_minmax(0,1fr)_auto] items-start gap-2.5 rounded-app px-1.5 py-1.5"
		data-testid="todo-band-row"
	>
		<Avatar
			id={todo.contactId}
			name={todo.contactName}
			avatarPhotoId={todo.avatarPhotoId}
			size={28}
		/>
		<div class="min-w-0 text-[13px] leading-snug">
			{@render line('')}
			<span class="flex flex-wrap items-center gap-x-1.5 text-xs text-fg-subtle">
				<a href={personHref} class="font-semibold text-fg-muted hover:underline"
					>{todo.contactName}</a
				>
				<span aria-hidden="true">·</span>
				{#if keptTick}{@render notSent()}{:else}<TodoDue dueOn={todo.dueOn} {today} />{/if}
			</span>
			{@render recall()}
		</div>
		<TodoTick
			{todo}
			contactId={todo.contactId}
			{done}
			{justDone}
			{keptTick}
			id={checkboxId}
			bind:ticking
		/>
	</li>
{:else}
	<li
		class="flex items-start gap-3 border-t border-border-subtle py-2.5 first:border-t-0"
		data-testid="todo-list-row"
	>
		<div class="flex min-w-0 flex-1 flex-col gap-x-3 gap-y-1 sm:flex-row sm:items-start">
			<div class="min-w-0 flex-1">
				{@render line('')}
				<p class="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-xs text-fg-subtle">
					{#if keptTick}
						{@render notSent()}
					{:else}
						<TodoDue dueOn={todo.dueOn} {today} />
					{/if}
					{#if todo.notedBy}
						{#if todo.dueOn || keptTick}<span aria-hidden="true">·</span>{/if}
						<span>{t('todos.notedBy', { name: todo.notedBy })}</span>
					{/if}
					{#if todo.visibility === 'private'}
						{#if todo.dueOn || keptTick || todo.notedBy}<span aria-hidden="true">·</span>{/if}
						<span class="inline-flex items-center gap-1" title={t('common.onlyYouSee')}>
							<Icon name="private" size={11} />{t('common.privateInline')}
						</span>
					{/if}
				</p>
				{@render recall()}
			</div>
			<a
				href={personHref}
				class="inline-flex shrink-0 items-center gap-1.5 text-sm text-fg-muted hover:text-fg hover:underline sm:max-w-[12rem]"
			>
				<Avatar
					id={todo.contactId}
					name={todo.contactName}
					avatarPhotoId={todo.avatarPhotoId}
					size={20}
				/>
				<span class="truncate">{todo.contactName}</span>
			</a>
		</div>
		<TodoTick
			{todo}
			contactId={todo.contactId}
			{done}
			{justDone}
			{keptTick}
			id={checkboxId}
			bind:ticking
		/>
	</li>
{/if}
