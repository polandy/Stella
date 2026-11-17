import type { Attachment } from 'svelte/attachments';

/**
 * Calls `onnear` when the element it is attached to comes within 600 px of the bottom of `root`
 * (the viewport when null) — the foot of a list that loads more by itself (docs/dev/02 §2.22.2,
 * §2.24.9). Attach a fresh one per page, `{@attach more && nearEnd(load, { page })}`: a new
 * observer reports at once, so a foot still in view after a short page asks for the next.
 */
export function nearEnd(
	onnear: () => void,
	{ root = null }: { root?: Element | null; page?: unknown } = {}
): Attachment<HTMLElement> {
	return (foot) => {
		const observer = new IntersectionObserver(
			([entry]) => {
				if (entry?.isIntersecting) onnear();
			},
			{ root, rootMargin: '0px 0px 600px 0px' }
		);
		observer.observe(foot);
		return () => observer.disconnect();
	};
}
