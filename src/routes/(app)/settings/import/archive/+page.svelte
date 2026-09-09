<script lang="ts">
	import Button from '$lib/components/Button.svelte';
	import { countLabel, summariseRestore, tableLabel } from '$lib/archive/labels';
	import { useI18n } from '$lib/i18n/context.svelte';
	import type { RestoreWarning } from '$lib/server/domain/archive/restore';
	import type { ActionData } from './$types';

	/*
	 * Restoring from an archive (docs/02 §2.15). One form and one report: what arrived, what
	 * was already here, and anything the archive could not give back.
	 */
	let { form }: { form: ActionData } = $props();

	const i18n = useI18n();
	const t = i18n.t;

	const report = $derived(form && 'report' in form ? form.report : null);
	const lines = $derived(report ? summariseRestore(report.added, report.skipped) : []);
	/** One warning from the restore plan, worded here rather than in the domain. */
	function warningText(warning: RestoreWarning): string {
		switch (warning.code) {
			case 'photoBadPath':
				return t('archive.warning.photoBadPath', { file: warning.file });
			case 'pointedAtMissingPeople':
				return t('archive.warning.pointedAtMissingPeople', {
					what: t(`archive.mention.${warning.what}` as 'archive.mention.noteMentions')
				});
			case 'circleMissingParent':
				return t('archive.warning.circleMissingParent', { name: warning.name });
			case 'circleMemberMissing':
				return t('archive.warning.circleMemberMissing', { name: warning.name });
			case 'imagesMissing':
				return t('archive.warning.imagesMissing', { count: warning.count });
			default:
				return t(`archive.warning.${warning.code}` as 'archive.warning.noteWithoutText');
		}
	}

	const exportedOn = $derived(
		report?.exportedAt ? new Date(report.exportedAt).toLocaleDateString(i18n.intlLocale) : null
	);
</script>

<main class="mx-auto flex w-full max-w-2xl flex-col gap-8 px-6 py-10">
	<header class="flex flex-col gap-2">
		<h1 class="text-2xl font-semibold text-fg">{t('archive.restore.title')}</h1>
		<p class="text-fg-muted">{t('archive.restore.intro')}</p>
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
			<span>{t('archive.restore.fileLabel')}</span>
			<input
				type="file"
				name="archive"
				accept=".tar,application/x-tar"
				required
				class="rounded-md border border-border bg-bg px-3 py-2 text-sm text-fg"
			/>
		</label>
		<p class="text-xs text-fg-subtle">{t('archive.restore.fileHint')}</p>
		<Button variant="primary" class="self-end">{t('archive.restore.submit')}</Button>
	</form>

	{#if report}
		<section class="flex flex-col gap-4" data-testid="restore-report">
			<h2 class="text-sm font-medium text-fg-muted">
				{t('archive.restore.from', { household: report.household })}{exportedOn
					? t('archive.restore.exportedOn', { day: exportedOn })
					: ''}
			</h2>

			<dl class="flex flex-col gap-px overflow-hidden rounded-app bg-card shadow-card">
				{#each lines as line (line.table)}
					<div class="flex items-baseline justify-between gap-4 px-4 py-2" data-kind={line.table}>
						<dt class="text-sm text-fg">{tableLabel(t, line.table, line.added + line.skipped)}</dt>
						<dd class="text-sm text-fg-muted">
							<span class="font-medium text-fg">
								{t('archive.restore.added', { count: line.added })}
							</span>
							{#if line.skipped > 0}
								<span> · {t('archive.restore.alreadyHere', { count: line.skipped })}</span>
							{/if}
						</dd>
					</div>
				{/each}
				{#if lines.length === 0}
					<p class="px-4 py-3 text-sm text-fg-muted">
						{t('archive.restore.nothingNew')}
					</p>
				{/if}
			</dl>

			<p class="text-sm text-fg-muted">
				{t('archive.restore.photos', {
					stored: countLabel(t, 'photo', report.media.stored),
					already: report.media.alreadyThere,
					missing: report.media.missing
				})}
			</p>

			{#each report.warnings as warning, i (i)}
				<p class="rounded-md bg-warning/10 px-3 py-2 text-sm text-fg">{warningText(warning)}</p>
			{/each}

			<div class="flex justify-end gap-3">
				<Button variant="ghost" href="/settings">{t('archive.restore.backToSettings')}</Button>
				<Button variant="primary" href="/contacts">{t('archive.restore.seePeople')}</Button>
			</div>
		</section>
	{/if}
</main>
