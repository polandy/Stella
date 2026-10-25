<script lang="ts">
	import Button from '$lib/components/ui/Button.svelte';
	import RemoveButton from '$lib/components/ui/RemoveButton.svelte';
	import { enhance } from '$app/forms';
	import { useI18n } from '$lib/i18n/context.svelte';
	import type { Housemate } from '$lib/people/home';
	import { useRemovals } from '$lib/undo/context.svelte';
	import type { SubmitFunction } from '@sveltejs/kit';
	import { INPUT } from './inputs';

	/*
	 * One home in the address editor (docs/02 §2.2, *A shared home*): its line for everyone who
	 * lives there, who they are — the × on a chip moves that person out — and *Moved out* for this
	 * person. A changed line asks once whom it is for, *Everyone here* preselected.
	 */
	let {
		home,
		person,
		offline,
		onclose
	}: {
		home: { id: string; label: string | null; value: string; livesWith: readonly Housemate[] };
		person: Housemate;
		offline: boolean;
		onclose: () => void;
	} = $props();

	const i18n = useI18n();
	const t = i18n.t;
	const removals = useRemovals();
	const uid = $props.id();

	// The fields start from the home as it reads; a save reloads the page, which reopens fresh.
	// svelte-ignore state_referenced_locally
	let label = $state(home.label ?? '');
	// svelte-ignore state_referenced_locally
	let value = $state(home.value);
	const changed = $derived(value.trim() !== home.value.trim());
	// The confirm only has a choice to offer when someone else lives here too.
	const asks = $derived(changed && home.livesWith.length > 0);
	const everyone = $derived(
		new Intl.ListFormat(i18n.intlLocale, { type: 'conjunction' }).format(
			[...home.livesWith, person].map((mate) => mate.displayName)
		)
	);

	const save: SubmitFunction = () => {
		return async ({ result, update }) => {
			if (result.type === 'success' && typeof result.data?.homeChangedFor === 'number') {
				removals.notify(t('contact.home.changedFor', { count: result.data.homeChangedFor }));
				await update();
				onclose();
				return;
			}
			await update({ reset: false });
		};
	};
</script>

<div class="flex flex-col gap-2" data-home={home.id}>
	<form
		id="{uid}-line"
		method="POST"
		action="?/changeHomeLine"
		use:enhance={save}
		class="flex flex-col gap-2"
	>
		<input type="hidden" name="homeId" value={home.id} />
		<div class="flex flex-wrap items-center gap-2">
			<input
				name="label"
				bind:value={label}
				placeholder={t('contact.labelOptional')}
				aria-label={t('contact.labelOptional')}
				class="max-w-56 {INPUT}"
			/>
			{#if home.livesWith.length > 0}
				<span class="text-xs text-fg-muted">
					{t('contact.home.shared', { count: home.livesWith.length + 1 })}
				</span>
			{/if}
		</div>
		<textarea
			name="value"
			required
			rows="2"
			bind:value
			aria-label={t('contact.fieldKind.address')}
			placeholder={t('contact.address.placeholder')}
			class={INPUT}></textarea>
		{#if asks}
			<fieldset class="flex flex-col gap-2 rounded-app bg-bg-sunken p-3 text-sm">
				<label class="flex items-start gap-2">
					<input type="radio" name="scope" value="everyone" checked class="mt-1" />
					<span>
						{t('contact.home.everyone', { names: everyone })}
						<span class="block text-xs text-fg-muted">{t('contact.home.everyoneHint')}</span>
					</span>
				</label>
				<label class="flex items-start gap-2">
					<input type="radio" name="scope" value="only" class="mt-1" />
					<span>
						{t('contact.home.only', { name: person.displayName })}
						<span class="block text-xs text-fg-muted">{t('contact.home.onlyHint')}</span>
					</span>
				</label>
			</fieldset>
		{/if}
	</form>
	{#if home.livesWith.length > 0}
		<ul class="flex flex-wrap gap-1.5" aria-label={t('contact.home.who')}>
			{#each home.livesWith as mate (mate.id)}
				<li
					class="flex items-center gap-1 rounded-full border border-border py-0.5 pr-1 pl-2.5 text-sm"
				>
					<a href="/contacts/{mate.id}" class="hover:underline">{mate.displayName}</a>
					<RemoveButton
						bare
						kind="home-member"
						id="{home.id}/{mate.id}"
						action="?/leaveHome"
						fields={{ homeId: home.id, contactId: mate.id }}
						label={t('contact.home.moveOut', { name: mate.displayName })}
						removed={t('contact.home.movedOutDone', { name: mate.displayName })}
					/>
				</li>
			{/each}
		</ul>
	{/if}
	<div class="flex flex-wrap items-center gap-2">
		<RemoveButton
			kind="home-member"
			id="{home.id}/{person.id}"
			action="?/leaveHome"
			fields={{ homeId: home.id }}
			spelled
			icon="signOut"
			label={t('contact.home.movedOut')}
			removed={t('contact.home.movedOutDone', { name: person.displayName })}
			class="mr-auto"
		/>
		<Button variant="primary" size="sm" form="{uid}-line" disabled={offline}>
			{t('common.save')}
		</Button>
	</div>
</div>
