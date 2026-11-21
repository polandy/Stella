<script lang="ts">
	import { categoryVar } from '#lib/design/tokens.js';
	import { useTranslate } from '#lib/i18n/context.svelte.js';
	import { PARENT_KINDS } from '#lib/relationships/parent-kinds.js';

	/*
	 * Under the Family filter: how a parent line's stroke tells its kind, as the canvas draws it
	 * (docs/dev/05 §5.8). A key, not a switch; each line's name says its kind too.
	 */
	const t = useTranslate();
	const family = categoryVar('family');
	const dashes = { biological: '', adoptive: '', foster: '9 3 2 3', step: '4 4' } as const;
</script>

<div role="none" class="grid grid-cols-2 gap-x-3 gap-y-1 px-2.5 py-1">
	<span class="col-span-2 text-[11px] text-fg-subtle">{t('graph.parentKinds')}</span>
	{#each PARENT_KINDS as kind (kind)}
		<span class="flex items-center gap-2 text-[12px] text-fg-muted">
			<svg viewBox="0 0 24 8" class="h-2 w-6 shrink-0" aria-hidden="true">
				{#if kind === 'adoptive'}
					<path d="M1 4H23" stroke={family} stroke-width="5" />
					<path d="M1 4H23" stroke="var(--card)" stroke-width="1.8" />
				{:else}
					<path
						d="M1 4H23"
						stroke={family}
						stroke-width="2"
						stroke-dasharray={dashes[kind] || undefined}
					/>
				{/if}
			</svg>
			{t(`relationships.parentKind.${kind}`)}
		</span>
	{/each}
</div>
