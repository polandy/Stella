<script lang="ts">
	import FormError from '$lib/components/ui/FormError.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import { useTranslate } from '$lib/i18n/context.svelte';
	import { hasMessage } from '$lib/i18n/translate';
	import ContactReview from '$lib/components/import/ContactReview.svelte';
	import ImportPhotos from '$lib/components/import/ImportPhotos.svelte';
	import SkippedContacts from '$lib/components/import/SkippedContacts.svelte';
	import type { ActionData, PageData } from './$types';

	/*
	 * The import wizard (docs/02 §2.16), which takes either Monica export or a vCard. The steps
	 * are plain form posts, a vCard's with a review of who each contact is; the photos are
	 * stored from the browser (`ImportPhotos`).
	 */
	let { data, form }: { data: PageData; form: ActionData } = $props();

	const t = useTranslate();

	const step = $derived(form?.step ?? 'upload');
	/** A vCard's wizard has a review step, and its import ends in the photos. */
	const isVCard = $derived(
		form?.step === 'review' ||
			form?.step === 'reviewed' ||
			(form?.step === 'preview' && form.isVCard)
	);
	const steps = $derived(
		isVCard
			? (['upload', 'preview', 'review', 'photos'] as const)
			: (['upload', 'preview', 'photos'] as const)
	);
	const current = $derived(step === 'reviewed' ? 'photos' : step);

	/** "1 address", "4 addresses", "2 notes" — the plan names the kind, the catalogue counts it. */
	const thing = (what: string, count: number): string => {
		// Every `import.thing.*` message counts; the cast picks one of them as the shape.
		const key = `import.thing.${what}`;
		return hasMessage(key) ? t(key as 'import.thing.note', { count }) : what;
	};

	/** The heading over a count in the preview, by the plan's own field name. */
	const countLabel = (what: string): string => {
		const key = `import.count.${what}`;
		return hasMessage(key) ? t(key) : what.replace(/([A-Z])/g, ' $1').toLowerCase();
	};

	const fieldClass = 'rounded-md border border-border-input bg-bg px-3 py-2 text-sm text-fg';
</script>

<svelte:head><title>{t('common.pageTitle', { page: t('import.title') })}</title></svelte:head>

<main class="mx-auto flex w-full max-w-2xl flex-col gap-8 px-6 py-10">
	<header>
		<h1 class="text-2xl font-semibold text-fg">{t('import.title')}</h1>
		<p class="text-fg-muted">{t('import.intro')}</p>
	</header>

	<ol
		class="flex gap-2 text-xs tracking-wide text-fg-subtle uppercase"
		aria-label={t('import.steps')}
	>
		{#each steps as name, i (name)}
			<li class="flex items-center gap-2" aria-current={current === name ? 'step' : undefined}>
				<span
					class="grid size-5 place-items-center rounded-full border border-border text-[11px]"
					class:bg-primary={current === name}
					class:text-primary-fg={current === name}>{i + 1}</span
				>
				{t(`import.step.${name}`)}
			</li>
		{/each}
	</ol>

	{#if step === 'upload'}
		<form
			method="POST"
			action="?/preview"
			enctype="multipart/form-data"
			class="flex flex-col gap-4 rounded-app bg-card p-5 shadow-card"
		>
			<FormError message={form?.step === 'upload' ? form.error : null} />
			<label class="flex flex-col gap-1 text-sm text-fg-muted">
				<span>{t('import.fileLabel')}</span>
				<input
					type="file"
					name="dump"
					accept=".sql,.json,.vcf,.gz,.sql.gz,.json.gz,.vcf.gz,application/sql,application/json,text/vcard,application/gzip"
					required
					class={fieldClass}
				/>
			</label>
			<p class="text-xs text-fg-subtle">
				{t('import.fileHint.monica')}
				<code
					>docker exec monica-db sh -c 'mariadb-dump -u"$MYSQL_USER" "$MYSQL_DATABASE"' | gzip &gt;
					monica.sql.gz</code
				>
			</p>
			<fieldset class="flex flex-wrap items-center gap-4 text-sm">
				<legend class="mb-1 text-fg-muted">{t('import.visibilityLegend')}</legend>
				<label class="flex items-center gap-1.5">
					<input type="radio" name="visibility" value="shared" checked />
					{t('import.visibility.shared')}
				</label>
				<label class="flex items-center gap-1.5">
					<input type="radio" name="visibility" value="private" />
					{t('import.visibility.private')}
				</label>
			</fieldset>
			<Button variant="primary" class="self-end">{t('import.preview')}</Button>
		</form>
		{#if data.skipped.length > 0}
			<SkippedContacts skipped={data.skipped} />
		{/if}
	{:else if form?.step === 'preview'}
		<section class="flex flex-col gap-4">
			<h2 class="text-sm font-medium text-fg-muted">{t('import.whatWillBeImported')}</h2>
			<dl class="grid grid-cols-2 gap-2 sm:grid-cols-4" data-testid="import-preview">
				{#each Object.entries(form.report.counts) as [what, n] (what)}
					<div class="rounded-app bg-card px-3 py-2 shadow-card">
						<dt class="text-xs tracking-wide text-fg-subtle uppercase">{countLabel(what)}</dt>
						<dd class="text-xl font-semibold text-fg">{n}</dd>
					</div>
				{/each}
			</dl>
			{#if form.customTypes.length > 0}
				<p class="text-sm text-fg-muted">
					{t('import.newTypes')}
					{#each form.customTypes as t, i (t.forwardLabel)}{i > 0 ? ', ' : ''}<span class="text-fg"
							>{t.forwardLabel}{t.reverseLabel !== t.forwardLabel
								? ` / ${t.reverseLabel}`
								: ''}</span
						>{/each}.
				</p>
			{/if}
			{#if form.report.skipped.length > 0}
				<div class="rounded-app bg-card p-4 shadow-card">
					<h3 class="mb-2 text-sm font-medium text-fg-muted">{t('import.leftOut')}</h3>
					<ul class="flex flex-col gap-1 text-sm text-fg">
						{#each form.report.skipped as s (s.what + s.why)}
							<li>
								<span class="font-medium">{s.count} {thing(s.what, s.count)}</span>
								<span class="text-fg-muted">
									— {t(`import.why.${s.why}` as 'import.why.empty')}{s.detail
										? ` (${s.detail})`
										: ''}
								</span>
							</li>
						{/each}
					</ul>
				</div>
			{/if}
			{#each form.report.warnings as w, i (i)}
				<p class="rounded-md bg-warning/10 px-3 py-2 text-sm text-fg">
					{w.code === 'customType'
						? t('import.warning.customType', { name: w.name })
						: w.code === 'manyUsers'
							? t('import.warning.manyUsers', { count: w.count })
							: w.code === 'vcardPeopleOnly'
								? t('import.warning.vcardPeopleOnly')
								: t('import.warning.jsonNoHowWeMet')}
				</p>
			{/each}
			<form
				method="POST"
				action={form.isVCard ? '?/review' : '?/confirm'}
				class="flex items-center justify-end gap-3"
			>
				<input type="hidden" name="token" value={form.token} />
				<input type="hidden" name="visibility" value={form.visibility} />
				<Button variant="ghost" href="/settings/import">{t('import.startOver')}</Button>
				<Button variant="primary"
					>{form.isVCard ? t('import.reviewContacts') : t('import.importNow')}</Button
				>
			</form>
		</section>
	{:else if form?.step === 'review'}
		<!-- A review handed back after a refusal starts afresh, as it now stands. -->
		{#key form}
			<ContactReview
				review={form.review}
				token={form.token}
				visibility={form.visibility}
				error={'error' in form ? form.error : null}
			/>
		{/key}
	{:else if form?.step === 'reviewed'}
		<ImportPhotos token={form.token} photos={form.photos} embedded>
			<p class="rounded-md bg-success/10 px-3 py-2 text-sm text-fg" data-testid="import-done">
				{t('import.review.done', form)}
			</p>
			{#if form.linkPhotos > 0}
				<p class="text-sm text-fg-muted">
					{t('import.review.linkPhotos', { count: form.linkPhotos })}
				</p>
			{/if}
		</ImportPhotos>
	{:else if form?.step === 'photos'}
		<ImportPhotos token={form.token} photos={form.photos} embedded={form.photosAreEmbedded}>
			<p class="rounded-md bg-success/10 px-3 py-2 text-sm text-fg" data-testid="import-done">
				{t('import.done', {
					contacts: form.inserted.contacts,
					relationships: form.inserted.relationships,
					notes: form.inserted.notes,
					gifts: form.inserted.gifts,
					interactions: form.inserted.interactions,
					tags: form.inserted.tags
				})}
				{#if form.inserted.contacts === 0 && form.report.counts.contacts > 0}{t(
						'import.nothingTwice'
					)}{/if}
			</p>
		</ImportPhotos>
	{/if}
</main>
