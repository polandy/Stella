<script lang="ts">
	import { reveal } from '$lib/motion/motion.svelte';
	import FormError from '$lib/components/ui/FormError.svelte';
	import Avatar from '$lib/components/ui/Avatar.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import EmptyState from '$lib/components/ui/EmptyState.svelte';
	import Icon from '$lib/components/ui/Icon.svelte';
	import { ALL_KINDS, activeKind, filterCircles, kindChips } from '$lib/circles/browse';
	import { circleKindLabel } from '$lib/circles/labels';
	import { useTranslate } from '$lib/i18n/context.svelte';
	import { accentDotStyle } from '$lib/design/tokens';
	import { thumbnailUrl } from '$lib/media/urls';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();

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
	const chips = $derived(
		kindChips(data.circles, query, {
			all: t('circles.kind.all'),
			kind: (kind) => circleKindLabel(t, kind)
		})
	);
	const kind = $derived(activeKind(chips, chosenKind));
	const shown = $derived(filterCircles(data.circles, { query, kind }));
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

			<!-- Each swatch is named for a screen reader, and shows a focus ring of its own: the
			     radio under it is visually hidden, so it cannot show one (WCAG 1.1.1, 2.4.7). -->
			<fieldset class="flex flex-col gap-2">
				<legend class="mb-2 text-sm text-fg-muted">{t('circles.colour')}</legend>
				<div class="flex flex-wrap gap-2">
					{#each data.colors as color (color)}
						<label class="cursor-pointer" title={t(`components.colour.${color}`)}>
							<input
								type="radio"
								name="color"
								value={color}
								checked={color === data.suggestedColor}
								class="peer sr-only"
							/>
							<span
								class="block size-7 rounded-full ring-offset-2 ring-offset-[var(--card)] transition-all peer-checked:ring-2 peer-checked:ring-[var(--fg)] peer-focus-visible:outline-2 peer-focus-visible:outline-offset-4 peer-focus-visible:outline-focus-ring hover:scale-110"
								style={accentDotStyle(color)}
								aria-hidden="true"
							></span>
							<span class="sr-only">{t(`components.colour.${color}`)}</span>
						</label>
					{/each}
				</div>
			</fieldset>

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
			{query.trim() !== '' || kind !== ALL_KINDS
				? t('circles.matchCount', { count: shown.length })
				: ''}
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
			{#each shown as circle (circle.id)}
				{@const cover = data.covers[circle.id]}
				<li>
					<a
						href="/circles/{circle.id}"
						class="flex h-full flex-col overflow-hidden rounded-app bg-card shadow-card transition-colors hover:bg-card-hover"
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
										· {t('circles.memberCount', { count: circle.memberCount })}
										{#if circle.visibility === 'private'}
											· {t('circles.private')}{/if}
									</span>
								</span>
							</div>
							{#if circle.description}
								<p class="line-clamp-2 text-sm text-fg-muted">{circle.description}</p>
							{/if}
							<div class="mt-auto flex items-center">
								{#each circle.preview as member, i (member.contactId)}
									<span class="rounded-full ring-2 ring-card" class:-ml-1={i > 0}>
										<Avatar
											id={member.contactId}
											name={member.displayName}
											avatarPhotoId={member.avatarPhotoId}
											size={28}
										/>
									</span>
								{/each}
								{#if circle.memberCount > circle.preview.length}
									<span
										class="-ml-1 grid size-7 place-items-center rounded-full bg-bg-sunken text-[11px] font-semibold text-fg-muted ring-2 ring-card"
									>
										+{circle.memberCount - circle.preview.length}
									</span>
								{/if}
								{#if circle.memberCount === 0}
									<span class="text-xs text-fg-subtle">{t('circles.nobodyYet')}</span>
								{/if}
							</div>
						</div>
					</a>
				</li>
			{/each}
		</ul>
	{/if}
</main>
