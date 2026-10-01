<script lang="ts">
	import { circleNameKey } from '$lib/circles/name-key';
	import Button from '$lib/components/Button.svelte';
	import KeptChip from '$lib/components/KeptChip.svelte';
	import RemoveButton from '$lib/components/RemoveButton.svelte';
	import Section from '$lib/components/Section.svelte';
	import { enhance } from '$app/forms';
	import { accentDotStyle } from '$lib/design/tokens';
	import { useI18n } from '$lib/i18n/context.svelte';
	import { keepable } from '$lib/pwa/keepable';
	import { isKept, type KeptOf } from '$lib/pwa/outbox';
	import { outbox } from '$lib/pwa/outbox.svelte';
	import { useRemovals } from '$lib/undo/context.svelte';
	import { removalKey } from '$lib/undo/keys';
	import { savedEnhance } from '$lib/undo/saved';
	import { INPUT } from './inputs';
	import type { PersonForm, PersonPageData } from './types';

	// The circles someone belongs to (docs/02 §2.7): a row of the person page's profile card.
	let { data, form }: { data: PersonPageData; form: PersonForm } = $props();

	const i18n = useI18n();
	const t = i18n.t;
	const c = $derived(data.contact);

	// A row on its way out (docs/02 §2.23) is gone from the list while its undo window is open,
	// and back in it the moment Undo is pressed. The counts follow, so a section never says two
	// tags over one chip.
	const removals = useRemovals();
	const visibleCircles = $derived(
		data.circles.filter((circle) => !removals.isPending(removalKey('membership', circle.membershipId)))
	);

	/** What a folded profile row is worth reading for: the values themselves, not just a count. */
	const circleSummary = $derived(visibleCircles.map((circle) => circle.name).join(', '));

	// Saving through `enhance` keeps the page — and with it any open undo window — alive, so
	// each section closes itself here instead of on the reload a redirect used to cause.
	let openSection = $state({ circles: false });
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
	/** What a form saved through the outbox does once Stella took it: say so, then `close`. */
	const savedThen = (close: () => void) => () => {
		removals.notify(t('components.saved'));
		close();
	};
	/*
	 * Tags and circles added here while Stella was out of reach: kept on the device and shown as
	 * dashed chips beside the real ones until they are sent (docs/02 §2.18).
	 */
	const keptCircles = $derived(
		outbox.mine.filter(
			(item): item is KeptOf<'circle.join'> =>
				isKept(item, 'circle.join') && item.command.payload.contactId === c.id
		)
	);
	const circleForm = $derived(
		keepable(
			{
				toCommand: (form, id) => {
					const circleName = String(form.get('circleName') ?? '').trim();
					if (!circleName) return null;
					const role = String(form.get('role') ?? '').trim();
					return {
						id,
						type: 'circle.join',
						payload: { contactId: c.id, circleName, role: role || null },
						issuedAt: Date.now()
					};
				},
				about: c.displayName,
				errorKey: 'circleError',
				onApplied: savedThen(() => (openSection.circles = false)),
				onKept: () => (openSection.circles = false)
			},
			saved('circles')
		)
	);
</script>

	<Section as="row" title={t('contact.section.circles')} count={visibleCircles.length} summary={circleSummary} startOpen={visibleCircles.length > 0} addLabel={t('contact.join')} error={form?.circleError ?? null} bind:open={openSection.circles}>
	{#snippet action()}
		<a href="/circles" class="text-xs text-link hover:underline">{t('contact.allCircles')}</a>
	{/snippet}

	{#if visibleCircles.length || keptCircles.length}
		<ul class="flex flex-wrap gap-1.5">
			{#each keptCircles as item (item.command.id)}
				<KeptChip {item} label={item.command.payload.role ? `${item.command.payload.circleName} · ${item.command.payload.role}` : item.command.payload.circleName} />
			{/each}
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
		<form method="POST" action="?/joinCircle" use:enhance={circleForm} class="flex flex-wrap items-end gap-2">
			<input
				name="circleName"
				list="circle-names"
				placeholder={t('contact.joinOrCreate')}
				aria-label={t('contact.joinOrCreate')}
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
				aria-label={t('contact.roleOptional')}
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
