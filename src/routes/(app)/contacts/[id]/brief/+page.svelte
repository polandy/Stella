<script lang="ts">
	import { onMount } from 'svelte';
	import Avatar from '$lib/components/ui/Avatar.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import EmptyState from '$lib/components/ui/EmptyState.svelte';
	import Icon from '$lib/components/ui/Icon.svelte';
	import PrivateMark from '$lib/components/ui/PrivateMark.svelte';
	import Veil from '$lib/components/ui/Veil.svelte';
	import TodoDue from '$lib/components/todos/TodoDue.svelte';
	import { dayLabel, occasionLabel, whenLabel } from '$lib/dates/labels';
	import { occasionLabel as giftOccasionLabel } from '$lib/gifts/labels';
	import { useI18n } from '$lib/i18n/context.svelte';
	import { roleTermLabel } from '$lib/relationships/roles';
	import { KIND_PRESENTATION } from '$lib/story/interaction-kinds';
	import type { PageData } from './$types';

	/*
	 * A person's brief (docs/02 §2.2.5): what to know before a visit, read in a minute on the
	 * phone or taken along on paper. Nothing here is edited — every row leads to where it is.
	 */
	let { data }: { data: PageData } = $props();

	const i18n = useI18n();
	const t = i18n.t;
	const c = $derived(data.contact);

	/** *48 years · born 3 March 1978*, or *born around 1978*. */
	const ageLine = $derived.by(() => {
		const birthday = data.birthday;
		if (birthday?.kind === 'around') return t('brief.bornAround', { year: birthday.year });
		if (birthday?.kind !== 'day') return null;
		const born = t('brief.born', { day: dayLabel(i18n, birthday.date) });
		return birthday.age === null || c.isDeceased
			? born
			: `${t('contact.facts.age', { age: birthday.age })} · ${born}`;
	});

	const shortDay = (day: string) =>
		new Date(day).toLocaleDateString(i18n.intlLocale, { day: 'numeric', month: 'short' });

	/*
	 * Paper is white whatever the screen's theme: a dark page printed is a page of ink. The theme
	 * is lent to the print and handed back after, Ctrl+P as much as the button.
	 */
	onMount(() => {
		const root = document.documentElement;
		let theme: string | undefined;
		const before = () => {
			theme = root.dataset.theme;
			root.dataset.theme = 'light';
		};
		const after = () => {
			if (theme === undefined) delete root.dataset.theme;
			else root.dataset.theme = theme;
		};
		window.addEventListener('beforeprint', before);
		window.addEventListener('afterprint', after);
		return () => {
			window.removeEventListener('beforeprint', before);
			window.removeEventListener('afterprint', after);
		};
	});

	const CARD =
		'flex flex-col gap-1 rounded-app bg-card px-4 py-3 shadow-card print:break-inside-avoid print:shadow-none';
	const HEADING = 'text-xs font-semibold tracking-wide text-fg-subtle uppercase';
	const ROW =
		'-mx-1.5 flex items-baseline gap-2 rounded-app px-1.5 py-1 text-sm hover:bg-bg-sunken';
</script>

<svelte:head
	><title>{t('common.pageTitle', { page: t('brief.title', { name: c.displayName }) })}</title
	></svelte:head
>

<main
	class="mx-auto flex w-full max-w-xl flex-col gap-3 px-4 py-6 md:py-10 print:max-w-none print:p-0"
	data-testid="person-brief"
>
	<header
		class="flex items-center gap-3 rounded-app bg-card px-4 py-3 shadow-card print:shadow-none"
	>
		<Avatar id={c.id} name={c.displayName} avatarPhotoId={c.avatarPhotoId} size={56} />
		<div class="min-w-0 flex-1">
			<h1 class="truncate font-serif text-xl font-semibold text-fg">{c.displayName}</h1>
			{#if ageLine}<p class="text-sm text-fg-muted" data-testid="brief-age">{ageLine}</p>{/if}
		</div>
		<!-- On a wrapper: the button's scoped display outweighs a utility on the button itself. -->
		<span class="print:hidden">
			<Button size="sm" onclick={() => window.print()}>
				<Icon name="print" size={16} />{t('brief.print')}
			</Button>
		</span>
		<p class="hidden text-xs text-fg-subtle print:block">
			{t('brief.printedOn', { day: dayLabel(i18n, data.today) })}
		</p>
	</header>

	{#if data.blocks.length === 0}
		<EmptyState icon="brief" title={t('brief.empty')} />
	{:else}
		<div class="flex flex-col gap-3 print:grid print:grid-cols-2 print:gap-3">
			{#each data.blocks as block (block.kind)}
				{#if block.kind === 'next'}
					{@const date = block.date}
					<a
						href={date.href}
						class="flex items-center gap-3 rounded-app bg-card px-4 py-3 shadow-card hover:bg-bg-sunken print:col-span-2 print:shadow-none"
						data-testid="brief-next"
					>
						<span class="text-primary"
							><Icon name={date.kind === 'birthday' ? 'gift' : 'calendar'} size={20} /></span
						>
						<span class="min-w-0">
							<span class="block text-sm font-medium text-fg">
								{t('brief.next.line', {
									name: date.contactName,
									occasion: occasionLabel(i18n, date)
								})}
							</span>
							<span class="block text-xs text-fg-muted"
								>{whenLabel(i18n, date.daysUntil, date.date)}</span
							>
						</span>
					</a>
				{:else if block.kind === 'family'}
					<section class={CARD} aria-labelledby="brief-family" data-testid="brief-family">
						<h2 id="brief-family" class={HEADING}>{t('brief.family.title')}</h2>
						<ul>
							{#each block.members as member (member.id)}
								<li>
									<a href={member.href} class={ROW}>
										<span class="font-medium text-fg">{member.name}</span>
										<span class="text-fg-muted"
											>· {roleTermLabel(t, member.role, member.variant)}</span
										>
										<span class="ml-auto text-xs text-fg-subtle">
											{#if member.deceased}{t(
													'brief.family.deceased'
												)}{:else if member.age !== null}{t('contact.facts.age', {
													age: member.age
												})}{/if}
										</span>
									</a>
								</li>
							{/each}
							{#each block.homes as home (home.id)}
								<li>
									<a href={home.href} class="{ROW} items-start">
										<span class="text-fg-subtle"><Icon name="home" size={14} /></span>
										<span class="min-w-0">
											<span class="block text-fg">{home.line}</span>
											{#if home.livesWith.length}
												<span class="block text-xs text-fg-muted">
													{t('brief.family.livesWith', {
														names: home.livesWith.map((p) => p.displayName).join(', ')
													})}
												</span>
											{/if}
										</span>
									</a>
								</li>
							{/each}
						</ul>
					</section>
				{:else if block.kind === 'notes'}
					<section class={CARD} aria-labelledby="brief-notes" data-testid="brief-notes">
						<h2 id="brief-notes" class={HEADING}>{t('brief.notes.title')}</h2>
						<ul>
							{#each block.notes as note (note.id)}
								<li>
									<a href={note.href} class={ROW}>
										<span class="text-fg-subtle"><Icon name="pinned" size={14} /></span>
										<span class="min-w-0 flex-1">
											<Veil
												id="note:{note.id}"
												isPrivate={note.isPrivate}
												label={t('privacy.veil.note')}
												text={note.line}
												passive
											>
												{#if note.title}<span class="font-medium text-fg">{note.title}</span>
												{/if}<span class="text-fg">{note.line}</span>
											</Veil>
										</span>
										{#if note.isPrivate}<PrivateMark
												veilId="note:{note.id}"
												class="text-[11px]"
											/>{/if}
									</a>
								</li>
							{/each}
						</ul>
					</section>
				{:else if block.kind === 'lately'}
					<section class={CARD} aria-labelledby="brief-lately" data-testid="brief-lately">
						<h2 id="brief-lately" class={HEADING}>{t('brief.lately.title')}</h2>
						<ul>
							{#each block.items as item (item.veilId)}
								{@const kindLabel =
									item.interactionKind === null
										? null
										: t(KIND_PRESENTATION[item.interactionKind].label)}
								{@const line = item.line ?? kindLabel ?? ''}
								<li>
									<a href={item.href} class={ROW}>
										<span class="w-14 shrink-0 text-xs text-fg-subtle">{shortDay(item.day)}</span>
										<span class="text-fg-subtle">
											<Icon
												name={item.interactionKind === null
													? 'journal'
													: KIND_PRESENTATION[item.interactionKind].icon}
												size={14}
												label={kindLabel ?? undefined}
											/>
										</span>
										<span class="min-w-0 flex-1">
											<Veil
												id={item.veilId}
												isPrivate={item.isPrivate}
												label={t(
													item.kind === 'moment'
														? 'privacy.veil.moment'
														: 'privacy.veil.interaction'
												)}
												text={line}
												textClass="block truncate text-fg"
												passive
											>
												<span class="block truncate text-fg">{line}</span>
											</Veil>
										</span>
										{#if item.isPrivate}<PrivateMark
												veilId={item.veilId}
												class="text-[11px]"
											/>{/if}
									</a>
								</li>
							{/each}
						</ul>
					</section>
				{:else if block.kind === 'todos'}
					<section class={CARD} aria-labelledby="brief-todos" data-testid="brief-todos">
						<h2 id="brief-todos" class={HEADING}>{t('todos.title')}</h2>
						<ul>
							{#each block.todos as todo (todo.id)}
								<li>
									<a href={todo.href} class={ROW}>
										<span class="min-w-0 flex-1 text-fg">{todo.title}</span>
										<span class="text-xs"><TodoDue dueOn={todo.dueOn} today={data.today} /></span>
										{#if todo.isPrivate}<PrivateMark class="text-[11px]" />{/if}
									</a>
								</li>
							{/each}
						</ul>
					</section>
				{:else if block.kind === 'gifts'}
					<section class={CARD} aria-labelledby="brief-gifts" data-testid="brief-gifts">
						<h2 id="brief-gifts" class={HEADING}>{t('brief.gifts.title')}</h2>
						<ul>
							{#each block.ideas as idea (idea.id)}
								<li>
									<a href={idea.href} class={ROW}>
										<span class="text-fg-subtle"><Icon name="idea" size={14} /></span>
										<span class="min-w-0 flex-1 text-fg">
											{idea.title}{#if idea.occasion}<span class="text-fg-muted">
													· {giftOccasionLabel(t, idea.occasion)}</span
												>{/if}
										</span>
										{#if idea.isPrivate}<PrivateMark class="text-[11px]" />{/if}
									</a>
								</li>
							{/each}
						</ul>
					</section>
				{:else if block.kind === 'met'}
					<section class={CARD} aria-labelledby="brief-met" data-testid="brief-met">
						<h2 id="brief-met" class={HEADING}>{t('brief.met.title')}</h2>
						<a href={block.href} class="{ROW} font-serif text-[15px] leading-relaxed text-fg"
							>{block.line}</a
						>
					</section>
				{/if}
			{/each}
		</div>
	{/if}

	<a
		href="/contacts/{c.id}"
		class="self-center py-2 text-sm font-medium text-link hover:underline print:hidden"
		data-testid="brief-whole-page">{t('brief.wholePage')}</a
	>
</main>
