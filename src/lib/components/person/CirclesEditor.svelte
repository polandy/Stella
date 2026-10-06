<script lang="ts">
	import { circleNameKey } from '$lib/circles/name-key';
	import Button from '$lib/components/Button.svelte';
	import FormError from '$lib/components/FormError.svelte';
	import RemoveButton from '$lib/components/RemoveButton.svelte';
	import { enhance } from '$app/forms';
	import { accentDotStyle } from '$lib/design/tokens';
	import { useI18n } from '$lib/i18n/context.svelte';
	import { keepable } from '$lib/pwa/keepable';
	import { useRemovals } from '$lib/undo/context.svelte';
	import { removalKey } from '$lib/undo/keys';
	import { savedEnhance } from '$lib/undo/saved';
	import { onMount } from 'svelte';
	import { INPUT } from './inputs';
	import type { PersonForm, PersonPageData } from './types';

	/*
	 * The circles someone belongs to, edited under their chips (docs/02 §2.7): each membership
	 * with its role, changed in place, and *Leave*; then the form that joins one — or creates it.
	 * The chips above stay links to the circle; this is where they are changed.
	 */
	let { data, form, onclose }: { data: PersonPageData; form: PersonForm; onclose: () => void } =
		$props();

	const i18n = useI18n();
	const t = i18n.t;
	const c = $derived(data.contact);
	const uid = $props.id();

	const removals = useRemovals();
	const visibleCircles = $derived(
		data.circles.filter(
			(circle) => !removals.isPending(removalKey('membership', circle.membershipId))
		)
	);

	/*
	 * Joining a circle is one free-text field, so the role suggestions follow what is typed:
	 * the roles that very circle already uses, matched on its name regardless of capitalisation.
	 */
	let joiningCircleName = $state('');
	const joiningCircleRoles = $derived(
		data.circleRolesByName[circleNameKey(joiningCircleName)] ?? []
	);

	const saved = savedEnhance(removals, t('components.saved'));
	const joined = savedEnhance(removals, t('components.saved'), () => onclose());
	const circleForm = $derived(
		keepable(
			{
				toCommand: (formData, id) => {
					const circleName = String(formData.get('circleName') ?? '').trim();
					if (!circleName) return null;
					const role = String(formData.get('role') ?? '').trim();
					return {
						id,
						type: 'circle.join',
						payload: { contactId: c.id, circleName, role: role || null },
						issuedAt: Date.now()
					};
				},
				about: c.displayName,
				errorKey: 'circleError',
				onApplied: () => {
					removals.notify(t('components.saved'));
					onclose();
				},
				onKept: () => onclose()
			},
			joined
		)
	);

	/** A changed role saves when the field is left or Enter is pressed — no button per row. */
	function saveRole(event: Event) {
		(event.currentTarget as HTMLInputElement).form?.requestSubmit();
	}

	let frame = $state<HTMLDivElement>();
	onMount(() => frame?.querySelector<HTMLElement>('input[name="circleName"]')?.focus());

	function onKeydown(event: KeyboardEvent) {
		if (event.key !== 'Escape') return;
		event.preventDefault();
		onclose();
	}
</script>

<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<div
	bind:this={frame}
	role="group"
	aria-label={t('contact.section.circles')}
	onkeydown={onKeydown}
	class="mt-2 flex flex-col gap-3 rounded-control border border-primary bg-card p-3"
	data-fact-editor="circles"
>
	{#if visibleCircles.length > 0}
		<ul class="flex flex-col gap-1.5 text-sm">
			{#each visibleCircles as circle (circle.membershipId)}
				<li class="flex min-w-0 items-center gap-2">
					<span class="size-2 shrink-0 rounded-full" style={accentDotStyle(circle.color)}></span>
					<span class="min-w-0 flex-1 truncate text-fg">{circle.name}</span>
					<form method="POST" action="?/setCircleRole" use:enhance={saved} class="contents">
						<input type="hidden" name="circleId" value={circle.circleId} />
						<input
							name="role"
							value={circle.role ?? ''}
							list="{uid}-roles-{circle.circleId}"
							placeholder={t('contact.roleOptional')}
							aria-label={t('contact.circles.roleIn', { name: circle.name })}
							onchange={saveRole}
							class="w-36 py-1 {INPUT}"
						/>
						<datalist id="{uid}-roles-{circle.circleId}">
							{#each data.circleRolesByName[circleNameKey(circle.name)] ?? [] as role (role)}
								<option value={role}></option>
							{/each}
						</datalist>
					</form>
					<RemoveButton
						kind="membership"
						id={circle.membershipId}
						action="?/leaveCircle"
						fields={{ circleId: circle.circleId }}
						label={t('contact.leaveCircle', { name: circle.name })}
						removed={t('contact.leftCircle')}
					/>
				</li>
			{/each}
		</ul>
		<span class="text-xs font-medium text-fg-muted">{t('contact.circles.join')}</span>
	{/if}
	<form
		method="POST"
		action="?/joinCircle"
		use:enhance={circleForm}
		class="flex flex-wrap items-end gap-2"
		data-testid="join-circle"
	>
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
		<Button variant="primary" size="sm">{t('contact.join')}</Button>
	</form>
	<FormError message={form?.circleError} variant="inline" />
	<div class="flex flex-wrap items-center gap-2">
		<a href="/circles" class="text-xs text-link hover:underline">{t('contact.allCircles')}</a>
		<Button variant="ghost" size="sm" type="button" class="ml-auto" onclick={onclose}>
			{t('common.done')}
		</Button>
	</div>
</div>
