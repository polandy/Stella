<script lang="ts">
	/*
	 * A picture of a person's map (docs/05 §5.5): the viewed contact at the centre, their
	 * directly connected people around them. Pure presentation over the relationships the page
	 * already loaded — no graph engine, no extra fetch — and drawn by the server, so the People
	 * card shows the shape at once and keeps it where the engine never arrives. It is a picture
	 * rather than the map: no links, hidden from a screen reader (the list beside it names and
	 * links everybody), one button as a whole in the card. Category accents follow docs/05 §5.6.
	 *
	 * Two shapes. `ring` is the phone's 100 px preview: a ring of faces, no names — at that size
	 * names would not read. `strip` is a wide card's 7.5 rem strip: a sideways fan with every
	 * first name (`stripFan`), drawn at its own size and centred, so a narrow card crops its ends
	 * rather than shrinking the names.
	 */
	import { categoryDiscFill, categoryVar } from '$lib/design/tokens';
	import { stripFan } from '$lib/graph/layout/strip-fan';
	import { thumbnailUrl } from '$lib/media/urls';
	import {
		RELATIONSHIP_CATEGORIES,
		type RelationshipCategory
	} from '$lib/relationships/categories';

	interface EgoNode {
		id: string;
		name: string;
		/** What the strip writes beside the face: the first name. */
		firstName: string;
		category: string;
		/** A face where there is one, so this reads like the interactive map it precedes. */
		avatarPhotoId?: string | null;
	}
	let {
		centerName,
		centerPhotoId = null,
		nodes,
		variant
	}: {
		centerName: string;
		centerPhotoId?: string | null;
		nodes: EgoNode[];
		variant: 'ring' | 'strip';
	} = $props();

	// Clip ids are document-wide, and a page holds the ring and the strip at once.
	const uid = $props.id();

	const categoryOf = (category: string): RelationshipCategory =>
		(RELATIONSHIP_CATEGORIES as readonly string[]).includes(category)
			? (category as RelationshipCategory)
			: 'other';

	function initials(name: string): string {
		return name
			.split(/\s+/)
			.map((w) => w[0])
			.filter(Boolean)
			.slice(0, 2)
			.join('')
			.toUpperCase();
	}

	// The ring's fixed geometry; that SVG scales to its box via viewBox.
	const RING_W = 460;
	const RING_CENTER_R = 30;
	const RING_NODE_R = 22;
	const RING = 120;
	const ringH = $derived(nodes.length > 6 ? 360 : 320);
	// The strip's: drawn at its own pixel size, faces small enough for two rows in 7.5 rem.
	const STRIP_CENTER_R = 16;
	const STRIP_NODE_R = 11;
	const fan = $derived(stripFan(nodes.length));

	const layout = $derived.by(() => {
		if (variant === 'strip') {
			return {
				width: fan.width,
				height: fan.height,
				center: { ...fan.center, r: STRIP_CENTER_R },
				nodeR: STRIP_NODE_R,
				labelY: (i: number) => fan.nodes[i].labelY,
				at: (i: number) => fan.nodes[i]
			};
		}
		const center = { x: RING_W / 2, y: ringH / 2 - 6, r: RING_CENTER_R };
		return {
			width: RING_W,
			height: ringH,
			center,
			nodeR: RING_NODE_R,
			labelY: () => null,
			// On a ring starting at the top, going clockwise.
			at: (i: number) => {
				const angle = -Math.PI / 2 + (i * 2 * Math.PI) / Math.max(nodes.length, 1);
				return { x: center.x + RING * Math.cos(angle), y: center.y + RING * Math.sin(angle) };
			}
		};
	});
	const placed = $derived(
		nodes.map((n, i) => ({
			...n,
			...layout.at(i),
			labelY: layout.labelY(i),
			color: categoryVar(categoryOf(n.category)),
			disc: categoryDiscFill(categoryOf(n.category))
		}))
	);
	const c = $derived(layout.center);
	const r = $derived(layout.nodeR);
</script>

<svg
	class="ego shape-{variant}"
	viewBox="0 0 {layout.width} {layout.height}"
	width={variant === 'strip' ? layout.width : undefined}
	height={variant === 'strip' ? layout.height : undefined}
	preserveAspectRatio="xMidYMid meet"
	aria-hidden="true"
>
	<!--
		One clip per disc: an SVG image is a rectangle until something rounds it, and the
		interactive map draws the same faces as circles (docs/05 §5.8).
	-->
	<defs>
		<clipPath id="{uid}-center"><circle cx={c.x} cy={c.y} r={c.r} /></clipPath>
		{#each placed as n (n.id)}
			<clipPath id="{uid}-{n.id}"><circle cx={n.x} cy={n.y} {r} /></clipPath>
		{/each}
	</defs>

	<!-- edges first so nodes sit on top -->
	{#each placed as n (n.id)}
		<line x1={c.x} y1={c.y} x2={n.x} y2={n.y} stroke="var(--border)" stroke-width="2" />
	{/each}

	<circle cx={c.x} cy={c.y} r={c.r} fill="var(--primary)" />
	{#if centerPhotoId}
		<image
			href={thumbnailUrl(centerPhotoId)}
			x={c.x - c.r}
			y={c.y - c.r}
			width={c.r * 2}
			height={c.r * 2}
			preserveAspectRatio="xMidYMid slice"
			clip-path="url(#{uid}-center)"
		/>
	{:else}
		<text
			x={c.x}
			y={c.y}
			dy="0.35em"
			text-anchor="middle"
			fill="var(--primary-fg)"
			font-weight="700"
			font-size={variant === 'strip' ? 12 : 13}
		>
			{initials(centerName)}
		</text>
	{/if}

	{#each placed as n (n.id)}
		<circle
			cx={n.x}
			cy={n.y}
			{r}
			fill={n.disc}
			stroke={n.color}
			stroke-width={variant === 'strip' ? 2 : 3}
		/>
		{#if n.avatarPhotoId}
			<image
				href={thumbnailUrl(n.avatarPhotoId)}
				x={n.x - r}
				y={n.y - r}
				width={r * 2}
				height={r * 2}
				preserveAspectRatio="xMidYMid slice"
				clip-path="url(#{uid}-{n.id})"
			/>
		{/if}
		{#if n.labelY !== null}
			<!-- A long first name is squeezed into its slot rather than run into the next one. -->
			<text
				x={n.x}
				y={n.labelY}
				text-anchor="middle"
				fill="var(--fg-muted)"
				class="who"
				textLength={n.firstName.length > 13 ? fan.labelWidth - 8 : undefined}
				lengthAdjust="spacingAndGlyphs">{n.firstName}</text
			>
		{/if}
	{/each}
</svg>

<style>
	.ego {
		display: block;
	}
	/* The ring fills the box its button gives it and wears that box's frame. (`shape-`, never the
	   bare `ring`: that is a Tailwind utility, which would draw a ring round the picture.) */
	.ego.shape-ring {
		width: 100%;
		height: 100%;
	}
	/* The strip keeps its own size, centred in the frame, which crops what does not fit. */
	.ego.shape-strip {
		position: absolute;
		top: 0;
		left: 50%;
		translate: -50% 0;
		max-width: none;
	}
	.who {
		font-size: 11px;
		font-weight: 500;
	}
	text {
		pointer-events: none;
	}
</style>
