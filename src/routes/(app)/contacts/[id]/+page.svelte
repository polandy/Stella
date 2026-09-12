<script lang="ts">
	import AvatarUploader from '$lib/components/AvatarUploader.svelte';
	import Button from '$lib/components/Button.svelte';
	import EgoGraph from '$lib/components/EgoGraph.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import MentionTextarea from '$lib/components/MentionTextarea.svelte';
	import InlineEdit from '$lib/components/InlineEdit.svelte';
	import Section from '$lib/components/Section.svelte';
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import { processImage } from '$lib/image/process-image';
	import { mediaUrl, thumbnailUrl } from '$lib/media/urls';
	import RemoveButton from '$lib/components/RemoveButton.svelte';
	import { useRemovals } from '$lib/undo/context.svelte';
	import { removalKey, type RemovalKind } from '$lib/undo/keys';
	import { savedEnhance } from '$lib/undo/saved';
	import StoryTimeline from '$lib/components/StoryTimeline.svelte';
	import { dayLabel } from '$lib/dates/labels';
	import { useI18n } from '$lib/i18n/context.svelte';
	import { hasMessage } from '$lib/i18n/translate';
	import {
		relationshipRowLabel,
		relationshipStatusLabel,
		relationshipTypeLabel
	} from '$lib/relationships/labels';
	import { requestedTab, type ContactTab } from '$lib/contacts/tabs';
	import { kinshipLabel } from '$lib/kinship/labels';
	import { accentChipStyle, accentDotStyle, categoryVar } from '$lib/design/tokens';
	import { RELATIONSHIP_STATUSES } from '$lib/relationships/status';
	import { PARENT_CHILD_TYPE_KEY } from '$lib/relationships/type-keys';
	import { KIND_PRESENTATION } from '$lib/interactions/kinds';
	import { untrack } from 'svelte';
	import type { ActionData, PageData } from './$types';

	/*
	 * A person's page (docs/05 §5.5): who they are on the left, what has happened on the right.
	 * Every form is closed until asked for, so the page reads as a person rather than as a stack
	 * of empty inputs. Below `md` the two columns stack with the tabs first — who this person is
	 * connected to is what opening their page answers first — and the profile follows underneath.
	 */
	let { data, form }: { data: PageData; form: ActionData } = $props();

	const i18n = useI18n();
	const t = i18n.t;
	const c = $derived(data.contact);

	/** A stored vocabulary value — a field or date kind — in the viewer's language. */
	const kindLabel = (group: 'fieldKind' | 'dateKind', kind: string): string => {
		const key = `contact.${group}.${kind}`;
		return hasMessage(key) ? t(key) : kind;
	};
	// Today in the browser's zone, as the default day for a new interaction.
	const today = new Date().toLocaleDateString('en-CA');

	/** One class for every text input on the page, so they cannot drift apart. */
	const INPUT =
		'rounded-control border border-border bg-bg px-3 py-2 text-sm text-fg placeholder:text-fg-subtle';

	// People is the default: who this person is connected to is what opening their page answers
	// first (docs/05 §5.5). `?tab=` always wins, so a link that points at another tab — the
	// passive "Mentioned in" list does — still arrives where it meant to.
	const askedForTab = (): ContactTab => requestedTab(data.tab) ?? 'people';
	// The story panel's log-interaction form posts natively rather than through `enhance`, so a
	// failed validation reloads the page with no `?tab=` to say where it was opened — its own
	// error is the only sign this should still be Story rather than the default.
	let tab = $state<ContactTab>(
		untrack(() => (form?.interactionError ? 'story' : askedForTab()))
	);
	/*
	 * Walking from one person to another reuses this component, so the open tab has to follow
	 * the page rather than stay where the previous person left it — a link may ask for a tab
	 * (a passive reference points at the one its entry lives on, docs/02 §2.20.1), and without
	 * this it would arrive on whatever was open before.
	 */
	let shownPerson = untrack(() => data.contact.id);
	$effect(() => {
		const id = data.contact.id;
		if (id === shownPerson) return;
		shownPerson = id;
		tab = untrack(askedForTab);
	});
	let relateOpen = $state(untrack(() => data.relateTo) !== null);
	// The hero's "Log contact" opens the story section's form; the section owns the state.
	let logOpen = $state(false);

	/*
	 * Counts are shown where they are exact. The story is paged, so its tab carries no number
	 * rather than one that quietly means "as much as we have fetched".
	 */
	const tabs: { id: ContactTab; label: string; count?: number }[] = $derived([
		{ id: 'people', label: t('contact.tab.people'), count: data.relationships.length },
		{ id: 'story', label: t('contact.tab.story') },
		{ id: 'notes', label: t('contact.tab.notes'), count: data.notes.length },
		{ id: 'photos', label: t('contact.tab.photos'), count: data.gallery.length },
		{ id: 'mentions', label: t('contact.tab.mentions'), count: data.mentionedIn.length }
	]);

	/*
	 * The gallery (docs/02 §2.14). Photos are downscaled and EXIF-stripped in the browser
	 * before upload, so nothing leaves the device carrying a location. The lightbox is one
	 * overlay reused for whichever photo is open; `openPhoto` is an index into the grid so
	 * the arrow keys can walk it.
	 */
	let picked = $state<File[]>([]);
	let uploading = $state(false);
	let uploadError = $state<string | null>(null);
	let openPhoto = $state<number | null>(null);
	const openedPhoto = $derived(openPhoto === null ? null : (data.gallery[openPhoto] ?? null));

	async function uploadPhotos(event: SubmitEvent) {
		event.preventDefault();
		const formEl = event.currentTarget as HTMLFormElement;
		if (picked.length === 0) return;
		uploading = true;
		uploadError = null;
		try {
			const body = new FormData(formEl);
			body.delete('files');
			for (const file of picked) {
				const { image, thumb, width, height } = await processImage(file);
				body.append('image', image, 'photo.jpg');
				body.append('thumb', thumb, 'thumb.jpg');
				body.append('width', String(width));
				body.append('height', String(height));
			}
			const res = await fetch(`/contacts/${c.id}?/addGalleryPhotos`, { method: 'POST', body });
			if (!res.ok) throw new Error();
			picked = [];
			formEl.reset();
			await invalidateAll();
		} catch {
			uploadError = t('contact.photos.uploadFailed');
		} finally {
			uploading = false;
		}
	}

	function onGalleryKeydown(event: KeyboardEvent) {
		const at = openPhoto;
		if (at === null || data.gallery.length === 0) return;
		if (event.key === 'Escape') openPhoto = null;
		if (event.key === 'ArrowRight') openPhoto = (at + 1) % data.gallery.length;
		if (event.key === 'ArrowLeft') openPhoto = (at - 1 + data.gallery.length) % data.gallery.length;
	}

	function logContact() {
		tab = 'story';
		logOpen = true;
	}

	// One ego-graph node per connected person (a person may hold several relationship
	// types; the graph shows them once, keeping the first label).
	const egoNodes = $derived.by(() => {
		const seen = new Set<string>();
		const out: { id: string; name: string; label: string; category: string }[] = [];
		for (const r of data.relationships) {
			if (seen.has(r.otherContactId)) continue;
			seen.add(r.otherContactId);
			out.push({
				id: r.otherContactId,
				name: r.otherDisplayName,
				label: relationshipRowLabel(t, r),
				category: r.category
			});
		}
		return out;
	});

	/** How this person came into the household's life, as one line, or null. */
	const metLine = $derived.by(() => {
		const parts = [c.howWeMet, c.metPlace, c.metDate].filter(Boolean);
		return parts.length > 0 ? parts.join(' · ') : null;
	});

	// A row on its way out (docs/02 §2.23) is gone from the list while its undo window is open,
	// and back in it the moment Undo is pressed. The counts follow, so a section never says two
	// tags over one chip.
	const removals = useRemovals();
	const shown = <T extends { id: string }>(kind: RemovalKind, rows: T[]) =>
		rows.filter((row) => !removals.isPending(removalKey(kind, row.id)));
	const visibleFields = $derived(shown('field', data.fields));
	const visibleDates = $derived(shown('date', data.dates));
	const visibleTags = $derived(shown('tag', data.tags));
	const visibleRelationships = $derived(shown('relationship', data.relationships));
	const visibleCircles = $derived(
		data.circles.filter((circle) => !removals.isPending(removalKey('membership', circle.membershipId)))
	);
	// Saving through `enhance` keeps the page — and with it any open undo window — alive, so
	// each section closes itself here instead of on the reload a redirect used to cause.
	// Logging a touchpoint is the exception: the story timeline owns its paged list, and only
	// a fresh page gives it the new item, so that form still posts natively.
	let openSection = $state({ contact: false, dates: false, circles: false, tags: false, note: false });
	// The note's audience narrows whom the @-picker offers (docs/02 §2.20.1).
	let noteVisibility = $state<'shared' | 'private'>('shared');
	type SectionName = keyof typeof openSection;
	const saved = (name: SectionName) =>
		savedEnhance(removals, t('components.saved'), () => (openSection[name] = false));
	// Relationships keep their own open state: the quick-add flow opens that section by URL.
	const savedRelationship = savedEnhance(removals, t('components.saved'), () => (relateOpen = false));
	/** Which relationship has its details open for correction; one at a time. */
	let editingRelationship = $state<string | null>(null);
	const savedRelationshipEdit = savedEnhance(
		removals,
		t('components.saved'),
		() => (editingRelationship = null)
	);
	const savedArchive = savedEnhance(removals, t('components.saved'));
	/** Archived or not decides the action, the wording and the marker; asked once. */
	const archived = $derived(c.archivedAt !== null);
	/** The second click that a deletion asks for; there is no undo after it. */
	let confirmingDelete = $state(false);
	/** Whether the merge picker is open; the survivor is always this page's person. */
	let merging = $state(false);
	/** The day it happened, for the marker's tooltip. */
	const archivedOn = $derived(
		c.archivedAt === null ? null : dayLabel(i18n, new Date(c.archivedAt).toLocaleDateString('en-CA'))
	);
</script>

<svelte:window onkeydown={onGalleryKeydown} />

<svelte:head><title>{t('contact.title', { name: c.displayName })}</title></svelte:head>

<main class="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-6 md:px-6 md:py-8">
	<!-- Hero: who this is, when you last spoke, and the two things you came to do -->
	<header class="flex flex-wrap items-start gap-4">
		<AvatarUploader contactId={c.id} name={c.displayName} avatarPhotoId={c.avatarPhotoId} size={72} />
		<div class="min-w-0 flex-1">
			<!-- Name and description are edited where they are read (docs/02 §2.2). -->
			<h1 class="tracking-tight text-fg">
				<InlineEdit
					action="?/editProfile"
					name="displayName"
					value={c.displayName}
					extra={{ description: c.description ?? '' }}
					label={t('contact.editName')}
					error={form?.profileError ?? null}
					heading
				/>
			</h1>
			<p class="text-fg-muted">
				<InlineEdit
					action="?/editProfile"
					name="description"
					value={c.description ?? ''}
					extra={{ displayName: c.displayName }}
					label={t('contact.editDescription')}
					placeholder={t('contact.descriptionPlaceholder')}
					empty={t('contact.addDescription')}
				/>
			</p>

			<div class="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-fg-subtle">
				{#if data.lastContactedAt}
					<span data-testid="last-contacted">
						{t('contact.lastContact')}
						<time datetime={data.lastContactedAt} class="font-medium text-fg-muted">
							{dayLabel(i18n, data.lastContactedAt)}
						</time>
					</span>
				{:else}
					<span data-testid="last-contacted">{t('contact.noContactYet')}</span>
				{/if}
				{#if metLine}<span>{t('contact.met')} <span class="font-medium text-fg-muted">{metLine}</span></span>{/if}
				{#if c.visibility === 'private'}
					<span class="inline-flex items-center gap-1" title={t('contact.privateContact')}>
						<Icon name="private" size={11} />{t('contact.private')}
					</span>
				{/if}
				{#if archived}
					<span
						data-testid="archived-marker"
						class="inline-flex items-center gap-1 rounded-full bg-bg-sunken px-2 py-0.5 text-fg-subtle"
						title={t('contact.archivedOn', { day: archivedOn ?? '' })}
					>
						<Icon name="archive" size={11} />{t('contact.archived')}
					</span>
				{/if}
			</div>
			{#if form?.avatarError}<p class="mt-1 text-xs text-danger">{form.avatarError}</p>{/if}
		</div>

		<div class="flex w-full gap-2 sm:w-auto">
			<Button variant="primary" icon="write" href="/contacts/{c.id}/journal" class="flex-1 sm:flex-none">
				{t('contact.write')}
			</Button>
			<Button icon="met" type="button" onclick={logContact} class="flex-1 sm:flex-none">
				{t('contact.logContact')}
			</Button>
		</div>
	</header>

	<!--
		The quick overview (docs/05 §5.5): how things stand with this person, in numbers, before
		the tabs go into any of them. Sits above every tab rather than just the story's, since it
		is useful context no matter which one is open.
	-->
	<div
		class="flex flex-wrap gap-x-3 gap-y-1 rounded-control border border-primary/30 bg-primary-soft px-3 py-2 text-xs text-fg"
	>
		<span>{t('contact.overview.relationships', { count: data.relationships.length })}</span>
		<span class="text-fg-subtle" aria-hidden="true">·</span>
		<span>{t('contact.overview.encounters', { count: data.interactions.length })}</span>
	</div>

	<div class="grid gap-6 lg:grid-cols-[19rem_minmax(0,1fr)] lg:items-start">
		<!-- Profile. Second on a phone: the tabs are why you opened the page. -->
		<div class="order-2 flex min-w-0 flex-col gap-4 lg:sticky lg:top-4 lg:order-1">
			<Section title={t('contact.section.contact')} addLabel={t('common.add')} error={form?.fieldError ?? null} bind:open={openSection.contact}>
				{#if visibleFields.length > 0}
					<dl class="grid grid-cols-[5rem_minmax(0,1fr)] gap-x-3 gap-y-1.5 text-sm">
						{#each visibleFields as f (f.id)}
							<dt class="truncate text-fg-subtle">{f.label ?? kindLabel('fieldKind', f.kind)}</dt>
							<dd class="flex min-w-0 items-center gap-2">
								{#if f.href}
									<a href={f.href} class="truncate text-link hover:underline">{f.value}</a>
								{:else}
									<span class="truncate text-fg">{f.value}</span>
								{/if}
								<RemoveButton
									kind="field"
									id={f.id}
									action="?/removeField"
									fields={{ fieldId: f.id }}
									label={t('contact.removeField', { what: f.label ?? kindLabel('fieldKind', f.kind) })}
									removed={t('contact.fieldRemoved')}
									class="ml-auto"
								/>
							</dd>
						{/each}
					</dl>
				{:else}
					<p class="text-sm text-fg-subtle">{t('contact.noFields')}</p>
				{/if}

				{#snippet editor()}
					<form method="POST" action="?/addField" use:enhance={saved('contact')} class="flex flex-wrap items-end gap-2">
						<select name="kind" aria-label={t('contact.kind')} class={INPUT}>
							{#each data.fieldKinds as kind (kind)}
								<option value={kind}>{kindLabel('fieldKind', kind)}</option>
							{/each}
						</select>
						<input name="label" placeholder={t('contact.labelOptional')} class="w-28 {INPUT}" />
						<input name="value" placeholder={t('contact.value')} required class="min-w-40 flex-1 {INPUT}" />
						<Button variant="primary" size="sm">{t('common.add')}</Button>
					</form>
				{/snippet}
			</Section>

			<Section title={t('contact.section.dates')} addLabel={t('common.add')} error={form?.dateError ?? null} bind:open={openSection.dates}>
				{#if data.derivedBirthday || data.estimatedBirthYear || visibleDates.length > 0}
					<ul class="flex flex-col gap-1.5 text-sm">
						{#if data.estimatedBirthYear}
							<li class="flex items-center gap-3">
								<span class="w-20 shrink-0 text-fg-subtle">{t('contact.born')}</span>
								<span class="flex-1 truncate text-fg">
									{t('contact.around', { year: data.estimatedBirthYear })}
								</span>
								<span class="text-xs text-fg-subtle">{t('contact.estimated')}</span>
							</li>
						{/if}
						{#if data.derivedBirthday}
							<li class="flex items-center gap-3">
								<span class="w-20 shrink-0 text-fg-subtle">{t('contact.birthday')}</span>
								<span class="flex-1 truncate text-fg">{dayLabel(i18n, data.derivedBirthday)}</span>
								<span class="text-xs text-fg-subtle">{t('contact.fromProfile')}</span>
							</li>
						{/if}
						{#each visibleDates as d (d.id)}
							<li class="flex items-center gap-3">
								<span class="w-20 shrink-0 truncate text-fg-subtle">
									{d.label ?? kindLabel('dateKind', d.kind)}
								</span>
								<span class="flex-1 truncate text-fg">{dayLabel(i18n, d.date)}</span>
								{#if !d.recursYearly}<span class="text-xs text-fg-subtle">{t('contact.once')}</span>{/if}
								{#if !d.remind}
									<span class="text-xs text-fg-subtle" title={t('contact.mutedHint')}>
										{t('contact.muted')}
									</span>
								{/if}
								<RemoveButton
									kind="date"
									id={d.id}
									action="?/removeDate"
									fields={{ dateId: d.id }}
									label={t('contact.removeDate', { what: d.label ?? kindLabel('dateKind', d.kind) })}
									removed={t('contact.dateRemoved')}
								/>
							</li>
						{/each}
					</ul>
				{:else}
					<p class="text-sm text-fg-subtle">{t('contact.noDates')}</p>
				{/if}

				{#snippet editor()}
					<form method="POST" action="?/addDate" use:enhance={saved('dates')} class="flex flex-wrap items-end gap-2">
						<select name="kind" aria-label={t('contact.kind')} class={INPUT}>
							{#each data.dateKinds as kind (kind)}
								<option value={kind}>{kindLabel('dateKind', kind)}</option>
							{/each}
						</select>
						<input type="date" name="date" required class={INPUT} aria-label={t('contact.day')} />
						<input name="label" placeholder={t('contact.dateNameForCustom')} class="w-full {INPUT}" />
						<label class="flex items-center gap-1.5 text-sm text-fg-muted">
							<input type="checkbox" name="yearUnknown" /> {t('contact.yearUnknown')}
						</label>
						<label class="flex items-center gap-1.5 text-sm text-fg-muted">
							<input type="checkbox" name="recursYearly" checked /> {t('contact.everyYear')}
						</label>
						<label class="flex items-center gap-1.5 text-sm text-fg-muted">
							<input type="checkbox" name="remind" checked /> {t('contact.showOnHome')}
						</label>
						<Button variant="primary" size="sm" class="ml-auto">{t('common.add')}</Button>
					</form>
				{/snippet}
			</Section>

			<Section title={t('contact.section.circles')} count={visibleCircles.length} addLabel={t('contact.join')} error={form?.circleError ?? null} bind:open={openSection.circles}>
				{#snippet action()}
					<a href="/circles" class="text-xs text-link hover:underline">{t('contact.allCircles')}</a>
				{/snippet}

				{#if visibleCircles.length}
					<ul class="flex flex-wrap gap-1.5">
						{#each visibleCircles as circle (circle.membershipId)}
							<li class="min-w-0 max-w-full">
								<span class="inline-flex max-w-full items-center gap-1.5 rounded-full border border-border py-1 pl-2.5 pr-1.5 text-sm">
									<span class="size-2 shrink-0 rounded-full" style={accentDotStyle(circle.color)}></span>
									<a
										href="/circles/{circle.circleId}"
										class="truncate text-fg hover:underline"
										title={circle.name}
									>
										{circle.name}
									</a>
									{#if circle.role}
										<span class="shrink-0 text-xs text-fg-subtle">· {circle.role}</span>
									{/if}
									<RemoveButton
										kind="membership"
										id={circle.membershipId}
										action="?/leaveCircle"
										fields={{ circleId: circle.circleId }}
										label={t('contact.leaveCircle', { name: circle.name })}
										removed={t('contact.leftCircle')}
										bare
										class="contents"
									/>
								</span>
							</li>
						{/each}
					</ul>
				{:else}
					<p class="text-sm text-fg-subtle">{t('contact.noCircles')}</p>
				{/if}

				{#snippet editor()}
					<form method="POST" action="?/joinCircle" use:enhance={saved('circles')} class="flex flex-wrap items-end gap-2">
						<input
							name="circleName"
							list="circle-names"
							placeholder={t('contact.joinOrCreate')}
							class="min-w-40 flex-1 {INPUT}"
						/>
						<datalist id="circle-names">
							{#each data.circleNames as name (name)}<option value={name}></option>{/each}
						</datalist>
						<input name="role" placeholder={t('contact.roleOptional')} class="w-28 {INPUT}" />
						<Button variant="primary" size="sm">{t('common.add')}</Button>
					</form>
				{/snippet}
			</Section>

			<Section title={t('contact.section.tags')} count={visibleTags.length} addLabel={t('common.add')} error={form?.tagError ?? null} bind:open={openSection.tags}>
				{#if visibleTags.length}
					<ul class="flex flex-wrap gap-1.5">
						{#each visibleTags as tag (tag.id)}
							<li
								class="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-sm font-medium"
								style={accentChipStyle(tag.color)}
							>
								{tag.name}
								<RemoveButton
									kind="tag"
									id={tag.id}
									action="?/removeTag"
									fields={{ tagId: tag.id }}
									label={t('contact.removeTag', { name: tag.name })}
									removed={t('contact.tagRemoved')}
									bare
									class="contents"
								/>
							</li>
						{/each}
					</ul>
				{:else}
					<p class="text-sm text-fg-subtle">{t('contact.noTags')}</p>
				{/if}

				{#snippet editor()}
					<form method="POST" action="?/addTag" use:enhance={saved('tags')} class="flex flex-wrap items-end gap-2">
						<input name="name" placeholder={t('contact.tagName')} required class="min-w-32 flex-1 {INPUT}" />
						<select name="color" aria-label={t('contact.colour')} class={INPUT}>
							{#each data.tagColors as color (color)}<option value={color}>{color}</option>{/each}
						</select>
						<Button variant="primary" size="sm">{t('common.add')}</Button>
					</form>
				{/snippet}
			</Section>

			<Section title={t('contact.section.howWeMet')}>
				{#if metLine}
					<p class="font-serif text-[15px] leading-relaxed text-fg">{metLine}</p>
				{:else}
					<p class="text-sm text-fg-subtle">{t('contact.notRecorded')}</p>
				{/if}
			</Section>

			<!--
				Rarely wanted, so it sits at the foot of the profile rather than beside Write:
				archiving takes someone out of the lists, it does not undo them (docs/02 §2.2).
			-->
			<form method="POST" action={archived ? '?/restore' : '?/archive'} use:enhance={savedArchive}>
				{#if archived}
					<Button variant="ghost" size="sm" icon="archive">{t('contact.archive.bringBack')}</Button>
				{:else}
					<Button variant="ghost" size="sm" icon="archive">{t('contact.archive.archive')}</Button>
				{/if}
				<p class="mt-1 text-xs text-fg-subtle">
					{archived ? t('contact.archive.archivedHint') : t('contact.archive.hint')}
				</p>
			</form>

			<!--
				Merging ends a record too, so it lives with the other admin-only tool and asks
				which duplicate to fold in (docs/02 §2.2). The survivor is the page you are on.
			-->
			{#if data.isAdmin}
				<div>
					<Button
						type="button"
						variant="ghost"
						size="sm"
						icon="people"
						aria-expanded={merging}
						onclick={() => (merging = !merging)}
					>
						{merging ? t('common.cancel') : t('contact.merge.open')}
					</Button>
					{#if merging}
						<form method="POST" action="?/merge" class="mt-2 flex flex-col gap-2 rounded-app bg-bg-sunken p-3">
							<p class="text-xs text-fg">
								{t('contact.merge.explain', { name: c.displayName })}
							</p>
							<label class="flex flex-col gap-1">
								<span class="text-xs text-fg-muted">{t('contact.merge.who')}</span>
								<select name="mergedId" class={INPUT} required>
									<option value="" disabled selected>{t('contact.merge.choose')}</option>
									{#each data.otherContacts as other (other.id)}
										<option value={other.id}>{other.displayName}</option>
									{/each}
								</select>
							</label>
							{#if form?.mergeError}<p class="text-xs text-danger">{form.mergeError}</p>{/if}
							<div>
								<Button variant="primary" size="sm">
									{t('contact.merge.submit', { name: c.displayName })}
								</Button>
							</div>
						</form>
					{/if}
				</div>
			{/if}

			<!--
				The irreversible one, so it asks twice and only an admin sees it (docs/02 §2.2).
				No undo window: there would be nothing left to put back.
			-->
			{#if data.isAdmin}
				<div>
					<Button
						type="button"
						variant="ghost"
						size="sm"
						icon="remove"
						aria-expanded={confirmingDelete}
						onclick={() => (confirmingDelete = !confirmingDelete)}
					>
						{confirmingDelete ? t('contact.delete.keep') : t('contact.delete.open')}
					</Button>
					{#if confirmingDelete}
						<form method="POST" action="?/delete" class="mt-2 flex flex-col gap-2 rounded-app bg-bg-sunken p-3">
							<p class="text-xs text-fg">
								{t('contact.delete.explain', { name: c.displayName })}
							</p>
							<div>
								<Button variant="danger" size="sm">
									{t('contact.delete.submit', { name: c.displayName })}
								</Button>
							</div>
						</form>
					{/if}
				</div>
			{/if}
		</div>

		<!-- What has happened, and who this person is connected to -->
		<div class="order-1 flex min-w-0 flex-col gap-3 lg:order-2">
			<div class="flex gap-1 border-b border-border" role="tablist" aria-label={t('contact.tablist')}>
				{#each tabs as t (t.id)}
					<button
						role="tab"
						id="tab-{t.id}"
						aria-selected={tab === t.id}
						aria-controls="panel-{t.id}"
						onclick={() => (tab = t.id)}
						class="-mb-px border-b-2 px-3 py-2 text-sm font-medium transition-colors"
						class:border-primary={tab === t.id}
						class:text-fg={tab === t.id}
						class:border-transparent={tab !== t.id}
						class:text-fg-muted={tab !== t.id}
					>
						{t.label}
						{#if t.count !== undefined}
							<span class="ml-1 text-xs text-fg-subtle">{t.count}</span>
						{/if}
					</button>
				{/each}
			</div>

			<div id="panel-story" role="tabpanel" aria-labelledby="tab-story" hidden={tab !== 'story'}>
				<Section
					title={t('contact.story.title')}
					addLabel={t('contact.logContact')}
					addIcon="met"
					bind:open={logOpen}
					error={form?.interactionError ?? null}
				>
					{#key c.id}
						<StoryTimeline contactId={c.id} initial={data.story} />
					{/key}

					{#snippet editor()}
						<form method="POST" action="?/logInteraction" class="flex flex-col gap-3">
							<div class="flex flex-wrap items-end gap-2">
								<select name="kind" aria-label={t('contact.kind')} class={INPUT}>
									{#each data.interactionKinds as kind (kind)}
										<option value={kind}>{t(KIND_PRESENTATION[kind].label)}</option>
									{/each}
								</select>
								<input type="date" name="happenedAt" value={today} required aria-label={t('contact.day')} class={INPUT} />
								<input name="title" placeholder={t('contact.interaction.titlePlaceholder')} class="min-w-48 flex-1 {INPUT}" />
							</div>
							<textarea name="description" rows="2" placeholder={t('contact.interaction.detailsPlaceholder')} class={INPUT}
							></textarea>
							{#if data.otherContacts.length > 0}
								<label class="flex flex-col gap-1 text-sm text-fg-muted">
									{t('contact.interaction.whoElse')}
									<select name="participants" multiple size="3" class={INPUT}>
										{#each data.otherContacts as other (other.id)}
											<option value={other.id}>{other.displayName}</option>
										{/each}
									</select>
								</label>
							{/if}
							<div class="flex flex-wrap items-center gap-4 text-sm">
								<label class="flex items-center gap-1.5">
									<input type="radio" name="visibility" value="shared" checked /> {t('common.shared')}
								</label>
								<label class="flex items-center gap-1.5">
									<input type="radio" name="visibility" value="private" /> {t('common.private')}
								</label>
								<Button variant="primary" size="sm" class="ml-auto">
									{t('contact.interaction.submit')}
								</Button>
							</div>
						</form>
					{/snippet}
				</Section>
			</div>

			<div id="panel-people" role="tabpanel" aria-labelledby="tab-people" hidden={tab !== 'people'}>
				<Section addLabel={t('contact.relationships.add')} error={form?.error ?? null} bind:open={relateOpen}>
					{#snippet action()}
						<a
							href="/graph?center={c.id}"
							class="inline-flex items-center gap-1 text-xs text-link hover:underline"
						>
							<Icon name="explore" size={12} />{t('contact.relationships.explore')}
						</a>
					{/snippet}

					{#if visibleRelationships.length > 0}
						<ul class="flex flex-col divide-y divide-border-subtle">
							{#each visibleRelationships as rel (rel.id)}
								<li class="flex flex-col gap-1 py-2 text-sm">
									<div class="flex items-center gap-3">
										<span
											class="size-2 shrink-0 rounded-full"
											style="background:{categoryVar(rel.category)}"
										></span>
										<span class="w-24 shrink-0 truncate text-fg-muted">
											{relationshipRowLabel(t, rel)}
										</span>
										<a href="/contacts/{rel.otherContactId}" class="font-medium text-fg hover:underline">
											{rel.otherDisplayName}
										</a>
										{#if rel.description}
											<span class="truncate text-fg-subtle">· {rel.description}</span>
										{/if}
										{#if rel.sinceDate}
											<span class="shrink-0 text-fg-subtle">
												· {t('contact.relationships.since', { day: dayLabel(i18n, rel.sinceDate) })}
											</span>
										{/if}
										{#if rel.status === 'former'}
											<span class="shrink-0 rounded-full bg-bg-sunken px-2 py-0.5 text-xs text-fg-subtle">
												{relationshipStatusLabel(t, rel.status)}
											</span>
										{/if}
										<div class="ml-auto flex shrink-0 items-center gap-1">
											<Button
												type="button"
												variant="ghost"
												size="sm"
												aria-expanded={editingRelationship === rel.id}
												onclick={() =>
													(editingRelationship = editingRelationship === rel.id ? null : rel.id)}
											>
												{editingRelationship === rel.id ? t('common.cancel') : t('common.edit')}
											</Button>
											<RemoveButton
												kind="relationship"
												id={rel.id}
												action="?/removeRelationship"
												fields={{ relationshipId: rel.id }}
												label={t('contact.relationships.remove', { name: rel.otherDisplayName })}
												removed={t('contact.relationships.removed')}
											/>
										</div>
									</div>

									{#if editingRelationship === rel.id}
										<!-- The type is not editable: changing it can flip the stored direction, so
										     that is a removal and a fresh entry (docs/02 §2.4). -->
										<form
											method="POST"
											action="?/editRelationship"
											use:enhance={savedRelationshipEdit}
											class="flex flex-wrap items-end gap-2 pl-5"
										>
											<input type="hidden" name="relationshipId" value={rel.id} />
											<label class="flex flex-1 flex-col gap-1">
												<span class="text-xs text-fg-muted">{t('contact.relationships.howConnect')}</span>
												<input
													name="description"
													value={rel.description ?? ''}
													placeholder={t('contact.relationships.howConnectPlaceholder')}
													class={INPUT}
												/>
											</label>
											<label class="flex flex-col gap-1">
												<span class="text-xs text-fg-muted">{t('contact.relationships.sinceLabel')}</span>
												<input type="date" name="sinceDate" value={rel.sinceDate ?? ''} class={INPUT} />
											</label>
											<label class="flex flex-col gap-1">
												<span class="text-xs text-fg-muted">{t('contact.relationships.status')}</span>
												<select name="status" class={INPUT}>
													<option value="" selected={rel.status === null}>
														{relationshipStatusLabel(t, null)}
													</option>
													{#each RELATIONSHIP_STATUSES as status (status)}
														<option value={status} selected={rel.status === status}>
															{relationshipStatusLabel(t, status)}
														</option>
													{/each}
												</select>
											</label>
											<Button variant="primary" size="sm">{t('common.save')}</Button>
										</form>
									{/if}
								</li>
							{/each}
						</ul>

						{#if egoNodes.length > 0}
							<!-- Pure SVG over relationships already on the page (no extra fetch, no
							     graph engine), so it can stay on rather than wait behind a toggle now
							     that People is the tab this page opens on (docs/05 §5.5). -->
							<div class="mt-3">
								<EgoGraph centerName={c.displayName} nodes={egoNodes} />
							</div>
						{/if}
					{:else}
						<p class="text-sm text-fg-subtle">{t('contact.relationships.none')}</p>
					{/if}

					<!--
						Propagation suggestions (docs/02 §2.4.1): what the link just added implies.
						Each is one confirmation of its own — Stella never writes them by itself.
					-->
					{#if data.proposals.length > 0}
						<div class="mt-4 flex flex-col gap-2 rounded-md border border-border-subtle bg-bg-sunken p-3" data-testid="kin-proposals">
							<h3 class="text-xs font-medium uppercase tracking-wide text-fg-subtle">
								{t('contact.relationships.alsoTrue')}
							</h3>
							{#each data.proposals as proposal (proposal.fromId + proposal.toId)}
								<form method="POST" action="?/addProposedRelationship" class="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
									<input type="hidden" name="fromId" value={proposal.fromId} />
									<input type="hidden" name="toId" value={proposal.toId} />
									<input type="hidden" name="typeId" value={PARENT_CHILD_TYPE_KEY} />
									<input type="hidden" name="propose" value={data.proposeFor} />
									<span class="text-fg">
										{t('contact.relationships.parentProposal', {
											parent: proposal.fromName,
											child: proposal.toName
										})}
									</span>
									<span class="text-fg-subtle">· {proposal.reason}</span>
									<Button variant="secondary" size="sm" class="ml-auto">
										{t('contact.relationships.addThisToo')}
									</Button>
								</form>
							{/each}
						</div>
					{/if}

					<!--
						Derived kinship (docs/02 §2.4.1): worked out from the entered links, never
						stored. Kept visually apart and labelled, so nobody mistakes an inference
						for something the household wrote down.
					-->
					{#if data.derivedKin.length > 0}
						<div class="mt-4 border-t border-border-subtle pt-3" data-testid="derived-kin">
							<h3 class="mb-2 flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-fg-subtle">
								<Icon name="explore" size={12} />{t('contact.relationships.derived')}
							</h3>
							<ul class="flex flex-col divide-y divide-border-subtle">
								{#each data.derivedKin as kin (kin.personId)}
									<li class="flex items-center gap-3 py-2 text-sm">
										<span class="w-24 shrink-0 truncate text-fg-muted">{kinshipLabel(t, kin)}</span>
										<a href="/contacts/{kin.personId}" class="font-medium text-fg hover:underline">
											{kin.displayName}
										</a>
										{#if kin.via.length > 0}
											<span class="truncate text-fg-subtle">
												· {t('contact.relationships.via', {
													people: kin.via.join(t('contact.relationships.viaAnd'))
												})}
											</span>
										{/if}
									</li>
								{/each}
							</ul>
						</div>
					{/if}

					{#snippet editor()}
						{#if data.otherContacts.length > 0}
							<form method="POST" action="?/addRelationship" use:enhance={savedRelationship} class="flex flex-wrap items-end gap-3">
								<label class="flex flex-1 flex-col gap-1 text-sm">
									<span class="text-fg-muted">
										{t('contact.relationships.is', { name: c.displayName })}
									</span>
									<select name="typeId" class={INPUT}>
										{#each data.relationshipTypes as type (type.id)}
											<option value={type.id}>{relationshipTypeLabel(t, type)}</option>
										{/each}
									</select>
								</label>
								<label class="flex flex-1 flex-col gap-1 text-sm">
									<span class="text-fg-muted">{t('contact.relationships.person')}</span>
									<select name="targetId" class={INPUT}>
										{#each data.otherContacts as other (other.id)}
											<option value={other.id} selected={other.id === data.relateTo}>
												{other.displayName}
											</option>
										{/each}
									</select>
								</label>
								<label class="flex w-full flex-col gap-1 text-sm sm:flex-1">
									<span class="text-fg-muted">{t('contact.relationships.howConnectOptional')}</span>
									<input
										name="description"
										placeholder={t('contact.relationships.howConnectPlaceholder')}
										class={INPUT}
									/>
								</label>
								<label class="flex flex-col gap-1 text-sm">
									<span class="text-fg-muted">{t('contact.relationships.sinceLabel')}</span>
									<input type="date" name="sinceDate" class={INPUT} />
								</label>
								<label class="flex flex-col gap-1 text-sm">
									<span class="text-fg-muted">{t('contact.relationships.status')}</span>
									<select name="status" class={INPUT}>
										<option value="">{relationshipStatusLabel(t, null)}</option>
										{#each RELATIONSHIP_STATUSES as status (status)}
											<option value={status}>{relationshipStatusLabel(t, status)}</option>
										{/each}
									</select>
								</label>
								<Button variant="primary" size="sm">{t('common.add')}</Button>
							</form>
						{:else}
							<p class="text-sm text-fg-subtle">{t('contact.relationships.addSomeoneFirst')}</p>
						{/if}
					{/snippet}
				</Section>
			</div>

			<div id="panel-notes" role="tabpanel" aria-labelledby="tab-notes" hidden={tab !== 'notes'}>
				<Section addLabel={t('contact.notes.add')} error={form?.noteError ?? null} bind:open={openSection.note}>
					{#if data.notes.length > 0}
						<ul class="flex flex-col gap-3">
							{#each data.notes as note (note.id)}
								<li class="rounded-control bg-bg-sunken p-3">
									<div class="mb-1 flex items-center gap-2">
										{#if note.isPinned}
											<span class="inline-flex items-center gap-1 text-xs font-medium text-primary">
												<Icon name="pinned" size={12} />{t('contact.notes.pinned')}
											</span>
										{/if}
										{#if note.title}<span class="font-medium text-fg">{note.title}</span>{/if}
										{#if note.visibility === 'private'}
											<span class="ml-auto inline-flex items-center gap-1 text-xs text-fg-subtle">
												<Icon name="private" size={11} />{t('common.privateInline')}
											</span>
										{/if}
									</div>
									<!-- server-rendered, already-safe Markdown (docs/02 §2.5) -->
									<div class="note-body text-fg">{@html note.bodyHtml}</div>
								</li>
							{/each}
						</ul>
					{:else}
						<p class="text-sm text-fg-subtle">{t('contact.notes.none')}</p>
					{/if}

					{#snippet editor()}
						<form method="POST" action="?/addNote" use:enhance={saved('note')} class="flex flex-col gap-3">
							<MentionTextarea
								name="body"
								label={t('contact.notes.label')}
								required
								candidates={data.otherContacts}
								visibility={noteVisibility}
								placeholder={t('contact.notes.placeholder')}
								class={INPUT}
							/>
							<div class="flex flex-wrap items-center gap-4 text-sm">
								<label class="flex items-center gap-1.5">
									<input type="checkbox" name="isPinned" /> {t('contact.notes.pin')}
								</label>
								<label class="flex items-center gap-1.5">
									<input type="radio" name="visibility" value="shared" bind:group={noteVisibility} />
									{t('common.shared')}
								</label>
								<label class="flex items-center gap-1.5">
									<input type="radio" name="visibility" value="private" bind:group={noteVisibility} />
									{t('common.private')}
								</label>
								<Button variant="primary" size="sm" class="ml-auto">{t('contact.notes.add')}</Button>
							</div>
						</form>
					{/snippet}
				</Section>
			</div>

			<div id="panel-photos" role="tabpanel" aria-labelledby="tab-photos" hidden={tab !== 'photos'}>
				<Section addLabel={t('contact.photos.add')} error={form?.photoError ?? uploadError}>
					{#if data.gallery.length > 0}
						<ul class="grid grid-cols-3 gap-2 sm:grid-cols-4" data-testid="photo-grid">
							{#each data.gallery as p, index (p.id)}
								<li class="relative">
									<button
										type="button"
										onclick={() => (openPhoto = index)}
										class="block w-full overflow-hidden rounded-control focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
									>
										<img
											src={thumbnailUrl(p.id)}
											alt={p.caption ?? t('contact.photos.of', { name: c.displayName })}
											class="aspect-square w-full object-cover"
											loading="lazy"
										/>
									</button>
									{#if p.visibility === 'private'}
										<span
											class="absolute right-1 top-1 rounded-full bg-bg/80 p-1 text-fg-muted"
											title={t('contact.photos.privateHint')}
										>
											<Icon name="private" size={11} />
										</span>
									{/if}
								</li>
							{/each}
						</ul>
					{:else}
						<p class="text-sm text-fg-subtle">{t('contact.photos.none')}</p>
					{/if}

					{#snippet editor()}
						<form onsubmit={uploadPhotos} class="flex flex-wrap items-end gap-3">
							<label class="flex flex-1 flex-col gap-1 text-sm">
								<span class="text-fg-muted">{t('contact.photos.pictures')}</span>
								<input
									name="files"
									type="file"
									accept="image/*"
									multiple
									required
									onchange={(e) => (picked = Array.from(e.currentTarget.files ?? []))}
									class={INPUT}
								/>
							</label>
							<fieldset class="flex items-center gap-3 text-sm">
								<label class="flex items-center gap-1.5">
									<input type="radio" name="visibility" value="shared" checked /> {t('common.shared')}
								</label>
								<label class="flex items-center gap-1.5">
									<input type="radio" name="visibility" value="private" /> {t('common.private')}
								</label>
							</fieldset>
							<Button variant="primary" size="sm" disabled={uploading}>
								{uploading ? t('contact.photos.adding') : t('common.add')}
							</Button>
						</form>
					{/snippet}
				</Section>
			</div>

			<!--
				Where somebody else names this person (docs/02 §2.20.1). Read-only: each item links
				to the person whose note or journal it is, because that is where it is written and
				edited. The list is already scoped to what this viewer may see.
			-->
			<div
				id="panel-mentions"
				role="tabpanel"
				aria-labelledby="tab-mentions"
				hidden={tab !== 'mentions'}
			>
				{#if data.mentionedIn.length > 0}
					<ul class="flex flex-col gap-2" data-testid="mentioned-in">
						{#each data.mentionedIn as reference (reference.kind + reference.entryId)}
							<li>
								<a
									href={reference.href}
									data-kind={reference.kind}
									class="block rounded-control bg-bg-sunken p-3 transition-colors hover:bg-card focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
								>
									<div class="mb-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
										<Icon name={reference.kind === 'note' ? 'write' : 'journal'} size={13} />
										<span class="text-fg-muted">
											{t('contact.mentions.in')}
											<span class="font-medium text-fg">{reference.sourceName}</span>’s
											{reference.kind === 'note'
												? t('contact.mentions.notes')
												: t('contact.mentions.journal')}
											{#if reference.author}· {t('contact.mentions.by', { author: reference.author })}{/if}
										</span>
										{#if reference.visibility === 'private'}
											<span class="ml-auto inline-flex items-center gap-1 text-xs text-fg-subtle">
												<Icon name="private" size={11} />{t('common.privateInline')}
											</span>
										{/if}
										<span
											class="text-xs text-fg-subtle"
											class:ml-auto={reference.visibility !== 'private'}
										>
											{dayLabel(i18n, reference.day)}
										</span>
									</div>
									{#if reference.title}
										<p class="text-sm font-medium text-fg">{reference.title}</p>
									{/if}
									{#if reference.snippet}
										<p class="text-sm text-fg-muted">{reference.snippet}</p>
									{/if}
								</a>
							</li>
						{/each}
					</ul>
				{:else}
					<p class="text-sm text-fg-subtle">
						{t('contact.mentions.none', { name: c.displayName })}
					</p>
				{/if}
			</div>
		</div>
	</div>
</main>

<!--
	Lightbox (docs/02 §2.14). One overlay for whichever photo is open: a dimmed backdrop that
	closes on click, the picture, and the few things you might do with it. Only the person who
	added a photo can caption, re-scope or remove it; anyone who can see it can make it the
	avatar. Escape closes, the arrow keys walk the grid.
-->
{#if openedPhoto}
	<div class="fixed inset-0 z-50 flex flex-col" role="dialog" aria-modal="true" aria-label={t('contact.photos.dialog')} data-testid="photo-lightbox">
		<button
			type="button"
			class="absolute inset-0 bg-bg-sunken/90 backdrop-blur-sm"
			aria-label={t('contact.photos.closePhoto')}
			onclick={() => (openPhoto = null)}
		></button>

		<div class="relative m-auto flex w-full max-w-3xl flex-col gap-3 rounded-app bg-card p-4 shadow-pop">
			<div class="flex items-center justify-between gap-3">
				<p class="truncate text-sm text-fg">
					{openedPhoto.caption ?? t('contact.photos.noCaption')}
					{#if openedPhoto.visibility === 'private'}
						<span class="ml-2 inline-flex items-center gap-1 text-xs text-fg-subtle">
							<Icon name="private" size={11} />{t('common.privateInline')}
						</span>
					{/if}
				</p>
				<Button variant="ghost" size="sm" onclick={() => (openPhoto = null)}>{t('common.close')}</Button>
			</div>

			<img
				src={mediaUrl(openedPhoto.id)}
				alt={openedPhoto.caption ?? t('contact.photos.of', { name: c.displayName })}
				class="max-h-[65vh] w-full rounded-control bg-bg-sunken object-contain"
			/>

			<div class="flex flex-wrap items-center gap-2">
				<form method="POST" action="?/usePhotoAsAvatar" class="contents">
					<input type="hidden" name="photoId" value={openedPhoto.id} />
					<Button variant="secondary" size="sm" disabled={openedPhoto.isAvatar}>
						{openedPhoto.isAvatar ? t('contact.photos.currentPhoto') : t('contact.photos.useAsPhoto')}
					</Button>
				</form>

				{#if openedPhoto.createdBy === data.viewerId}
					<form method="POST" action="?/captionPhoto" class="flex flex-1 items-center gap-2">
						<input type="hidden" name="photoId" value={openedPhoto.id} />
						<input
							name="caption"
							value={openedPhoto.caption ?? ''}
							placeholder={t('contact.photos.captionPlaceholder')}
							aria-label={t('contact.photos.caption')}
							class="min-w-40 flex-1 {INPUT}"
						/>
						<Button variant="secondary" size="sm">{t('common.save')}</Button>
					</form>
					<form method="POST" action="?/setPhotoVisibility" class="contents">
						<input type="hidden" name="photoId" value={openedPhoto.id} />
						<input
							type="hidden"
							name="visibility"
							value={openedPhoto.visibility === 'private' ? 'shared' : 'private'}
						/>
						<Button variant="ghost" size="sm">
							{openedPhoto.visibility === 'private'
								? t('contact.photos.share')
								: t('contact.photos.makePrivate')}
						</Button>
					</form>
					<form method="POST" action="?/removePhoto" class="contents">
						<input type="hidden" name="photoId" value={openedPhoto.id} />
						<Button variant="danger" size="sm">{t('common.remove')}</Button>
					</form>
				{/if}
			</div>
		</div>
	</div>
{/if}
