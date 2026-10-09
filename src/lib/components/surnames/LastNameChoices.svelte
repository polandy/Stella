<script lang="ts">
	import { enhance } from '$app/forms';
	import type { SubmitFunction } from '@sveltejs/kit';
	import Avatar from '$lib/components/ui/Avatar.svelte';
	import LinkedNames from '$lib/components/people/LinkedNames.svelte';
	import { useTranslate } from '$lib/i18n/context.svelte';
	import type { Segment } from '$lib/i18n/linked';
	import type { LastNameAnswers } from '$lib/components/surnames/last-name-answers.svelte';
	import LastNameRowMenu from './LastNameRowMenu.svelte';
	import type { SurnamePersonView } from './types';

	/*
	 * *Choose one* (docs/02 §2.2.4.2): people whose sources disagree at the same
	 * confidence — two parents with different names. Each name is a chip and a tap gives that
	 * one; Stella never picks a winner for them. The row's menu says no to either name, or
	 * settles the person as having none.
	 */
	let {
		rows,
		hidden,
		disabled,
		held,
		answers
	}: {
		rows: { person: SurnamePersonView; options: { name: string; reasons: Segment[][] }[] }[];
		hidden: ReadonlySet<string>;
		disabled: boolean;
		held: SubmitFunction;
		answers: LastNameAnswers;
	} = $props();

	const t = useTranslate();
	const shown = $derived(rows.filter((r) => !hidden.has(r.person.id)));
</script>

{#if shown.length > 0}
	<section
		class="flex flex-col gap-2 rounded-app bg-card p-3 shadow-card"
		data-testid="last-name-choices"
	>
		<h2 class="text-lg font-semibold text-fg">
			{t('surnames.chooseOne')}
			<span class="text-sm font-normal text-fg-subtle tabular-nums">· {shown.length}</span>
		</h2>
		<ul class="flex flex-col gap-2">
			{#each shown as row (row.person.id)}
				<li class="flex items-start gap-3 px-1 py-1.5">
					<Avatar
						id={row.person.id}
						name={row.person.displayName}
						avatarPhotoId={row.person.avatarPhotoId}
						size={32}
					/>
					<div class="min-w-0 flex-1">
						<a href="/contacts/{row.person.id}" class="font-medium text-fg hover:underline"
							>{row.person.displayName}</a
						>
						{#if row.person.isDeceased}<span class="text-xs text-fg-subtle">
								· {t('surnames.deceased')}</span
							>{/if}
						<div class="mt-1 flex flex-wrap gap-2">
							{#each row.options as option (option.name)}
								<form method="POST" action="?/setLastNames" use:enhance={held}>
									<input type="hidden" name="lastName" value={option.name} />
									<input type="hidden" name="contactId" value={row.person.id} />
									<button
										class="min-h-9 rounded-full border border-border bg-bg px-3 text-sm font-medium text-fg hover:border-primary hover:text-primary disabled:opacity-50"
										{disabled}
									>
										{option.name}
									</button>
								</form>
							{/each}
						</div>
						<p class="mt-1 text-xs text-fg-muted">
							{#each row.options.flatMap((o) => o.reasons) as reason, index}{#if index > 0}{' · '}{/if}<LinkedNames
									segments={reason}
								/>{/each}
						</p>
					</div>
					<LastNameRowMenu
						person={row.person}
						declinable={row.options.map((o) => o.name)}
						{answers}
						{disabled}
					/>
				</li>
			{/each}
		</ul>
	</section>
{/if}
