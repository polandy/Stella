<script lang="ts">
	import type { Snippet } from 'svelte';
	import Icon from './Icon.svelte';
	import type { IconName } from './icons';

	/*
	 * The button family (docs/05 §5.7). Four variants, and each one means something:
	 *   primary    the one action a screen is for — at most one per view
	 *   secondary  a real action next to it, outlined so it reads as a control
	 *   ghost      a quiet action inside a list or a card header
	 *   danger     removes something
	 * Renders an `<a>` when `href` is set, so a link that looks like a button still behaves
	 * like a link. Inside a form the native submit behaviour is left alone.
	 */
	type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';

	interface Props {
		variant?: Variant;
		/** `sm` for controls inside rows and card headers, `md` for a screen's own actions. */
		size?: 'sm' | 'md';
		icon?: IconName;
		/** Renders as a link to this URL instead of a button. */
		href?: string;
		/** Accessible name — required when the button shows an icon and no text. */
		label?: string;
		disabled?: boolean;
		class?: string;
		children?: Snippet;
		[key: string]: unknown;
	}

	let {
		variant = 'secondary',
		size = 'md',
		icon,
		href,
		label,
		disabled = false,
		class: className = '',
		children,
		...rest
	}: Props = $props();

	const iconOnly = $derived(icon !== undefined && children === undefined);
	const iconSize = $derived(size === 'sm' ? 14 : 16);
</script>

{#snippet content()}
	{#if icon}<Icon name={icon} size={iconSize} />{/if}
	{@render children?.()}
{/snippet}

{#if href}
	<a
		{href}
		aria-label={label}
		class="btn {variant} {size} {className}"
		class:icon-only={iconOnly}
		{...rest}
	>
		{@render content()}
	</a>
{:else}
	<button
		{disabled}
		aria-label={label}
		class="btn {variant} {size} {className}"
		class:icon-only={iconOnly}
		{...rest}
	>
		{@render content()}
	</button>
{/if}

<style>
	.btn {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 0.375rem;
		border: 1px solid transparent;
		border-radius: var(--radius-control);
		font-weight: 600;
		line-height: 1.25rem;
		white-space: nowrap;
		text-decoration: none;
		cursor: pointer;
		transition:
			background-color 0.12s ease,
			border-color 0.12s ease,
			color 0.12s ease;
	}

	.sm {
		padding: 0.3125rem 0.625rem;
		font-size: 0.8125rem;
	}
	.md {
		padding: 0.4375rem 0.875rem;
		font-size: 0.875rem;
	}
	.sm.icon-only {
		padding: 0.375rem;
	}
	.md.icon-only {
		padding: 0.5rem;
	}

	.primary {
		background: var(--primary);
		color: var(--primary-fg);
	}
	.primary:hover:not(:disabled) {
		background: color-mix(in srgb, var(--primary) 88%, var(--fg));
	}

	.secondary {
		background: var(--card);
		border-color: var(--border);
		color: var(--fg);
		box-shadow: var(--shadow-card);
	}
	.secondary:hover:not(:disabled) {
		background: var(--card-hover);
	}

	.ghost {
		background: transparent;
		color: var(--fg-muted);
		font-weight: 500;
	}
	.ghost:hover:not(:disabled) {
		background: var(--bg-sunken);
		color: var(--fg);
	}

	.danger {
		background: transparent;
		color: var(--fg-subtle);
	}
	.danger:hover:not(:disabled) {
		background: color-mix(in srgb, var(--danger) 12%, transparent);
		color: var(--danger);
	}

	.btn:disabled {
		cursor: default;
		opacity: 0.45;
	}
</style>
