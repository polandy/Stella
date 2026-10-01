<script lang="ts">
	/*
	 * The one way a form says what went wrong (docs/05 §5.7). An alert, so a screen reader
	 * hears the message the moment it appears instead of finding it by chance (WCAG 4.1.3,
	 * 3.3.1); with an `id`, so the field it is about can point at it with `aria-describedby`.
	 *
	 * `banner` is a tinted strip above a form: the words are written in `--fg` on `--danger-soft`,
	 * since `--danger` on its own tint drops below AA in Latte (docs/05 §5.6), and the red edge
	 * says "error" without relying on the words' colour. `inline` is a line under one field,
	 * written in `--danger` on the card or page it sits on.
	 *
	 * Renders nothing without a message, so a caller can always place it.
	 */
	interface Props {
		message: string | null | undefined;
		/** Referenced from the field's `aria-describedby`; omit where no single field is at fault. */
		id?: string;
		variant?: 'banner' | 'inline';
		/** `xs` for a line under a small control, such as a photo button. */
		size?: 'sm' | 'xs';
		class?: string;
		/** Anything else lands on the paragraph, e.g. a `data-testid`. */
		[attribute: string]: unknown;
	}
	let { message, id, variant = 'banner', size = 'sm', class: className = '', ...rest }: Props = $props();
</script>

{#if message}
	<p
		{id}
		role="alert"
		{...rest}
		class="{size === 'xs' ? 'text-xs' : 'text-sm'} {variant === 'banner'
			? 'rounded-control border-l-4 border-danger bg-danger-soft px-3 py-2 text-fg'
			: 'text-danger'} {className}"
	>
		{message}
	</p>
{/if}
