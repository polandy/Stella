// Imported relatively, like `caption-words.ts`, so the module carries no SvelteKit alias.
import type { Translate } from '../i18n/translate';
import { kinshipLabel } from '../kinship/labels';
import { relationshipRowLabel } from '../relationships/labels';
import { roleTermLabel } from '../relationships/roles';
import type { TreeRole } from './model/tree-roles';
import type { GraphEdge } from './model/types';

/*
 * How a line on the map and a role under a name read in the viewer's language (docs/02 §2.7,
 * §2.19). A built-in relationship type is translated, a household's own reads as somebody typed
 * it, a worked-out line takes its kinship word. A link marked former says so in its words: on
 * the canvas a line has no DOM, so its name is what the hover, the Labels switch and a screen
 * reader all get — the dash alone would leave the colour-blind and the unsighted guessing.
 */

const asFormer = (t: Translate, words: string) => t('graph.former', { words });

export function edgeWords(t: Translate, edge: GraphEdge): string {
	let words: string;
	if (edge.kin) words = kinshipLabel(t, edge.kin);
	else if (edge.typeKey)
		words = relationshipRowLabel(t, { typeKey: edge.typeKey, label: edge.label ?? '' });
	else words = edge.label ?? '';
	return edge.former && words ? asFormer(t, words) : words;
}

/** The role the family tree writes under a name ("Wife · former"), or undefined without words. */
export function treeRoleWords(t: Translate, role: TreeRole): string | undefined {
	const words = roleTermLabel(t, role.term, role.variant);
	if (!words) return undefined;
	return role.former ? asFormer(t, words) : words;
}
