<script lang="ts">
	/*
	 * A compact ego network: the viewed contact at the centre, their directly connected
	 * people around a ring. Pure presentation over the relationships the page already
	 * loaded — no graph engine, no extra fetch. Nodes link to the connected contact.
	 * Category accents follow docs/05 §5.6.
	 */
	import { categoryDiscFill, categoryVar } from '$lib/design/tokens';
	import { thumbnailUrl } from '$lib/media/urls';
	import { useTranslate } from '$lib/i18n/context.svelte';
	import { RELATIONSHIP_CATEGORIES, type RelationshipCategory } from '$lib/relationships/categories';

	interface EgoNode {
		id: string;
		name: string;
		label: string;
		category: string;
		/** A face where there is one, so this reads like the interactive map it precedes. */
		avatarPhotoId?: string | null;
	}
	let {
		centerName,
		centerPhotoId = null,
		nodes,
		thumbnail = false
	}: {
		centerName: string;
		centerPhotoId?: string | null;
		nodes: EgoNode[];
		/**
		 * A picture of the map rather than the map: no names, no links, no frame of its own — the
		 * phone's preview on a person's page, which is one button as a whole (docs/05 §5.5).
		 */
		thumbnail?: boolean;
	} = $props();

	// Clip ids are document-wide, and a page may hold the preview and the full drawing at once.
	const uid = $props.id();

	const t = useTranslate();

	const categoryOf = (category: string): RelationshipCategory =>
		(RELATIONSHIP_CATEGORIES as readonly string[]).includes(category)
			? (category as RelationshipCategory)
			: 'other';
	const categoryColor = (category: string): string => categoryVar(categoryOf(category));

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
				color: categoryColor(n.category),
				disc: categoryDiscFill(categoryOf(n.category))
			};
		})
	);
</script>

<svg
	class="ego"
	class:thumbnail
	viewBox="0 0 {W} {H}"
	preserveAspectRatio="xMidYMid meet"
	role={thumbnail ? undefined : 'group'}
	aria-hidden={thumbnail ? 'true' : undefined}
	aria-label={thumbnail ? undefined : t('contact.egoGraphLabel', { name: centerName })}
	style="font-size:{13 * fontScale}px"
>
	<!--
		One clip per disc: an SVG image is a rectangle until something rounds it, and the
		interactive map draws the same faces as circles (docs/05 §5.8).
	-->
	<defs>
		<clipPath id="{uid}-center"><circle cx={CX} cy={CY} r={CENTER_R} /></clipPath>
		{#each placed as n (n.id)}
			<clipPath id="{uid}-{n.id}"><circle cx={n.x} cy={n.y} r={NODE_R} /></clipPath>
		{/each}
	</defs>

	<!-- edges first so nodes sit on top -->
	{#each placed as n (n.id)}
		<line x1={CX} y1={CY} x2={n.x} y2={n.y} stroke="var(--border)" stroke-width="2" />
	{/each}

	<!-- centre -->
	<g class="center">
		<circle cx={CX} cy={CY} r={CENTER_R} fill="var(--primary)" />
		{#if centerPhotoId}
			<image
				href={thumbnailUrl(centerPhotoId)}
				x={CX - CENTER_R}
				y={CY - CENTER_R}
				width={CENTER_R * 2}
				height={CENTER_R * 2}
				preserveAspectRatio="xMidYMid slice"
				clip-path="url(#{uid}-center)"
			/>
		{:else}
			<text x={CX} y={CY} dy="0.35em" text-anchor="middle" fill="var(--primary-fg)" font-weight="700">
				{initials(centerName)}
			</text>
		{/if}
	</g>

	<!-- neighbours -->
	{#each placed as n (n.id)}
		{#if thumbnail}
			<circle cx={n.x} cy={n.y} r={NODE_R} fill={n.disc} stroke={n.color} stroke-width="3" />
			{#if n.avatarPhotoId}
				<image
					href={thumbnailUrl(n.avatarPhotoId)}
					x={n.x - NODE_R}
					y={n.y - NODE_R}
					width={NODE_R * 2}
					height={NODE_R * 2}
					preserveAspectRatio="xMidYMid slice"
					clip-path="url(#{uid}-{n.id})"
				/>
			{/if}
		{:else}
			<a href="/contacts/{n.id}" class="node" aria-label="{n.name} — {n.label}">
				<text x={n.x} y={n.y - NODE_R - 7} text-anchor="middle" fill="var(--fg-subtle)" class="role">
					{n.label}
				</text>
				<!-- The ring carries the category; the tint inside lets the initials read in --fg. -->
				<circle cx={n.x} cy={n.y} r={NODE_R} fill={n.disc} stroke={n.color} stroke-width="2" />
				<!-- Its own ring outside the disc, since a category can share the focus colour. -->
				<circle class="focus" cx={n.x} cy={n.y} r={NODE_R + 5} fill="none" />
				{#if n.avatarPhotoId}
					<image
						href={thumbnailUrl(n.avatarPhotoId)}
						x={n.x - NODE_R}
						y={n.y - NODE_R}
						width={NODE_R * 2}
						height={NODE_R * 2}
						preserveAspectRatio="xMidYMid slice"
						clip-path="url(#{uid}-{n.id})"
					/>
				{:else}
					<text x={n.x} y={n.y} dy="0.35em" text-anchor="middle" fill="var(--fg)" font-weight="600">
						{initials(n.name)}
					</text>
				{/if}
				<text x={n.x} y={n.y + NODE_R + 15} text-anchor="middle" fill="var(--fg)" class="who">
					{n.name}
				</text>
			</a>
		{/if}
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
	/* The preview fills the box its button gives it and wears that box's frame. */
	.ego.thumbnail {
		height: 100%;
		border: 0;
		background: none;
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
	.focus {
		stroke: none;
	}
	.node:focus-visible .focus {
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
