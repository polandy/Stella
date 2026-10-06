<script lang="ts">
	import { enhance } from '$app/forms';
	import type { SubmitFunction } from '@sveltejs/kit';
	import Avatar from '$lib/components/Avatar.svelte';
	import Button from '$lib/components/Button.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import LinkedNames from '$lib/components/LinkedNames.svelte';
	import { useTranslate } from '$lib/i18n/context.svelte';
	import type { Segment } from '$lib/i18n/linked';
	import type { SurnamePersonView } from './types';

	/*
	 * One proposed last name and everyone it is proposed for (docs/concepts/surnames.md §3.1).
	 * Each row says why; rows from a sure rule start ticked, a partner's or a child's name starts
	 * unticked. *Apply* gives the ticked people the name in one batch, with Undo. A row's menu
	 * holds *Not this name*, which the household keeps, and the lower-ranked names, if any.
	 */
	let {
		group,
		hidden,
		disabled,
		held
	}: {
		group: {
			name: string;
			rows: {
				person: SurnamePersonView;
				preTicked: boolean;
				reasons: Segment[][];
				alternatives: readonly string[];
			}[];
		};
		/** People whose batch is held or sent: they have left the list already. */
		hidden: ReadonlySet<string>;
		/** Out of reach: nothing can be sent, so nothing is offered. */
		disabled: boolean;
		/** The enhance of every form here that gives a name. */
		held: SubmitFunction;
	} = $props();

	const t = useTranslate();
	// Each row's tick, seeded from the rule's confidence; a tick is this screen's own state.
	// svelte-ignore state_referenced_locally
	let ticked = $state<Record<string, boolean>>(
		Object.fromEntries(group.rows.map((r) => [r.person.id, r.preTicked]))
	);
	const rows = $derived(group.rows.filter((r) => !hidden.has(r.person.id)));
	const chosen = $derived(rows.filter((r) => ticked[r.person.id]).map((r) => r.person.id));
</script>

{#if rows.length > 0}
	<section
		class="flex flex-col gap-2 rounded-app bg-card p-3 shadow-card"
		data-testid="last-name-group"
	>
		<header class="flex items-center gap-3">
			<h2 class="min-w-0 flex-1 truncate text-lg font-semibold text-fg">
				{group.name}
				<span class="text-sm font-normal text-fg-subtle tabular-nums">· {rows.length}</span>
			</h2>
			<form method="POST" action="?/setLastNames" use:enhance={held}>
				<input type="hidden" name="lastName" value={group.name} />
				{#each chosen as id (id)}<input type="hidden" name="contactId" value={id} />{/each}
				<Button variant="primary" size="sm" disabled={disabled || chosen.length === 0}>
					{t('surnames.applyTo', { count: chosen.length })}
				</Button>
			</form>
		</header>
		<ul class="flex flex-col">
			{#each rows as row (row.person.id)}
				<li class="flex items-start gap-3 rounded-app px-1 py-1.5">
					<label class="flex min-w-0 flex-1 items-start gap-3">
						<input
							type="checkbox"
							class="mt-2.5 size-5 shrink-0"
							bind:checked={ticked[row.person.id]}
						/>
						<Avatar
							id={row.person.id}
							name={row.person.displayName}
							avatarPhotoId={row.person.avatarPhotoId}
							size={32}
						/>
						<span class="min-w-0 flex-1">
							<span class="block truncate font-medium text-fg">
								{row.person.displayName}{#if row.person.isDeceased}<span
										class="text-xs font-normal text-fg-subtle"
									>
										· {t('surnames.deceased')}</span
									>{/if}
							</span>
							<span class="block text-xs text-fg-muted">
								{#each row.reasons as reason, index}{#if index > 0}{' · '}{/if}<LinkedNames
										segments={reason}
									/>{/each}
							</span>
						</span>
					</label>
					<details class="relative shrink-0">
						<summary
							class="grid size-8 cursor-pointer list-none place-items-center rounded-control text-fg-subtle hover:bg-card-hover"
							aria-label={t('surnames.rowMenu', { name: row.person.displayName })}
						>
							<Icon name="more" size={16} />
						</summary>
						<div
							class="absolute right-0 z-10 mt-1 flex w-56 flex-col gap-1 rounded-app border border-border bg-card p-1.5 shadow-pop"
						>
							{#each row.alternatives as alternative (alternative)}
								<form method="POST" action="?/setLastNames" use:enhance={held}>
									<input type="hidden" name="lastName" value={alternative} />
									<input type="hidden" name="contactId" value={row.person.id} />
									<Button variant="ghost" size="sm" class="w-full justify-start" {disabled}>
										{t('surnames.instead', { name: alternative })}
									</Button>
								</form>
							{/each}
							<form method="POST" action="?/dismissLastName" use:enhance>
								<input type="hidden" name="lastName" value={group.name} />
								<input type="hidden" name="contactId" value={row.person.id} />
								<Button variant="ghost" size="sm" class="w-full justify-start" {disabled}>
									{t('surnames.notThisName', { name: group.name })}
								</Button>
							</form>
						</div>
					</details>
				</li>
			{/each}
		</ul>
	</section>
{/if}
