<script lang="ts">
	import { reveal } from '$lib/motion/motion.svelte';
	import FormError from '$lib/components/ui/FormError.svelte';
	import Avatar from '$lib/components/ui/Avatar.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import ColourSwatches from '$lib/components/circle/ColourSwatches.svelte';
	import EmptyState from '$lib/components/ui/EmptyState.svelte';
	import Icon from '$lib/components/ui/Icon.svelte';
	import { ALL_KINDS, activeKind, kindChips } from '$lib/circles/browse';
	import { circleFamilies } from '$lib/circles/families';
	import { circleKindLabel } from '$lib/circles/labels';
	import { circleShortPeriodLabel } from '$lib/circles/period';
	import { circleTree, isPastCircle } from '$lib/circles/tree';
	import { useI18n, useTranslate } from '$lib/i18n/context.svelte';
	import { accentDotStyle } from '$lib/design/tokens';
	import { thumbnailUrl } from '$lib/media/urls';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	const lang = useI18n();
	const t = useTranslate();

	let wantForm = $state(false);
	// What the new circle is called to begin with: a search that found nothing hands its query over.
	let newName = $state('');
	// A failed submit keeps the form open, so the error has somewhere to be read.
	const showForm = $derived(wantForm || form?.error !== undefined);

	// Find as you type over what is already loaded (docs/02 §2.4.2): a household has few enough
	// circles that a round trip per keystroke would only add latency.
	let query = $state('');
	let chosenKind = $state<string>(ALL_KINDS);
	// The chips count every circle the reader sees, sub-circles included.
	const chips = $derived(
		kindChips(data.tree, query, {
			all: t('circles.kind.all'),
			kind: (kind) => circleKindLabel(t, kind)
		})
	);
	const kind = $derived(activeKind(chips, chosenKind));
	// What the live region announces: the circles found, sub-circles counted like cards.
	const found = $derived(chips.find((chip) => chip.kind === kind)?.count ?? 0);

	// A card per top-level circle, its sub-circles as rows (docs/02 §2.4.2).
	const tree = $derived(circleTree(data.tree));
	const shown = $derived(circleFamilies(tree, { query, kind, today: data.today }));
	// The faces on a card come from the overview's read, by circle.
	const cards = $derived(new Map(data.circles.map((c) => [c.id, c])));
	// Families whose past sub-circles are unfolded.
	let pastOpen = $state<Record<string, boolean>>({});
</script>

<svelte:head><title>{t('circles.title')}</title></svelte:head>

<main class="mx-auto flex w-full max-w-4xl flex-col gap-5 px-4 py-6 md:px-6 md:py-10">
	<header class="flex flex-wrap items-end justify-between gap-3">
		<div>
			<h1 class="text-2xl font-semibold text-fg">{t('circles.heading')}</h1>
			<p class="text-sm text-fg-muted">{t('circles.intro')}</p>
		</div>
		<Button
			variant={showForm ? 'secondary' : 'primary'}
			icon={showForm ? 'remove' : 'add'}
			type="button"
			onclick={() => (wantForm = !showForm)}
		>
			{showForm ? t('common.cancel') : t('circles.new')}
		</Button>
	</header>

	{#if showForm}
		<form
			transition:reveal
			method="POST"
			action="?/create"
			class="flex flex-col gap-4 rounded-app bg-card p-5 shadow-card"
		>
			<FormError message={form?.error} id="circle-error" />

			<label class="flex flex-col gap-1 text-sm">
				<span class="text-fg-muted">{t('circles.name')}</span>
				<input
					name="name"
					value={newName}
					placeholder={t('circles.namePlaceholder')}
					required
					aria-invalid={form?.error ? 'true' : undefined}
					aria-describedby={form?.error ? 'circle-error' : undefined}
					class="rounded-md border border-border-input bg-bg px-3 py-2 text-fg"
				/>
			</label>

			<div class="flex flex-wrap gap-4">
				<label class="flex flex-1 flex-col gap-1 text-sm">
					<span class="text-fg-muted">{t('circles.kindLabel')}</span>
					<select name="kind" class="rounded-md border border-border-input bg-bg px-3 py-2 text-fg">
						{#each data.kinds as kind (kind)}<option value={kind}>{circleKindLabel(t, kind)}</option
							>{/each}
					</select>
				</label>
				<label class="flex flex-[2] flex-col gap-1 text-sm">
					<span class="text-fg-muted">{t('circles.descriptionLabel')}</span>
					<input
						name="description"
						class="rounded-md border border-border-input bg-bg px-3 py-2 text-fg"
					/>
				</label>
			</div>

			<ColourSwatches colors={data.colors} selected={data.suggestedColor} />

			<Button variant="primary" class="self-start">{t('circles.create')}</Button>
		</form>
	{/if}

	{#if data.circles.length > 0}
		<label
			class="flex items-center gap-2 rounded-control border border-border-input bg-card px-3 py-2 shadow-card focus-within:border-primary"
		>
			<Icon name="search" size={15} />
			<span class="sr-only">{t('circles.find')}</span>
			<input
				type="search"
				bind:value={query}
				placeholder={t('circles.findPlaceholder')}
				autocomplete="off"
				class="min-w-0 flex-1 bg-transparent text-sm text-fg outline-none placeholder:text-fg-subtle"
			/>
		</label>
		<!-- Always in the page, so a screen reader is listening before the first keystroke. -->
		<p class="sr-only" aria-live="polite" data-testid="circle-match-count">
			{query.trim() !== '' || kind !== ALL_KINDS ? t('circles.matchCount', { count: found }) : ''}
		</p>

		{#if chips.length > 1}
			<div class="flex flex-wrap items-center gap-2" data-testid="circle-kinds">
				{#each chips as chip (chip.kind)}
					<button
						type="button"
						onclick={() => (chosenKind = chip.kind)}
						aria-pressed={kind === chip.kind}
						class="rounded-full px-3 py-1 text-sm font-medium text-fg-muted transition-colors hover:text-fg aria-pressed:bg-primary-soft aria-pressed:font-semibold aria-pressed:text-fg"
					>
						{chip.label}
						<span class="text-xs text-fg-muted">{chip.count}</span>
					</button>
				{/each}
			</div>
		{/if}
	{/if}

	{#if data.circles.length === 0}
		<EmptyState icon="circles" title={t('circles.empty.title')} hint={t('circles.empty.hint')}>
			<Button variant="primary" icon="add" type="button" onclick={() => (wantForm = true)}>
				{t('circles.new')}
			</Button>
		</EmptyState>
	{:else if shown.length === 0}
		<EmptyState icon="search" title={t('circles.noMatch.title')} hint={t('circles.noMatch.hint')}>
			<!-- Only a typed name makes a circle; a kind chip alone has nothing to call it. -->
			{#if query.trim()}
				<Button
					variant="primary"
					icon="add"
					type="button"
					onclick={() => {
						newName = query.trim();
						wantForm = true;
					}}
				>
					{t('circles.noMatch.create', { name: query.trim() })}
				</Button>
			{/if}
		</EmptyState>
	{:else}
		<ul class="grid gap-3 sm:grid-cols-2" data-testid="circle-cards">
			{#each shown as family (family.circle.id)}
				{@const circle = family.circle}
				{@const cover = data.covers[circle.id]}
				{@const preview = cards.get(circle.id)?.preview ?? []}
				{@const rows = pastOpen[circle.id] ? [...family.rows, ...family.pastRows] : family.rows}
				<li
					class="flex h-full flex-col overflow-hidden rounded-app bg-card shadow-card"
					data-testid="circle-card"
				>
					<a
						href="/circles/{circle.id}"
						class="flex flex-1 flex-col transition-colors hover:bg-card-hover"
					>
						{#if cover}
							<!-- The cover as a flat strip, filled from the centre (docs/05 §5.5); decoration, the name says it. -->
							<img
								src={thumbnailUrl(cover)}
								alt=""
								loading="lazy"
								class="h-20 w-full object-cover object-center"
								data-testid="circle-card-cover"
							/>
						{/if}
						<div class="flex flex-1 flex-col gap-3 p-4">
							<div class="flex items-start gap-3">
								<span
									class="mt-1.5 size-3 shrink-0 rounded-full"
									style={accentDotStyle(circle.color)}
								></span>
								<span class="min-w-0 flex-1">
									<span class="block truncate font-semibold text-fg">{circle.name}</span>
									<span class="block text-xs text-fg-subtle">
										<span>{circleKindLabel(t, circle.kind)}</span>
										<!-- A circle made of sub-circles alone does not say "0 members". -->
										{#if circle.memberCount > 0 || family.childCount === 0}
											· {t('circles.memberCount', { count: circle.memberCount })}{/if}
										{#if family.childCount > 0}
											· {t('circles.sub.count', { count: family.childCount })}{/if}
										{#if circle.visibility === 'private'}
											· {t('circles.private')}{/if}
									</span>
								</span>
							</div>
							{#if circle.description}
								<p class="line-clamp-2 text-sm text-fg-muted">{circle.description}</p>
							{/if}
							<div class="mt-auto flex items-center">
								{#each preview as member, i (member.contactId)}
									<span class="rounded-full ring-2 ring-card" class:-ml-1={i > 0}>
										<Avatar
											id={member.contactId}
											name={member.displayName}
											avatarPhotoId={member.avatarPhotoId}
											size={28}
										/>
									</span>
								{/each}
								{#if circle.memberCount > preview.length}
									<span
										class="-ml-1 grid size-7 place-items-center rounded-full bg-bg-sunken text-[11px] font-semibold text-fg-muted ring-2 ring-card"
									>
										+{circle.memberCount - preview.length}
									</span>
								{/if}
								{#if circle.memberCount === 0 && family.childCount === 0}
									<span class="text-xs text-fg-subtle">{t('circles.nobodyYet')}</span>
								{/if}
							</div>
						</div>
					</a>
					{#if rows.length > 0 || family.pastRows.length > 0 || family.hiddenCount > 0}
						<!-- Outside the card's link, so a row opens its own circle and the toggle opens nothing. -->
						<div
							class="@container mx-3 mb-3 flex flex-col border-t border-border-subtle pt-1"
							data-testid="circle-subrows"
						>
							<!-- A narrow card (a phone, or two cards side by side) puts the meta on a small
							     second line, so the name keeps the row's full width. -->
							{#each rows as row (row.circle.id)}
								{@const sub = row.circle}
								{@const period = circleShortPeriodLabel(lang, sub.startDate, sub.endDate)}
								<a
									href="/circles/{sub.id}"
									class="grid grid-cols-[14px_10px_minmax(0,1fr)] items-center gap-x-2 rounded-control px-1 py-1.5 text-sm transition-colors hover:bg-bg-sunken @sm:grid-cols-[14px_10px_minmax(0,1fr)_auto] {isPastCircle(
										sub,
										data.today
									)
										? 'text-fg-subtle'
										: 'text-fg'}"
									data-testid="circle-subrow"
								>
									<Icon name="subCircle" size={14} class="text-fg-subtle" />
									<span class="size-2.5 rounded-full" style={accentDotStyle(sub.color)}></span>
									<span class="truncate">{sub.name}</span>
									<span class="col-start-3 truncate text-xs text-fg-subtle @sm:col-start-auto">
										{[
											period,
											t('circles.memberCount', { count: sub.memberCount }),
											row.descendantCount > 0
												? t('circles.sub.inside', { count: row.descendantCount })
												: null
										]
											.filter(Boolean)
											.join(' · ')}
									</span>
								</a>
							{/each}
							{#if family.pastRows.length > 0}
								<button
									type="button"
									class="self-start rounded-control px-1 py-1 text-sm text-link hover:underline"
									aria-expanded={pastOpen[circle.id] === true}
									onclick={() => (pastOpen[circle.id] = !pastOpen[circle.id])}
								>
									{pastOpen[circle.id]
										? t('circles.sub.hidePast')
										: t('circles.sub.showPast', { count: family.pastRows.length })}
								</button>
							{/if}
							{#if family.hiddenCount > 0}
								<span class="px-1 py-1 text-xs text-fg-subtle">
									{t('circles.sub.more', { count: family.hiddenCount })}
								</span>
							{/if}
						</div>
					{/if}
				</li>
			{/each}
		</ul>
	{/if}
</main>
