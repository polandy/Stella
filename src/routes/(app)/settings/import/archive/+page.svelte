<script lang="ts">
	import Button from '$lib/components/Button.svelte';
	import { countLabel, summariseRestore } from '$lib/archive/labels';
	import type { ActionData } from './$types';

	/*
	 * Restoring from an archive (docs/02 §2.15). One form and one report: what arrived, what
	 * was already here, and anything the archive could not give back.
	 */
	let { form }: { form: ActionData } = $props();

	const report = $derived(form && 'report' in form ? form.report : null);
	const lines = $derived(report ? summariseRestore(report.added, report.skipped) : []);
	const exportedOn = $derived(
		report?.exportedAt ? new Date(report.exportedAt).toLocaleDateString() : null
	);
</script>

<main class="mx-auto flex w-full max-w-2xl flex-col gap-8 px-6 py-10">
	<header class="flex flex-col gap-2">
		<h1 class="text-2xl font-semibold text-fg">Restore from an archive</h1>
		<p class="text-fg-muted">
			Read a Stella archive back in: the people, everything written about them, and the photos
			beside it. Records this household already has are left exactly as they are, so restoring the
			same archive twice changes nothing.
		</p>
	</header>

	<form
		method="POST"
		action="?/restore"
		enctype="multipart/form-data"
		class="flex flex-col gap-4 rounded-app bg-card p-5 shadow-card"
	>
		{#if form && 'error' in form && form.error}
			<p class="rounded-md bg-danger/10 px-3 py-2 text-sm text-danger" data-testid="restore-error">
				{form.error}
			</p>
		{/if}
		<label class="flex flex-col gap-1 text-sm text-fg-muted">
			<span>Archive file (<code>.tar</code>)</span>
			<input
				type="file"
				name="archive"
				accept=".tar,application/x-tar"
				required
				class="rounded-md border border-border bg-bg px-3 py-2 text-sm text-fg"
			/>
		</label>
		<p class="text-xs text-fg-subtle">
			The file <em>Settings → Download the archive</em> gives you, or a folder you unpacked and packed
			again with <code>tar</code>.
		</p>
		<Button variant="primary" class="self-end">Restore</Button>
	</form>

	{#if report}
		<section class="flex flex-col gap-4" data-testid="restore-report">
			<h2 class="text-sm font-medium text-fg-muted">
				Restored from {report.household}{exportedOn ? `, exported ${exportedOn}` : ''}
			</h2>

			<dl class="flex flex-col gap-px overflow-hidden rounded-app bg-card shadow-card">
				{#each lines as line (line.table)}
					<div class="flex items-baseline justify-between gap-4 px-4 py-2" data-kind={line.table}>
						<dt class="text-sm text-fg">{line.label}</dt>
						<dd class="text-sm text-fg-muted">
							<span class="font-medium text-fg">{line.added} added</span>
							{#if line.skipped > 0}<span> · {line.skipped} already here</span>{/if}
						</dd>
					</div>
				{/each}
				{#if lines.length === 0}
					<p class="px-4 py-3 text-sm text-fg-muted">
						This archive held nothing that is not already here.
					</p>
				{/if}
			</dl>

			<p class="text-sm text-fg-muted">
				Photos: {countLabel('photo', report.media.stored)} stored{report.media.alreadyThere > 0
					? `, ${report.media.alreadyThere} already on disk`
					: ''}{report.media.missing > 0 ? `, ${report.media.missing} missing from the archive` : ''}.
			</p>

			{#each report.warnings as warning (warning)}
				<p class="rounded-md bg-warning/10 px-3 py-2 text-sm text-fg">{warning}</p>
			{/each}

			<div class="flex justify-end gap-3">
				<Button variant="ghost" href="/settings">Back to settings</Button>
				<Button variant="primary" href="/contacts">See the people</Button>
			</div>
		</section>
	{/if}
</main>
