<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import Button from '$lib/components/Button.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import KeptItem from '$lib/components/KeptItem.svelte';
	import Section from '$lib/components/Section.svelte';
	import { roleKey } from '$lib/circles/role-key';
	import type { JsonCommand } from '$lib/commands/commands';
	import { useI18n } from '$lib/i18n/context.svelte';
	import { processImage } from '$lib/image/process-image';
	import { thumbnailUrl } from '$lib/media/urls';
	import { isKept, type KeptOf, type KeptPhoto } from '$lib/pwa/outbox';
	import { outbox } from '$lib/pwa/outbox.svelte';
	import { reachability } from '$lib/pwa/reachability.svelte';
	import { ulid } from 'ulid';
	import type { CirclePageData, OpenPhotos } from './types';

	/*
	 * The Photos section of a circle (docs/02 §2.4.2, concept §3.1): a square grid in the gallery's
	 * order, role chips over it when there is more than one group to choose between, and *Add
	 * photos* for several files at once. An upload asks for the role — preset to the chip that is
	 * active, offering only roles the circle's members have — and for shared or private.
	 */
	let {
		data,
		error,
		photoDate,
		onopen
	}: {
		data: CirclePageData;
		error: string | null;
		photoDate: (createdAt: number) => string;
		onopen: OpenPhotos;
	} = $props();

	const i18n = useI18n();
	const t = i18n.t;
	const circle = $derived(data.circle);
	const view = $derived(data.photos);

	// The chip that is active: `undefined` is *All*, null is *No role*, else a role key. A role
	// whose last photo went away falls back to *All*.
	let chosen = $state<string | null | undefined>(undefined);
	const active = $derived(view.chips.some((c) => c.key === chosen) ? chosen : undefined);
	const shown = $derived(active === undefined ? view.photos : view.photos.filter((p) => p.roleKey === active));

	let open = $state(false);
	let picked = $state<File[]>([]);
	let uploadRole = $state('');
	let uploading = $state(false);
	let uploadError = $state<string | null>(null);

	function choose(key: string | null | undefined) {
		chosen = key;
		// The upload follows the chip, if it is a role a new photo may still be given.
		uploadRole = data.roleSuggestions.find((role) => roleKey(role) === key) ?? '';
	}

	// An upload goes through the outbox like a person's photos (docs/concepts/offline-capture.md
	// §4), kept on the device while Stella cannot take it and shown here until it is sent.
	const kept = $derived(
		outbox.mine.filter(
			(item): item is KeptOf<'circleGallery.add'> =>
				isKept(item, 'circleGallery.add') && item.command.payload.circleId === circle.id
		)
	);
	async function upload(event: SubmitEvent) {
		event.preventDefault();
		const formEl = event.currentTarget as HTMLFormElement;
		if (picked.length === 0) return;
		uploading = true;
		uploadError = null;
		try {
			const photos: KeptPhoto[] = [];
			for (const file of picked) photos.push({ id: ulid(), ...(await processImage(file)) });
			const visibility = new FormData(formEl).get('visibility') === 'private' ? 'private' : 'shared';
			const command: JsonCommand = {
				id: ulid(),
				type: 'circleGallery.add',
				payload: { circleId: circle.id, role: uploadRole === '' ? null : uploadRole, visibility },
				issuedAt: Date.now()
			};
			if (!reachability.reachable) {
				await outbox.add(command, photos, circle.name);
			} else {
				const delivery = await outbox.submit(command, photos, circle.name);
				if (delivery.status === 'refused') {
					uploadError = delivery.reason;
					return;
				}
				if (delivery.status === 'applied') await invalidateAll();
			}
			picked = [];
			formEl.reset();
			open = false;
		} catch {
			uploadError = t('circles.photos.uploadFailed');
		} finally {
			uploading = false;
		}
	}
	const CHIP =
		'rounded-full px-3 py-1 text-sm font-medium text-fg-muted transition-colors hover:text-fg aria-pressed:bg-primary-soft aria-pressed:font-semibold aria-pressed:text-fg';
	const SEG = 'flex cursor-pointer items-center gap-1.5 rounded-full border border-border bg-bg px-3 py-1.5 text-sm has-checked:border-primary has-checked:bg-primary-soft has-checked:font-semibold has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-primary';
</script>

<Section
	id="photos"
	title={t('circles.photos.title')}
	count={view.photos.length || undefined}
	addLabel={t('circles.photos.add')}
	error={error ?? uploadError}
	bind:open
>
	{#if kept.length > 0}
		<ul class="mb-3 flex flex-col gap-2" data-testid="kept-circle-photos">
			{#each kept as item (item.command.id)}<li><KeptItem {item} /></li>{/each}
		</ul>
	{/if}
	{#if view.chips.length > 1}
		<div class="mb-3 flex flex-wrap gap-1.5" role="group" aria-label={t('circles.photos.filter')} data-testid="circle-photo-chips">
			<button type="button" class={CHIP} aria-pressed={active === undefined} onclick={() => choose(undefined)}>
				{t('circles.photos.all')} <span class="text-xs text-fg-muted">{view.photos.length}</span>
			</button>
			{#each view.chips as chip (chip.key)}
				<button type="button" class={CHIP} aria-pressed={active === chip.key} onclick={() => choose(chip.key)}>
					{chip.label ?? t('circles.noRole')} <span class="text-xs text-fg-muted">{chip.count}</span>
				</button>
			{/each}
		</div>
	{/if}
	{#if shown.length > 0}
		<ul class="grid grid-cols-3 gap-1.5 sm:grid-cols-5 sm:gap-2" data-testid="circle-photo-grid">
			{#each shown as p, index (p.id)}
				<li class="relative">
					<button
						type="button"
						data-photo-tile={p.id}
						onclick={(event) => onopen(shown.map((s) => s.id), index, event.currentTarget)}
						class="relative block w-full overflow-hidden rounded-control focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
					>
						<img
							src={thumbnailUrl(p.id)}
							alt={p.caption ?? (p.roleLabel ? t('circles.photos.ofRole', { name: circle.name, role: p.roleLabel }) : t('circles.photos.of', { name: circle.name }))}
							class="aspect-square w-full object-cover"
							loading="lazy"
						/>
						{#if p.pinnedAt !== null}
							<!-- A star, not a tint: the pin reads without colour (docs/05 §5.10). -->
							<span class="pointer-events-none absolute left-1 top-1 rounded-full bg-bg/80 p-1 text-primary">
								<Icon name="pinned" size={11} />
							</span>
							<span class="sr-only">{t('contact.photos.favourite')}</span>
						{/if}
						<span
							class="pointer-events-none absolute inset-x-0 bottom-0 flex flex-col bg-gradient-to-t from-black/65 to-transparent px-1.5 pb-1 pt-3 text-left text-[0.6875rem] font-medium text-white"
							aria-hidden="true"
						>
							{#if p.roleLabel}<span class="truncate">{p.roleLabel}</span>{/if}
							<span class="truncate">{photoDate(p.createdAt)}</span>
						</span>
					</button>
					{#if p.visibility === 'private'}
						<span class="absolute right-1 top-1 rounded-full bg-bg/80 p-1 text-fg-muted" title={t('contact.photos.privateHint')}>
							<Icon name="private" size={11} />
						</span>
					{/if}
				</li>
			{/each}
		</ul>
	{/if}

	{#snippet editor()}
		<form onsubmit={upload} class="flex flex-col gap-4">
			<label class="flex flex-col gap-1 text-sm">
				<span class="text-fg-muted">{t('circles.photos.pictures')}</span>
				<input
					name="files"
					type="file"
					accept="image/*"
					multiple
					required
					onchange={(e) => (picked = Array.from(e.currentTarget.files ?? []))}
					class="rounded-md border border-border-input bg-bg px-3 py-2 text-fg"
				/>
			</label>
			{#if data.roleSuggestions.length > 0}
				<fieldset class="flex flex-col gap-2">
					<legend class="mb-2 text-sm text-fg-muted">{t('circles.photos.whoIsIn')}</legend>
					<div class="flex flex-wrap gap-1.5">
						<label class={SEG}><input type="radio" name="role" value="" bind:group={uploadRole} class="sr-only" />{t('circles.noRole')}</label>
						{#each data.roleSuggestions as role (role)}
							<label class={SEG}><input type="radio" name="role" value={role} bind:group={uploadRole} class="sr-only" />{role}</label>
						{/each}
					</div>
					<p class="text-xs text-fg-subtle">
						{uploadRole ? t('circles.photos.roleHint', { role: uploadRole }) : t('circles.photos.noRoleHint')}
					</p>
				</fieldset>
			{/if}
			<fieldset class="flex flex-col gap-2">
				<legend class="mb-2 text-sm text-fg-muted">{t('circles.photos.whoCanSee')}</legend>
				<div class="flex flex-wrap gap-1.5">
					<label class={SEG}><input type="radio" name="visibility" value="shared" checked class="sr-only" /><Icon name="shared" size={14} />{t('common.shared')}</label>
					<label class={SEG}><input type="radio" name="visibility" value="private" class="sr-only" /><Icon name="private" size={14} />{t('common.private')}</label>
				</div>
			</fieldset>
			<Button variant="primary" size="sm" disabled={uploading} class="self-start">
				{uploading ? t('circles.photos.adding') : t('circles.photos.addCount', { count: picked.length })}
			</Button>
		</form>
	{/snippet}
</Section>
