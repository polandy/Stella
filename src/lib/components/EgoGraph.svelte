<script lang="ts">
	/*
	 * A compact ego network: the viewed contact at the centre, their directly connected
	 * people around a ring. Pure presentation over the relationships the page already
	 * loaded — no graph engine, no extra fetch. Nodes link to the connected contact.
	 * Category accents follow docs/05 §5.6.
	 */
	import {
		RELATIONSHIP_CATEGORIES,
		categoryVar,
		type RelationshipCategory
	} from '$lib/design/tokens';

	interface EgoNode {
		id: string;
		name: string;
		label: string;
		category: string;
	}
	let { centerName, nodes }: { centerName: string; nodes: EgoNode[] } = $props();

	const categoryColor = (category: string): string =>
		(RELATIONSHIP_CATEGORIES as readonly string[]).includes(category)
			? categoryVar(category as RelationshipCategory)
			: categoryVar('other');

	function initials(name: string): string {
		return name
			.split(/\s+/)
			.map((w) => w[0])
			.filter(Boolean)
			.slice(0, 2)
			.join('')
			.toUpperCase();
	}

	// Fixed geometry; the SVG scales to its container via viewBox.
	const W = 460;
	const CX = W / 2;
	const CENTER_R = 30;
	const NODE_R = 22;
	const RING = 120;
	// Taller when crowded so labels below the lowest nodes have room.
	const H = $derived(nodes.length > 6 ? 360 : 320);
	const CY = $derived(H / 2 - 6);
	const fontScale = $derived(nodes.length > 9 ? 0.85 : 1);

	// Place nodes on a ring starting at the top, going clockwise.
	const placed = $derived(
		nodes.map((n, i) => {
			const angle = -Math.PI / 2 + (i * 2 * Math.PI) / Math.max(nodes.length, 1);
			return {
				...n,
				x: CX + RING * Math.cos(angle),
				y: CY + RING * Math.sin(angle),
				color: categoryColor(n.category)
			};
		})
	);
</script>

<svg
	class="ego"
	viewBox="0 0 {W} {H}"
	preserveAspectRatio="xMidYMid meet"
	role="img"
	aria-label="Relationship network for {centerName}"
	style="font-size:{13 * fontScale}px"
>
	<!-- edges first so nodes sit on top -->
	{#each placed as n (n.id)}
		<line x1={CX} y1={CY} x2={n.x} y2={n.y} stroke="var(--border)" stroke-width="2" />
	{/each}

	<!-- centre -->
	<g class="center">
		<circle cx={CX} cy={CY} r={CENTER_R} fill="var(--primary)" />
		<text x={CX} y={CY} dy="0.35em" text-anchor="middle" fill="var(--primary-fg)" font-weight="700">
			{initials(centerName)}
		</text>
	</g>

	<!-- neighbours -->
	{#each placed as n (n.id)}
		<a href="/contacts/{n.id}" class="node" aria-label="{n.name} — {n.label}">
			<text x={n.x} y={n.y - NODE_R - 7} text-anchor="middle" fill="var(--fg-subtle)" class="role">
				{n.label}
			</text>
			<circle cx={n.x} cy={n.y} r={NODE_R} fill={n.color} />
			<text x={n.x} y={n.y} dy="0.35em" text-anchor="middle" fill="#fff" font-weight="600">
				{initials(n.name)}
			</text>
			<text x={n.x} y={n.y + NODE_R + 15} text-anchor="middle" fill="var(--fg)" class="who">
				{n.name}
			</text>
		</a>
	{/each}
</svg>

<style>
	.ego {
		display: block;
		width: 100%;
		height: auto;
		border: 1px solid var(--border);
		border-radius: var(--radius);
		background:
			radial-gradient(circle at 1px 1px, var(--border) 1px, transparent 0) 0 0 / 22px 22px,
			var(--card);
	}
	.node {
		cursor: pointer;
	}
	.node circle {
		transition: filter 0.15s ease;
	}
	.node:hover circle {
		filter: brightness(1.08);
	}
	.node:focus-visible {
		outline: none;
	}
	.node:focus-visible circle {
		stroke: var(--focus-ring);
		stroke-width: 3;
	}
	.role {
		font-size: 0.82em;
		font-weight: 600;
	}
	.who {
		font-size: 0.92em;
		font-weight: 500;
	}
	text {
		pointer-events: none;
	}
</style>
