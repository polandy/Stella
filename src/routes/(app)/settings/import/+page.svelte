<script lang="ts">
	import Button from '$lib/components/Button.svelte';
	import { useTranslate } from '$lib/i18n/context.svelte';
	import { hasMessage } from '$lib/i18n/translate';
	import { processImage } from '$lib/image/process-image';
	import type { ActionData } from './$types';

	/*
	 * The import wizard (docs/02 §2.16), which takes either Monica export or a vCard. Steps 1–3
	 * are plain form posts; step 4 runs in the browser: the pictures come either from the file
	 * itself or from Monica's `photos` folder, and each is downscaled here (no native image
	 * library on the server) and sent one at a time.
	 */
	let { form }: { form: ActionData } = $props();

	const t = useTranslate();

	const step = $derived(form?.step ?? 'upload');

	interface PhotoProgress {
		total: number;
		done: number;
		stored: number;
		already: number;
		missing: number;
		failed: number;
	}
	let progress = $state<PhotoProgress | null>(null);
	let uploading = $state(false);

	/**
	 * Store one picture: downscale it here (the server has no image library) and post both
	 * renditions with the staging token. The server decides whose photo it is.
	 */
	async function storePhoto(id: string, file: Blob, token: string): Promise<'stored' | 'already'> {
		const { image, thumb, width, height } = await processImage(file);
		const body = new FormData();
		body.append('token', token);
		body.append('photoId', id);
		body.append('image', image, 'image.jpg');
		body.append('thumb', thumb, 'thumb.jpg');
		body.append('width', String(width));
		body.append('height', String(height));
		const res = await fetch('/settings/import/photos', { method: 'POST', body });
		if (!res.ok) throw new Error(`The server refused this photo (${res.status}).`);
		return ((await res.json()) as { status: 'stored' | 'already' }).status;
	}

	/**
	 * Walk the planned photos, asking `pictureFor` where each one's bytes come from — a file
	 * the admin picked out of Monica's folder, or the export itself. Returning null means the
	 * picture is not there, which is counted rather than failed.
	 */
	async function storeAll(pictureFor: (photo: { id: string; file: string }) => Promise<Blob | null>) {
		if (form?.step !== 'photos') return;
		uploading = true;
		const p: PhotoProgress = { total: form.photos.length, done: 0, stored: 0, already: 0, missing: 0, failed: 0 };
		progress = p;
		for (const expected of form.photos) {
			try {
				const picture = await pictureFor(expected);
				if (picture === null) p.missing++;
				else if ((await storePhoto(expected.id, picture, form.token)) === 'stored') p.stored++;
				else p.already++;
			} catch {
				p.failed++;
			}
			p.done++;
			progress = { ...p };
		}
		uploading = false;
	}

	/** A SQL dump only names its files; the admin points at the folder and they are matched by name. */
	async function onPhotosPicked(event: Event) {
		const files = (event.currentTarget as HTMLInputElement).files;
		if (!files) return;
		const byName = new Map<string, File>();
		for (const f of files) byName.set(f.name, f);
		await storeAll(async (photo) => byName.get(photo.file) ?? null);
	}

	/** A JSON export and a vCard carry their pictures; the server hands each one back out. */
	async function fetchEmbeddedPhotos() {
		if (form?.step !== 'photos') return;
		const token = form.token;
		await storeAll(async (photo) => {
			const res = await fetch(
				`/settings/import/photos?token=${encodeURIComponent(token)}&photoId=${encodeURIComponent(photo.id)}`
			);
			if (res.status === 404 || res.status === 409) return null;
			if (!res.ok) throw new Error(`The picture could not be read (${res.status}).`);
			return await res.blob();
		});
	}

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

	const fieldClass = 'rounded-md border border-border bg-bg px-3 py-2 text-sm text-fg';
</script>

<main class="mx-auto flex w-full max-w-2xl flex-col gap-8 px-6 py-10">
	<header>
		<h1 class="text-2xl font-semibold text-fg">{t('import.title')}</h1>
		<p class="text-fg-muted">{t('import.intro')}</p>
	</header>

	<ol class="flex gap-2 text-xs uppercase tracking-wide text-fg-subtle" aria-label={t('import.steps')}>
		{#each ['upload', 'preview', 'photos'] as name, i (name)}
			<li class="flex items-center gap-2" aria-current={step === name ? 'step' : undefined}>
				<span class="grid size-5 place-items-center rounded-full border border-border text-[11px]" class:bg-primary={step === name} class:text-primary-fg={step === name}>{i + 1}</span>
				{name === 'photos'
					? t('import.step.photos')
					: name === 'upload'
						? t('import.step.upload')
						: t('import.step.preview')}
			</li>
		{/each}
	</ol>

	{#if step === 'upload'}
		<form method="POST" action="?/preview" enctype="multipart/form-data" class="flex flex-col gap-4 rounded-app bg-card p-5 shadow-card">
			{#if form?.step === 'upload' && form.error}
				<p class="rounded-md bg-danger/10 px-3 py-2 text-sm text-danger">{form.error}</p>
			{/if}
			<label class="flex flex-col gap-1 text-sm text-fg-muted">
				<span>{t('import.fileLabel')}</span>
				<input type="file" name="dump" accept=".sql,.json,.vcf,.gz,.sql.gz,.json.gz,.vcf.gz,application/sql,application/json,text/vcard,application/gzip" required class={fieldClass} />
			</label>
			<p class="text-xs text-fg-subtle">
				{t('import.fileHint.monica')}
				<code>docker exec monica-db sh -c 'mariadb-dump -u"$MYSQL_USER" "$MYSQL_DATABASE"' | gzip &gt; monica.sql.gz</code>
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
	{:else if form?.step === 'preview'}
		<section class="flex flex-col gap-4">
			<h2 class="text-sm font-medium text-fg-muted">{t('import.whatWillBeImported')}</h2>
			<dl class="grid grid-cols-2 gap-2 sm:grid-cols-4" data-testid="import-preview">
				{#each Object.entries(form.report.counts) as [what, n] (what)}
					<div class="rounded-app bg-card px-3 py-2 shadow-card">
						<dt class="text-xs uppercase tracking-wide text-fg-subtle">{countLabel(what)}</dt>
						<dd class="text-xl font-semibold text-fg">{n}</dd>
					</div>
				{/each}
			</dl>
			{#if form.customTypes.length > 0}
				<p class="text-sm text-fg-muted">
					{t('import.newTypes')}
					{#each form.customTypes as t, i (t.forwardLabel)}{i > 0 ? ', ' : ''}<span class="text-fg">{t.forwardLabel}{t.reverseLabel !== t.forwardLabel ? ` / ${t.reverseLabel}` : ''}</span>{/each}.
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
									— {t(`import.why.${s.why}` as 'import.why.empty')}{s.detail ? ` (${s.detail})` : ''}
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
			<form method="POST" action="?/confirm" class="flex items-center justify-end gap-3">
				<input type="hidden" name="token" value={form.token} />
				<input type="hidden" name="visibility" value={form.visibility} />
				<Button variant="ghost" href="/settings/import">{t('import.startOver')}</Button>
				<Button variant="primary">{t('import.importNow')}</Button>
			</form>
		</section>
	{:else if form?.step === 'photos'}
		<section class="flex flex-col gap-4">
			<p class="rounded-md bg-success/10 px-3 py-2 text-sm text-fg" data-testid="import-done">
				{t('import.done', {
					contacts: form.inserted.contacts,
					relationships: form.inserted.relationships,
					notes: form.inserted.notes,
					interactions: form.inserted.interactions,
					tags: form.inserted.tags
				})}
				{#if form.inserted.contacts === 0 && form.report.counts.contacts > 0}{t(
						'import.nothingTwice'
					)}{/if}
			</p>

			{#if form.photos.length > 0}
				<h2 class="text-sm font-medium text-fg-muted">
					{t('import.photos', { count: form.photos.length })}
				</h2>
				{#if form.photosAreEmbedded}
					<p class="text-sm text-fg-muted">{t('import.photos.embedded')}</p>
					<!-- The count is in the heading right above; the button says what it does. -->
					<Button variant="primary" onclick={fetchEmbeddedPhotos} disabled={uploading}>
						{uploading ? t('import.photos.storing') : t('import.photos.store')}
					</Button>
				{:else}
					<p class="text-sm text-fg-muted">{t('import.photos.folder')}</p>
					<input type="file" webkitdirectory multiple accept="image/*" onchange={onPhotosPicked} disabled={uploading} class={fieldClass} aria-label={t('import.photos.folderLabel')} />
				{/if}
				{#if progress}
					<div class="flex flex-col gap-1" data-testid="photo-progress">
						<progress max={progress.total} value={progress.done} class="w-full"></progress>
						<p class="text-sm text-fg-muted">{t('import.progress', progress)}</p>
					</div>
				{/if}
			{/if}

			<form method="POST" action="?/finish" class="flex justify-end">
				<input type="hidden" name="token" value={form.token} />
				<Button variant="primary" disabled={uploading}>{t('import.finish')}</Button>
			</form>
		</section>
	{/if}
</main>
