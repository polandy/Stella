import { mixHex } from '../../design/color';
import { FRAME } from '../layout/group-blocks';
import {
	LABEL_MIN_ZOOMED_FONT_SIZE,
	CIRCLE_LABEL_WIDTH,
	NAME_FONT_SIZE,
	NODE_LABEL_WIDTH
} from '../layout/legibility';
import { expandBadge } from './badge';
import { CAPTION_CLASS, HAS_MORE_CLASS, LIT_CLASS, SLOT_CLASS } from './canvas-classes';
import { lineColour } from './stylesheet-edges';
import type { CyStyle, StyleContext, StyledElement } from './stylesheet';

/*
 * The nodes of the graph stylesheet (docs/05 §5.8): people, circles, role frames, the "+N"
 * badge, a missing parent's slot and the canvas caption.
 */

/** How far a person's name sits below their disc, in model units. */
const NAME_MARGIN = 6;
/** A circle's pill height off the family tree, in model units. */
const CIRCLE_HEIGHT = 28;

export function nodeStyles({ p, tree, transition }: StyleContext): CyStyle[] {
	// One badge image per count, built once per palette: every node with "+3" shares it.
	const badges = new Map<number, string>();
	const badgeOf = (ele: StyledElement): string => {
		const count = Number(ele.data('more'));
		let uri = badges.get(count);
		if (uri === undefined) {
			uri = expandBadge(count, { fill: p.card, text: p.fg, ring: p.fgSubtle }).uri;
			badges.set(count, uri);
		}
		return uri;
	};
	// In the tree a person's role goes on a second line under the name ("Father").
	const nameAndRole = (ele: StyledElement): string => {
		const name = String(ele.data('label') ?? '');
		const role = String(ele.data('role') ?? '');
		return role ? `${name}\n${role}` : name;
	};

	return [
		// ── People ────────────────────────────────────────────────────────────
		{
			selector: 'node.person',
			style: {
				'background-color': p.card, // overridden per-accent below
				// The diameter the elements carry: a square-root scale of the lines on the map.
				width: 'data(size)',
				height: 'data(size)',
				label: tree ? nameAndRole : 'data(label)',
				color: p.fg,
				'font-size': NAME_FONT_SIZE,
				'font-family': p.fontSans,
				'text-valign': 'bottom',
				'text-margin-y': NAME_MARGIN,
				'text-max-width': `${NODE_LABEL_WIDTH}px`,
				// Cutting short works on one line only; the name and its role are two.
				'text-wrap': tree ? 'wrap' : 'ellipsis',
				'min-zoomed-font-size': LABEL_MIN_ZOOMED_FONT_SIZE,
				'border-width': 3,
				'text-background-color': p.bg,
				'text-background-opacity': 0.65,
				'text-background-shape': 'roundrectangle',
				'text-background-padding': '2px',
				'transition-property': 'opacity, border-width, border-color',
				'transition-duration': transition
			}
		},
		// The same disc as the avatar component (docs/05 §5.10): the accent tints the card and
		// rings the node, so a face keeps its colour between the list and the map.
		...Object.entries(p.accents).map(([name, hex]) => ({
			selector: `node.person[accent = "${name}"]`,
			style: { 'background-color': mixHex(hex, p.avatarTint, p.card), 'border-color': hex }
		})),
		// A person with a photo wears it, clipped to the disc; the accent stays as the border.
		{
			selector: 'node.person.has-photo',
			style: {
				'background-image': 'data(photo)',
				'background-fit': 'cover',
				'background-clip': 'node',
				'background-image-crossorigin': 'use-credentials'
			}
		},
		{
			selector: 'node.center',
			style: { 'border-color': p.primary, 'border-width': 4, 'font-weight': 600, 'z-index': 10 }
		},
		// The tree is read from its centre outwards: a soft glow around the ring finds it at once.
		// Fainter than a selection's halo, which still wins when the centre is selected.
		...(tree
			? [
					{
						selector: 'node.center',
						style: {
							'underlay-color': p.primary,
							'underlay-opacity': 0.15,
							'underlay-padding': 10,
							'underlay-shape': 'ellipse'
						}
					}
				]
			: []),
		// Somebody who has died keeps their full weight on the map — a faded disc read as "not
		// really there" — and is told apart by colour drained to the neutral grey and a double
		// ring, so the mark holds without colour too.
		{
			selector: 'node.deceased',
			style: {
				'background-color': mixHex(p.fgSubtle, p.avatarTint, p.card),
				'border-color': p.fgSubtle,
				'border-style': 'double',
				'border-width': 5
			}
		},
		// ── Circles (shared contexts) — a distinct pill shape ─────────────────
		// The tint and the ring carry the circle colour; the name is written in the text colour,
		// as on a chip, because lavender words on a lavender tint fell under AA in Latte.
		{
			selector: 'node.circle',
			style: {
				shape: 'round-rectangle',
				'background-color': mixHex(p.membership, 20, p.card),
				'border-color': p.membership,
				'border-width': 2,
				width: 'label',
				// In the tree a circle on the shelf says under its name who on the map is in it
				// (`shelf-captions.ts`): two lines, so the pill grows to them.
				height: tree ? 'label' : CIRCLE_HEIGHT,
				padding: '8px',
				label: tree ? nameAndRole : 'data(label)',
				...(tree ? { 'text-wrap': 'wrap', 'text-max-width': `${CIRCLE_LABEL_WIDTH}px` } : {}),
				color: p.fg,
				'font-size': NAME_FONT_SIZE,
				'font-weight': 600,
				'text-valign': 'center',
				'text-halign': 'center',
				'min-zoomed-font-size': LABEL_MIN_ZOOMED_FONT_SIZE
			}
		},
		// ── Groups by role (docs/02 §2.7) — a frame around the members ─────────
		// Cytoscape sizes a compound node around its members; the role and count sit on top.
		{
			selector: 'node.role-group',
			style: {
				shape: 'round-rectangle',
				'background-color': mixHex(p.membership, 8, p.card),
				'background-opacity': 0.7,
				'border-color': p.membership,
				'border-width': 1.5,
				padding: `${FRAME.padding}px`,
				label: 'data(label)',
				color: p.fg,
				'font-size': 11,
				'font-weight': 600,
				'font-family': p.fontSans,
				'text-valign': 'top',
				'text-halign': 'center',
				'text-margin-y': -4,
				'text-background-color': p.bg,
				'text-background-opacity': 0.85,
				'text-background-shape': 'roundrectangle',
				'text-background-padding': '3px',
				'min-zoomed-font-size': LABEL_MIN_ZOOMED_FONT_SIZE,
				'compound-sizing-wrt-labels': 'include',
				'transition-property': 'opacity, border-width, border-color',
				'transition-duration': transition
			}
		},
		// ── "+N": expanding this node would bring more people in ──────────────
		// A small pill over the node's upper right edge, drawn as an image because the canvas
		// has no DOM. It sits outside the disc (`containment: over`), so a photo stays whole.
		{
			selector: `node.${HAS_MORE_CLASS}`,
			style: {
				'background-image': (ele: StyledElement) => [badgeOf(ele)],
				'background-fit': 'none',
				'background-clip': 'none',
				'background-image-containment': 'over',
				'background-width': 'auto',
				'background-height': 'auto',
				'background-position-x': '100%',
				'background-position-y': '0%',
				'background-offset-x': 10,
				'background-offset-y': -6,
				'bounds-expansion': 16
			}
		},
		{
			selector: `node.has-photo.${HAS_MORE_CLASS}`,
			style: {
				'background-image': (ele: StyledElement) => [String(ele.data('photo')), badgeOf(ele)],
				'background-fit': ['cover', 'none'],
				'background-clip': ['node', 'none'],
				'background-image-containment': ['inside', 'over'],
				'background-width': ['auto', 'auto'],
				'background-height': ['auto', 'auto'],
				'background-position-x': ['50%', '100%'],
				'background-position-y': ['50%', '0%'],
				'background-offset-x': [0, 10],
				'background-offset-y': [0, -6]
			}
		}
	];
}

/** A missing parent's slot and the canvas caption, drawn over the lines. */
export function markStyles({ p }: StyleContext): CyStyle[] {
	return [
		// ── A missing parent's slot in the family tree (docs/05 §5.8) ─────────
		// Room for somebody not entered yet: a plus in a dashed ring, hollow so it never reads as
		// a person, and one dashed line tying it in. Muted, yet at 3:1 like every other line.
		{
			selector: `node.${SLOT_CLASS}`,
			style: {
				width: 'data(size)',
				height: 'data(size)',
				'background-opacity': 0,
				'border-width': 2,
				'border-style': 'dashed',
				'border-color': p.fgMuted,
				label: 'data(label)',
				color: p.fgMuted,
				'font-size': 20,
				'font-family': p.fontSans,
				'text-valign': 'center',
				'text-halign': 'center',
				'min-zoomed-font-size': LABEL_MIN_ZOOMED_FONT_SIZE
			}
		},
		{
			selector: `edge.${SLOT_CLASS}`,
			style: {
				...lineColour(p.fgMuted),
				width: 1.2,
				'line-style': 'dashed',
				'line-dash-pattern': [4, 4],
				'target-arrow-shape': 'none'
			}
		},
		// ── A caption the controller writes onto the canvas ───────────────────
		// "Outside the family" over the shelf beneath the tree: quiet words, nobody to tap.
		{
			selector: `node.${CAPTION_CLASS}`,
			style: {
				width: 1,
				height: 1,
				'background-opacity': 0,
				'border-width': 0,
				label: 'data(label)',
				color: p.fgMuted,
				'font-size': 11,
				'font-family': p.fontSans,
				'text-valign': 'center',
				'text-halign': 'right',
				'min-zoomed-font-size': LABEL_MIN_ZOOMED_FONT_SIZE,
				events: 'no'
			}
		}
	];
}

/**
 * The lit names grown by `growth` (`nameGrowth`, docs/05 §5.8), laid over the stylesheet while
 * the map is zoomed out: the selected person and their neighbours stay readable on a phone, the
 * faded rest keeps its size. Nothing at full size, and never in the family tree, whose names
 * wrap over their roles and whose pills grow to them already.
 */
export function grownNames(growth: number): CyStyle[] {
	if (growth === 1) return [];
	return [
		{
			selector: `node.person.${LIT_CLASS}`,
			style: {
				'font-size': NAME_FONT_SIZE * growth,
				'text-max-width': `${NODE_LABEL_WIDTH * growth}px`,
				'text-margin-y': NAME_MARGIN * growth
			}
		},
		{
			selector: `node.circle.${LIT_CLASS}`,
			style: { 'font-size': NAME_FONT_SIZE * growth, height: CIRCLE_HEIGHT * growth }
		}
	];
}
