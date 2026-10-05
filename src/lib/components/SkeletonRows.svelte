<script lang="ts">
	/*
	 * Grey rows shaped like the rows a list is about to show — a round picture, a name, a line
	 * under it, a button — so the page says where the list will appear while it is still being
	 * read (docs/05 §5.7). Decorative: the shell's activity indicator says in words what is being
	 * waited for, so these are hidden from assistive technology. They pulse unless motion is
	 * reduced.
	 */
	let { count = 4, testid }: { count?: number; testid?: string } = $props();

	/** Names are not all one length; a list of equal bars reads as a table, not as people. */
	const NAME_WIDTHS = ['55%', '48%', '41%', '34%'];
</script>

<ul class="flex flex-col gap-3" aria-hidden="true" data-testid={testid}>
	{#each Array.from({ length: count }, (_, at) => at) as at (at)}
		<li class="flex items-center gap-3 rounded-app bg-card p-3 shadow-card">
			<span class="size-12 shrink-0 animate-pulse rounded-full bg-bg-sunken motion-reduce:animate-none"></span>
			<span class="flex min-w-0 flex-1 flex-col gap-2">
				<span
					class="h-3.5 animate-pulse rounded-control bg-bg-sunken motion-reduce:animate-none"
					style:width={NAME_WIDTHS[at % NAME_WIDTHS.length]}
				></span>
				<span class="h-3 w-1/3 animate-pulse rounded-control bg-bg-sunken motion-reduce:animate-none"></span>
			</span>
			<span class="h-8 w-18 shrink-0 animate-pulse rounded-control bg-bg-sunken motion-reduce:animate-none"></span>
		</li>
	{/each}
</ul>
