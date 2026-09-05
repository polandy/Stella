<script lang="ts">
	import Button from '$lib/components/Button.svelte';
	import { processImage } from '$lib/image/process-image';
	import type { ActionData } from './$types';

	/*
	 * Monica import wizard (docs/02 §2.16). Steps 1–3 are plain form posts; step 4 runs in the
	 * browser: the admin points the file picker at Monica's `photos` folder, each expected file
	 * is downscaled here (no native image library on the server) and sent one at a time.
	 */
	let { form }: { form: ActionData } = $props();

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

	async function onPhotosPicked(event: Event) {
		if (form?.step !== 'photos') return;
		const files = (event.currentTarget as HTMLInputElement).files;
		if (!files) return;
		const byName = new Map<string, File>();
		for (const f of files) byName.set(f.name, f);

		uploading = true;
		const p: PhotoProgress = { total: form.photos.length, done: 0, stored: 0, already: 0, missing: 0, failed: 0 };
		progress = p;
		for (const expected of form.photos) {
			const file = byName.get(expected.file);
			if (!file) p.missing++;
			else {
				try {
					const { image, thumb, width, height } = await processImage(file);
					const body = new FormData();
					body.append('token', form.token);
					body.append('photoId', expected.id);
					body.append('image', image, 'image.jpg');
					body.append('thumb', thumb, 'thumb.jpg');
					body.append('width', String(width));
					body.append('height', String(height));
					const res = await fetch('/settings/import/photos', { method: 'POST', body });
					if (!res.ok) p.failed++;
					else {
						const { status } = (await res.json()) as { status: 'stored' | 'already' };
						if (status === 'stored') p.stored++;
						else p.already++;
					}
				} catch {
					p.failed++;
				}
			}
			p.done++;
			progress = { ...p };
		}
		uploading = false;
	}

	/** "1 address", "4 addresses", "2 notes". */
	const plural = (what: string, n: number) => (n === 1 ? what : what.endsWith('s') ? `${what}es` : `${what}s`);

	const fieldClass = 'rounded-md border border-border bg-bg px-3 py-2 text-sm text-fg';
</script>

<main class="mx-auto flex w-full max-w-2xl flex-col gap-8 px-6 py-10">
	<header>
		<h1 class="text-2xl font-semibold text-fg">Import from Monica</h1>
		<p class="text-fg-muted">A database dump of your Monica becomes people, relationships, notes, interactions, tags and photos here. Nothing is written until you confirm.</p>
	</header>

	<ol class="flex gap-2 text-xs uppercase tracking-wide text-fg-subtle" aria-label="Steps">
		{#each ['upload', 'preview', 'photos'] as name, i (name)}
			<li class="flex items-center gap-2" aria-current={step === name ? 'step' : undefined}>
				<span class="grid size-5 place-items-center rounded-full border border-border text-[11px]" class:bg-primary={step === name} class:text-primary-fg={step === name}>{i + 1}</span>
				{name === 'photos' ? 'Import & photos' : name}
			</li>
		{/each}
	</ol>

	{#if step === 'upload'}
		<form method="POST" action="?/preview" enctype="multipart/form-data" class="flex flex-col gap-4 rounded-app bg-card p-5 shadow-card">
			{#if form?.step === 'upload' && form.error}
				<p class="rounded-md bg-danger/10 px-3 py-2 text-sm text-danger">{form.error}</p>
			{/if}
			<label class="flex flex-col gap-1 text-sm text-fg-muted">
				<span>Monica database dump (<code>.sql</code> or <code>.sql.gz</code>)</span>
				<input type="file" name="dump" accept=".sql,.gz,.sql.gz,application/sql,application/gzip" required class={fieldClass} />
			</label>
			<p class="text-xs text-fg-subtle">
				On a self-hosted Monica: <code>docker exec monica-db sh -c 'mariadb-dump -u"$MYSQL_USER" "$MYSQL_DATABASE"' | gzip &gt; monica.sql.gz</code>
			</p>
			<fieldset class="flex flex-wrap items-center gap-4 text-sm">
				<legend class="mb-1 text-fg-muted">Everything imported is</legend>
				<label class="flex items-center gap-1.5"><input type="radio" name="visibility" value="shared" checked /> Shared with the household</label>
				<label class="flex items-center gap-1.5"><input type="radio" name="visibility" value="private" /> Private to me</label>
			</fieldset>
			<Button variant="primary" class="self-end">Preview</Button>
		</form>
	{:else if form?.step === 'preview'}
		<section class="flex flex-col gap-4">
			<h2 class="text-sm font-medium text-fg-muted">What will be imported</h2>
			<dl class="grid grid-cols-2 gap-2 sm:grid-cols-4" data-testid="import-preview">
				{#each Object.entries(form.report.counts) as [what, n] (what)}
					<div class="rounded-app bg-card px-3 py-2 shadow-card">
						<dt class="text-xs uppercase tracking-wide text-fg-subtle">{what.replace(/([A-Z])/g, ' $1').toLowerCase()}</dt>
						<dd class="text-xl font-semibold text-fg">{n}</dd>
					</div>
				{/each}
			</dl>
			{#if form.customTypes.length > 0}
				<p class="text-sm text-fg-muted">
					New relationship types, because Stella has no built-in equivalent:
					{#each form.customTypes as t, i (t.forwardLabel)}{i > 0 ? ', ' : ''}<span class="text-fg">{t.forwardLabel}{t.reverseLabel !== t.forwardLabel ? ` / ${t.reverseLabel}` : ''}</span>{/each}.
				</p>
			{/if}
			{#if form.report.skipped.length > 0}
				<div class="rounded-app bg-card p-4 shadow-card">
					<h3 class="mb-2 text-sm font-medium text-fg-muted">Left out, and why</h3>
					<ul class="flex flex-col gap-1 text-sm text-fg">
						{#each form.report.skipped as s (s.what + s.why)}
							<li><span class="font-medium">{s.count} {plural(s.what, s.count)}</span> <span class="text-fg-muted">— {s.why}</span></li>
						{/each}
					</ul>
				</div>
			{/if}
			{#each form.report.warnings as w (w)}
				<p class="rounded-md bg-warning/10 px-3 py-2 text-sm text-fg">{w}</p>
			{/each}
			<form method="POST" action="?/confirm" class="flex items-center justify-end gap-3">
				<input type="hidden" name="token" value={form.token} />
				<input type="hidden" name="visibility" value={form.visibility} />
				<Button variant="ghost" href="/settings/import">Start over</Button>
				<Button variant="primary">Import now</Button>
			</form>
		</section>
	{:else if form?.step === 'photos'}
		<section class="flex flex-col gap-4">
			<p class="rounded-md bg-success/10 px-3 py-2 text-sm text-fg" data-testid="import-done">
				Imported {form.inserted.contacts} people, {form.inserted.relationships} relationships, {form.inserted.notes} notes, {form.inserted.interactions} interactions and {form.inserted.tags} tags.
				{#if form.inserted.contacts === 0 && form.report.counts.contacts > 0}Everything was already there, so nothing was written twice.{/if}
			</p>

			{#if form.photos.length > 0}
				<h2 class="text-sm font-medium text-fg-muted">Photos ({form.photos.length})</h2>
				<p class="text-sm text-fg-muted">
					Point the picker at Monica's photo folder (<code>storage/app/public/photos</code>). Each file is resized in your browser and uploaded; you can close this page once it says done.
				</p>
				<input type="file" webkitdirectory multiple accept="image/*" onchange={onPhotosPicked} disabled={uploading} class={fieldClass} aria-label="Monica photo folder" />
				{#if progress}
					<div class="flex flex-col gap-1" data-testid="photo-progress">
						<progress max={progress.total} value={progress.done} class="w-full"></progress>
						<p class="text-sm text-fg-muted">
							{progress.done} of {progress.total} · {progress.stored} stored{progress.already ? `, ${progress.already} already there` : ''}{progress.missing ? `, ${progress.missing} not in the folder` : ''}{progress.failed ? `, ${progress.failed} failed` : ''}
						</p>
					</div>
				{/if}
			{/if}

			<form method="POST" action="?/finish" class="flex justify-end">
				<input type="hidden" name="token" value={form.token} />
				<Button variant="primary" disabled={uploading}>Finish</Button>
			</form>
		</section>
	{/if}
</main>
