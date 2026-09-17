<script lang="ts">
	import { circleNameKey } from '$lib/circles/name-key';
	import AvatarUploader from '$lib/components/AvatarUploader.svelte';
	import Button from '$lib/components/Button.svelte';
	import KinSuggestions from '$lib/components/KinSuggestions.svelte';
	import DateField from '$lib/components/DateField.svelte';
	import RelationshipMap from '$lib/components/graph/RelationshipMap.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import MentionTextarea from '$lib/components/MentionTextarea.svelte';
	import InlineEdit from '$lib/components/InlineEdit.svelte';
	import PersonSearchSelect from '$lib/components/PersonSearchSelect.svelte';
	import Section from '$lib/components/Section.svelte';
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import { processImage } from '$lib/image/process-image';
	import { mediaUrl, thumbnailUrl } from '$lib/media/urls';
	import RemoveButton from '$lib/components/RemoveButton.svelte';
	import { useRemovals } from '$lib/undo/context.svelte';
	import { removalKey, type RemovalKind } from '$lib/undo/keys';
	import { savedEnhance } from '$lib/undo/saved';
	import { trackPending } from '$lib/sync/pending';
	import { usePending } from '$lib/sync/context.svelte';
	import StoryTimeline from '$lib/components/StoryTimeline.svelte';
	import { dayLabel } from '$lib/dates/labels';
	import { useI18n } from '$lib/i18n/context.svelte';
	import { hasMessage } from '$lib/i18n/translate';
	import {
		relationshipRowLabel,
		relationshipStatusLabel,
		relationshipTypeLabel
	} from '$lib/relationships/labels';
	import { contactSectionPath, sectionAnchor } from '$lib/contacts/sections';
	import { directClaimLabel, kinshipLabel } from '$lib/kinship/labels';
	import { claimEndpoints, directClaimFor } from '$lib/kinship/claims';
	import { accentChipStyle, accentDotStyle, categoryVar } from '$lib/design/tokens';
	import { RELATIONSHIP_STATUSES } from '$lib/relationships/status';
	import { isChoiceOfLink, relationshipTypeOptions } from '$lib/relationships/type-options';
	import { sinceDateFromBirth } from '$lib/relationships/since';
	import type { SelectablePerson } from '$lib/people/select';
	import { KIND_PRESENTATION } from '$lib/interactions/kinds';
	import { untrack } from 'svelte';
	import type { ActionData, PageData } from './$types';

	/*
	 * A person's page (docs/05 §5.5): what they are to the household in one column, who they are
	 * in a quieter one beside it. The main column is a stack of cards in a fixed order —
	 * relationships, story, notes, photos, mentions — rather than tabs: the two that were read
	 * most were behind a click, and the four profile cards shouted louder than either.
	 *
	 * Every form is closed until asked for, so the page reads as a person rather than as a stack
	 * of empty inputs. Below `lg` the columns stack, main column first.
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

	let relateOpen = $state(untrack(() => data.relateTo) !== null);
	// The hero's "Log contact" opens the story section's form; the section owns the state.
	let logOpen = $state(false);

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

	// The hero's second action opens the story card's own form, wherever the reader is.
	function logContact() {
		logOpen = true;
	}

	// One map node per connected person (a person may hold several relationship types; the
	// map shows them once, keeping the first label). The face comes from the graph slice,
	// which already carries every visible person's avatar — so the first paint wears the same
	// faces the interactive map does, rather than swapping initials for photos as it loads.
	const photoById = $derived(
		new Map(data.graph.nodes.map((node) => [node.id, node.avatarPhotoId ?? null]))
	);
	const egoNodes = $derived.by(() => {
		const seen = new Set<string>();
		const out: {
			id: string;
			name: string;
			label: string;
			category: string;
			avatarPhotoId: string | null;
		}[] = [];
		for (const r of data.relationships) {
			if (seen.has(r.otherContactId)) continue;
			seen.add(r.otherContactId);
			out.push({
				id: r.otherContactId,
				name: r.otherDisplayName,
				label: relationshipRowLabel(t, r),
				category: r.category,
				avatarPhotoId: photoById.get(r.otherContactId) ?? null
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

	/** A birthday from the profile counts: the row holds something even with no date rows. */
	const hasDates = $derived(
		visibleDates.length > 0 || data.derivedBirthday !== null || data.estimatedBirthYear !== null
	);

	/** What a folded profile row is worth reading for: the values themselves, not just a count. */
	const circleSummary = $derived(visibleCircles.map((circle) => circle.name).join(', '));
	const tagSummary = $derived(visibleTags.map((tag) => tag.name).join(', '));

	// Saving through `enhance` keeps the page — and with it any open undo window — alive, so
	// each section closes itself here instead of on the reload a redirect used to cause.
	// Logging a touchpoint is the exception: the story timeline owns its paged list, and only
	// a fresh page gives it the new item, so that form still posts natively.
	let openSection = $state({ contact: false, dates: false, circles: false, tags: false, note: false });
	// The note's audience narrows whom the @-picker offers (docs/02 §2.20.1).
	let noteVisibility = $state<'shared' | 'private'>('shared');
	type SectionName = keyof typeof openSection;
	/*
	 * Joining a circle is one free-text field, so the role suggestions follow what is typed:
	 * the roles that very circle already uses, matched on its name regardless of capitalisation.
	 */
	let joiningCircleName = $state('');
	const joiningCircleRoles = $derived(data.circleRolesByName[circleNameKey(joiningCircleName)] ?? []);
	// The form is unmounted when the section closes, so the typed name would outlive its own
	// input and a reopened editor would offer the previous circle's roles beside an empty field.
	$effect(() => {
		if (!openSection.circles) joiningCircleName = '';
	});
	const saved = (name: SectionName) =>
		savedEnhance(removals, t('components.saved'), () => (openSection[name] = false));
	// Relationships keep their own open state: the quick-add flow opens that section by URL.
	/*
	 * The other end of a new relationship. Prefilled with whoever the page was opened for, and
	 * otherwise with your own person (docs/02 §2.1.3): "how is this person related to me" is
	 * the link a household records most, and it is still a default — the type is always chosen
	 * by hand before anything is saved.
	 */
	let relationshipTargetId = $state<string[]>(
		untrack(() => {
			if (data.relateTo) return [data.relateTo];
			const self = data.user.selfContactId;
			return self && self !== data.contact.id ? [self] : [];
		})
	);
	/*
	 * Changing a relationship reloads the person's graph, and on a household with many links
	 * that reload is slow enough to look like nothing happened. Every path that changes it —
	 * the add form, a correction, a removal once its undo window has passed — is reported to
	 * the shell, which shows one activity bar for the whole app (docs/05 §5.7). Nothing on this
	 * page moves while it runs.
	 */
	const graphPending = usePending();
	const savedRelationship = trackPending(
		graphPending,
		savedEnhance(removals, t('components.saved'), () => {
			relateOpen = false;
			relationshipTargetId = [];
		})
	);
	/*
	 * The specifics of the link being entered, watched so the form can fill in what it already
	 * knows: a family link began on the younger one's birthday (docs/02 §2.4).
	 */
	const relationshipChoices = $derived(relationshipTypeOptions(data.relationshipTypes));
	/** Empty until the picker is touched, which means it stands on its first entry. */
	let relationshipChoice = $state('');
	/** Someone named through the picker itself is not in `otherContacts` yet (docs/02 §2.2.2). */
	let pickedTarget = $state<SelectablePerson | undefined>();
	const relationshipTarget = $derived.by(() => {
		const id = relationshipTargetId[0];
		if (!id) return null;
		if (pickedTarget?.id === id) return pickedTarget;
		return data.otherContacts.find((person) => person.id === id) ?? null;
	});
	const suggestedSince = $derived.by(() => {
		const chosen =
			relationshipChoices.find((option) => option.value === relationshipChoice) ??
			relationshipChoices[0];
		if (!chosen) return '';
		return sinceDateFromBirth(
			{ category: chosen.type.category, symmetric: chosen.type.symmetric, side: chosen.side },
			data.contact,
			relationshipTarget
		);
	});
	/*
	 * "How are we connected?" — the picker is on the page rather than in the canvas: the map
	 * holds two hops, the household holds the answer, and the app's own person picker is what
	 * every other "which person?" question on this page uses.
	 */
	let tracingPath = $state(false);
	let pathTargetId = $state<string[]>([]);
	const pathTarget = $derived(pathTargetId[0] ?? null);

	/** Which relationship has its details open for correction; one at a time. */
	let editingRelationship = $state<string | null>(null);
	const savedRelationshipEdit = trackPending(
		graphPending,
		savedEnhance(removals, t('components.saved'), () => (editingRelationship = null))
	);
	const savedArchive = savedEnhance(removals, t('components.saved'));
	/** Archived or not decides the action, the wording and the marker; asked once. */
	const archived = $derived(c.archivedAt !== null);
	/** This record is the viewer's own person (docs/02 §2.1.3). */
	const isSelf = $derived(data.user.selfContactId === c.id);
	/** The second click that a deletion asks for; there is no undo after it. */
	let confirmingDelete = $state(false);
	/** Whether the merge picker is open; the survivor is always this page's person. */
	let merging = $state(false);
	let mergeTargetId = $state<string[]>([]);
	let participantIds = $state<string[]>([]);
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
				{#if isSelf}
					<span
						data-testid="self-marker"
						class="inline-flex items-center gap-1 rounded-full bg-primary-soft px-2 py-0.5 text-primary"
						title={t('contact.self.badgeHint')}
					>
						<Icon name="self" size={11} />{t('common.you')}
					</span>
				{/if}
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

	<div class="grid gap-6 lg:grid-cols-[minmax(0,1fr)_17rem] lg:items-start">
		<!--
			Who they are, quietly. Second everywhere now, and one card rather than four: contact
			details, dates, circles and tags are looked *up*, not read, and four shadowed cards
			made them shout over the story (docs/05 §5.5).
		-->
		<div class="order-2 flex min-w-0 flex-col gap-4 lg:sticky lg:top-4">
			<section class="flex flex-col rounded-app bg-card p-4 shadow-card">
				<h2 class="mb-1 text-sm font-semibold text-fg">{t('contact.section.profile')}</h2>
				<Section as="row" title={t('contact.section.contact')} count={visibleFields.length} startOpen={visibleFields.length > 0} addLabel={t('common.add')} error={form?.fieldError ?? null} bind:open={openSection.contact}>
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

				<Section as="row" title={t('contact.section.dates')} count={visibleDates.length} startOpen={hasDates} addLabel={t('common.add')} error={form?.dateError ?? null} bind:open={openSection.dates}>
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
						<DateField name="date" required allowYearUnknown label={t('contact.day')} />
						<input name="label" placeholder={t('contact.dateNameForCustom')} class="w-full {INPUT}" />
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

				<Section as="row" title={t('contact.section.circles')} count={visibleCircles.length} summary={circleSummary} startOpen={visibleCircles.length > 0} addLabel={t('contact.join')} error={form?.circleError ?? null} bind:open={openSection.circles}>
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
							bind:value={joiningCircleName}
						/>
						<datalist id="circle-names">
							{#each data.circleNames as name (name)}<option value={name}></option>{/each}
						</datalist>
						<input
							name="role"
							list="circle-roles"
							placeholder={t('contact.roleOptional')}
							class="w-28 {INPUT}"
						/>
						<!-- The roles the circle being joined already uses; a new one is still free to type. -->
						<datalist id="circle-roles">
							{#each joiningCircleRoles as role (role)}<option value={role}></option>{/each}
						</datalist>
						<Button variant="primary" size="sm">{t('common.add')}</Button>
					</form>
				{/snippet}
			</Section>

				<Section as="row" title={t('contact.section.tags')} count={visibleTags.length} summary={tagSummary} startOpen={visibleTags.length > 0} addLabel={t('common.add')} error={form?.tagError ?? null} bind:open={openSection.tags}>
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

				<Section as="row" title={t('contact.section.howWeMet')} summary={metLine ?? undefined} startOpen={metLine !== null}>
					{#if metLine}
						<p class="font-serif text-[15px] leading-relaxed text-fg">{metLine}</p>
					{:else}
						<p class="text-sm text-fg-subtle">{t('contact.notRecorded')}</p>
					{/if}
				</Section>

				<!--
					The record-keeping actions live at the foot of the profile card, in one quiet
					stack: they are about the record rather than the person, and none of them is
					something anybody came here to do (docs/02 §2.2, §2.1.3).
				-->
				<div class="mt-3 flex flex-col gap-3 border-t border-border-subtle pt-3">
			<!--
				Rarely wanted, so it sits at the foot of the profile rather than beside Write:
				archiving takes someone out of the lists, it does not undo them (docs/02 §2.2).
			-->
			<!-- Which of these people you are (docs/02 §2.1.3); the same button lets go again. -->
			<form method="POST" action="?/setSelf">
				<Button variant="ghost" size="sm" icon="self">
					{isSelf ? t('contact.self.notMe') : t('contact.self.thisIsMe')}
				</Button>
				<p class="mt-1 text-xs text-fg-subtle">
					{isSelf ? t('contact.self.isMeHint') : t('contact.self.hint')}
				</p>
			</form>

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
							<label for="merge-target" class="flex flex-col gap-1">
								<span class="text-xs text-fg-muted">{t('contact.merge.who')}</span>
								<PersonSearchSelect
									id="merge-target"
									people={data.otherContacts}
									name="mergedId"
									bind:selectedIds={mergeTargetId}
									placeholder={t('contact.merge.choose')}
									required
								/>
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
			</section>

		</div>

		<!--
			What this person is to the household, in the order it is asked for: who they are
			connected to, what has happened, what was written down, what was taken, and where
			somebody else named them. Each card carries its own anchor, so a link can point at
			one (docs/05 §5.5).
		-->
		<div class="order-1 flex min-w-0 flex-col gap-4">
			<Section
					id={sectionAnchor('relationships')}
					title={t('contact.section.relationships')}
					count={visibleRelationships.length}
					addLabel={t('contact.relationships.add')}
					error={form?.error ?? null}
					bind:open={relateOpen}
				>
					{#snippet action()}
						{#if data.otherContacts.length > 0}
							<Button
								size="sm"
								icon="connectionPath"
								type="button"
								aria-expanded={tracingPath}
								onclick={() => (tracingPath = !tracingPath)}
							>
								{t('contact.relationships.howConnected')}
							</Button>
						{/if}
						<!--
							The on-demand review (docs/concepts/relationship-suggestions.md §6.5). Quiet on
							purpose: a ghost control, because asking what else might be true is never the
							thing this card is for. Nothing runs until it is pressed.
						-->
						<Button variant="ghost" size="sm" icon="search" href="/contacts/{c.id}?review#relationships">
							{data.review.open
								? t('contact.relationships.reviewAgain')
								: t('contact.relationships.review')}
						</Button>
						<!-- The way out of this person's two hops and into the household (docs/05 §5.5).
						     A button, not a 12px text link: it is the second thing this card offers. -->
						<Button size="sm" icon="graph" href="/graph?center={c.id}">
							{t('graph.openInGraph')}
						</Button>
					{/snippet}

					<!--
						"How are we connected?" is a question this card cannot answer: it holds two hops
						of the household and the chain usually runs further. So it asks who, and hands
						both ends to the explorer, which holds the whole graph (docs/05 §5.5).
					-->
					{#if tracingPath}
						<div class="mb-3 flex flex-wrap items-end gap-3 rounded-control bg-bg-sunken p-3">
							<label for="path-target" class="flex min-w-48 flex-1 flex-col gap-1 text-sm">
								<span class="text-fg-muted">
									{t('contact.relationships.howConnectedTo', { name: c.displayName })}
								</span>
								<PersonSearchSelect
									id="path-target"
									people={data.otherContacts}
									name="pathTarget"
									bind:selectedIds={pathTargetId}
								/>
							</label>
							<Button
								variant="primary"
								size="sm"
								icon="connectionPath"
								href={pathTarget ? `/graph?center=${c.id}&path=${pathTarget}` : undefined}
								disabled={!pathTarget}
							>
								{t('contact.relationships.tracePath')}
							</Button>
						</div>
					{/if}

					{#if visibleRelationships.length > 0}
						<!--
							The map first, the list under it: who this person is connected to is a shape
							before it is twelve rows, and the rows are what you come back to in order to
							correct one (docs/05 §5.5). It draws as plain SVG and becomes the interactive
							explorer once the engine has loaded.
						-->
						{#if egoNodes.length > 0}
							<div class="mb-3">
								<!--
									Keyed on the person: opening a profile from the map's peek panel is a
									navigation within this same route, so without a remount the explorer would
									keep the previous person's graph — and its open panel — over the new page.
								-->
								{#key c.id}
									<RelationshipMap
										centerId={c.id}
										centerName={c.displayName}
										centerPhotoId={c.avatarPhotoId}
										graph={data.graph}
										nodes={egoNodes}
										fullGraphHref={(nodeId) => `/graph?center=${nodeId}`}
									/>
								{/key}
							</div>
						{/if}

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
												pending={graphPending}
												fields={{ relationshipId: rel.id }}
												label={t('contact.relationships.remove', { name: rel.otherDisplayName })}
												removed={t('contact.relationships.removed')}
											/>
										</div>
									</div>

									{#if editingRelationship === rel.id}
										<form
											method="POST"
											action="?/editRelationship"
											use:enhance={savedRelationshipEdit}
											class="flex flex-wrap items-end gap-2 pl-5"
										>
											<input type="hidden" name="relationshipId" value={rel.id} />
											<label class="flex flex-col gap-1">
												<span class="text-xs text-fg-muted">{t('contact.relationships.typeLabel')}</span>
												<!-- Both sides again, so a partner who became a spouse — or a generation
												     entered the wrong way round — is one pick, not a re-entry (docs/02 §2.4). -->
												<select name="typeChoice" class={INPUT}>
													{#each relationshipTypeOptions(data.relationshipTypes) as option (option.value)}
														<option
															value={option.value}
															selected={isChoiceOfLink(option, rel)}
														>
															{relationshipTypeLabel(t, option.type, option.side)}
														</option>
													{/each}
												</select>
											</label>
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
												<DateField
													name="sinceDate"
													value={rel.sinceDate ?? ''}
													label={t('contact.relationships.sinceLabel')}
												/>
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
							<KinSuggestions suggestions={data.proposals} propose={data.proposeFor} />
						</div>
					{/if}

					<!--
						The on-demand review (docs/concepts/relationship-suggestions.md §6.5). Every
						other suggestion in Stella lives for one page load after a write; this is the
						control that asks the same rules what stands around this person *now*, which
						is the only way a household ever sees what follows from links entered years
						ago. It runs nothing until it is pressed.
					-->
					{#if data.review.open}
						<div class="mt-4 flex flex-col gap-3 rounded-md border border-border-subtle bg-bg-sunken p-3" data-testid="kin-review">
							<div class="flex flex-wrap items-center gap-x-2 gap-y-1">
								<h3 class="text-xs font-medium uppercase tracking-wide text-fg-subtle">
									{t('contact.relationships.reviewHeading')}
								</h3>
								<span class="text-xs text-fg-subtle">
									{t('contact.relationships.reviewOpenCount', {
										count: data.review.suggestions.filter((s) => s.dismissed === null).length
									})}
								</span>
							</div>
							{#if data.review.suggestions.length === 0}
								<p class="text-sm text-fg-muted">
									{t('contact.relationships.reviewNothing', { name: c.displayName })}
								</p>
							{:else}
								<KinSuggestions
									suggestions={data.review.suggestions}
									nameOfMember={(id) => data.review.memberNames[id] ?? null}
								/>
							{/if}
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
									<!--
										A step term is only as much as Stella can see: the link runs through a
										partner and no direct one is on record. The household may well mean more
										than that, and only they can say so — hence the one-tap correction, which
										is the single way an inference here ever becomes something entered.
									-->
									{@const claim = directClaimFor(kin.term)}
									<li class="flex flex-wrap items-center gap-x-3 gap-y-1 py-2 text-sm">
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
										{#if claim}
											{@const ends = claimEndpoints(claim, c.id, kin.personId)}
											<form method="POST" action="?/addProposedRelationship" class="ml-auto shrink-0">
												<input type="hidden" name="fromId" value={ends.fromId} />
												<input type="hidden" name="toId" value={ends.toId} />
												<input type="hidden" name="typeId" value={claim.typeKey} />
												<Button variant="ghost" size="sm">{directClaimLabel(t, claim)}</Button>
											</form>
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
									<!-- Both directions of an asymmetric type, so "is a child of" needs no
										 detour via the other profile (docs/02 §2.4). -->
									<!-- Read, not bound: binding would hand the select a value of its own before
										 anybody has chosen, and an unmatched one deselects every option — the form
										 would then post no type at all. -->
									<select
										name="typeChoice"
										onchange={(event) => (relationshipChoice = event.currentTarget.value)}
										class={INPUT}
									>
										{#each relationshipChoices as option (option.value)}
											<option value={option.value}>
												{relationshipTypeLabel(t, option.type, option.side)}
											</option>
										{/each}
									</select>
								</label>
								<label for="relationship-target" class="flex flex-1 flex-col gap-1 text-sm">
									<span class="text-fg-muted">{t('contact.relationships.person')}</span>
									<PersonSearchSelect
										id="relationship-target"
										people={data.otherContacts}
										name="targetId"
										bind:selectedIds={relationshipTargetId}
										onPick={(person) => (pickedTarget = person)}
										allowCreate
									/>
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
									<!-- Keyed: the field owns its segments once it is on screen, so a new
										 suggestion arrives as a fresh field rather than as a silent overwrite. -->
									{#key suggestedSince}
										<DateField
											name="sinceDate"
											value={suggestedSince}
											label={t('contact.relationships.sinceLabel')}
										/>
									{/key}
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

			<Section
					id={sectionAnchor('story')}
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
								<DateField name="happenedAt" value={today} required label={t('contact.day')} />
								<input name="title" placeholder={t('contact.interaction.titlePlaceholder')} class="min-w-48 flex-1 {INPUT}" />
							</div>
							<textarea name="description" rows="2" placeholder={t('contact.interaction.detailsPlaceholder')} class={INPUT}
							></textarea>
							{#if data.otherContacts.length > 0}
								<label for="interaction-participants" class="flex flex-col gap-1 text-sm text-fg-muted">
									{t('contact.interaction.whoElse')}
									<PersonSearchSelect
										id="interaction-participants"
										people={data.otherContacts}
										name="participants"
										bind:selectedIds={participantIds}
										multiple
										allowCreate
									/>
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

			<Section
					id={sectionAnchor('notes')}
					title={t('contact.section.notes')}
					count={data.notes.length}
					addLabel={t('contact.notes.add')}
					error={form?.noteError ?? null}
					bind:open={openSection.note}
				>
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

			<Section
					id={sectionAnchor('photos')}
					title={t('contact.section.photos')}
					count={data.gallery.length}
					addLabel={t('contact.photos.add')}
					error={form?.photoError ?? uploadError}
				>
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

			<!--
				Where somebody else names this person (docs/02 §2.20.1). Read-only: each item links
				to the person whose note or journal it is, because that is where it is written and
				edited. The list is already scoped to what this viewer may see.
			-->
			<Section
				id={sectionAnchor('mentions')}
				title={t('contact.section.mentions')}
				count={data.mentionedIn.length}
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
			</Section>
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
