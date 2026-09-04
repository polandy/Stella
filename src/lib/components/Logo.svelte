<script lang="ts">
	interface Props {
		/** Pixel height of the mark (square). */
		size?: number;
		/** Show the "Stella" wordmark next to the mark. */
		wordmark?: boolean;
		/** Show the tagline under the wordmark (implies wordmark). */
		tagline?: boolean;
	}
	let { size = 32, wordmark = false, tagline = false }: Props = $props();

	const showWord = $derived(wordmark || tagline);
</script>

<span class="inline-flex items-center" style="gap:{Math.round(size * 0.42)}px">
	<!-- Mark: a small branching relationship graph. Colors follow the Catppuccin theme tokens. -->
	<svg
		viewBox="0 0 100 100"
		width={size}
		height={size}
		role="img"
		aria-label="Stella"
		style="flex:none;overflow:visible"
	>
		<g
			fill="none"
			stroke="var(--accent-teal)"
			stroke-width="3.6"
			stroke-linecap="round"
		>
			<path d="M18,62 Q30,60 42,50" />
			<path d="M42,50 Q54,44 66,60" />
			<path d="M66,60 Q76,54 84,40" />
			<path d="M42,50 Q42,34 48,22" />
		</g>
		<circle cx="18" cy="62" r="6.5" fill="var(--accent-mauve)" />
		<circle cx="48" cy="22" r="6.5" fill="var(--accent-yellow)" />
		<circle cx="66" cy="60" r="6.5" fill="var(--accent-blue)" />
		<circle cx="84" cy="40" r="6.5" fill="var(--accent-peach)" />
		<circle cx="42" cy="50" r="8.5" fill="var(--accent-pink)" />
	</svg>

	{#if showWord}
		<span class="flex flex-col justify-center leading-none">
			<span
				style="font-size:{Math.round(size * 0.92)}px;font-weight:600;letter-spacing:-0.025em;color:var(--fg)"
				>Stella</span
			>
			{#if tagline}
				<span
					class="uppercase"
					style="margin-top:{Math.round(size * 0.16)}px;font-size:{Math.max(9, Math.round(size * 0.24))}px;letter-spacing:0.24em;font-weight:600;color:var(--fg-muted)"
					>Your people, connected</span
				>
			{/if}
		</span>
	{/if}
</span>
