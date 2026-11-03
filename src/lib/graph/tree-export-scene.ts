// Imported relatively, like `edge-words.ts`, so the module carries no SvelteKit alias.
import type { Translate } from '../i18n/translate';
import { captionWords } from './caption-words';
import { toCytoscapeElements, type CyElement } from './cytoscape/elements';
import { edgeWords, treeRoleWords } from './edge-words';
import { impliedKinshipEdgeIds } from './model/implied-kinship';
import { shelfCaptions } from './model/shelf-captions';
import { rolesTowards } from './model/tree-roles';
import { hiddenInTree } from './model/tree-shown';
import type { GraphModel } from './model/types';
import { exportedModel, lifeYearsOf, lifeYearsWords, type ExportChoices } from './tree-export';

/*
 * The family tree as it goes onto a picture or a page (docs/02 §2.7): the tree on screen, less
 * what stays in the household, written for paper. Pure; `cytoscape/tree-image.ts` draws it.
 *
 * It is laid out afresh, so a private person left out leaves no gap, and every caption is read
 * from what goes out — "Friend of Sandra" never names somebody the export leaves behind.
 */

export interface SceneInput {
	/** The whole snapshot the roles are read from. */
	graph: GraphModel;
	/** The tree as the explorer shows it: opened up, with the reader's filters applied. */
	shown: GraphModel;
	centerId: string | null;
	/** The tree around a person, which writes everybody's role towards them under the name. */
	rolesInstead: boolean;
	/** The reader asked for every derived line (docs/02 §2.7). */
	allKinship: boolean;
	choices: Pick<ExportChoices, 'dates' | 'withPrivate'>;
	t: Translate;
}

export interface ExportScene {
	/** What the tree is laid out from: every line among those going out, drawn or not. */
	model: GraphModel;
	/** What is drawn: the people, and only the lines the tree on screen draws too. */
	elements: CyElement[];
	/** Whether a second line goes under the names, so the stylesheet writes it. */
	underNames: boolean;
}

export function exportScene(input: SceneInput): ExportScene {
	const { graph, centerId, choices, t } = input;
	const model = exportedModel(input.shown, choices.withPrivate);
	// A private centre left out has nobody left to be anybody's father.
	const around =
		input.rolesInstead && centerId !== null && model.nodes.some((n) => n.id === centerId)
			? centerId
			: null;
	const roles = around ? rolesTowards(graph, around) : null;
	const shelf = around ? shelfCaptions(graph, model, around) : null;
	const byId = new Map(model.nodes.map((n) => [n.id, n]));
	const nameOf = (id: string) => byId.get(id)?.shortName ?? byId.get(id)?.label ?? id;
	const yearsOf = (id: string) => {
		const node = byId.get(id);
		const years = choices.dates && node ? lifeYearsOf(node) : null;
		return years ? lifeYearsWords(t, years) : undefined;
	};
	const roleOf = (id: string) => {
		const role = roles?.get(id);
		const caption = shelf?.get(id);
		const said = role
			? treeRoleWords(t, role)
			: caption
				? captionWords(t, caption, nameOf)
				: undefined;
		const lines = [said, yearsOf(id)].filter((line) => line !== undefined);
		return lines.length > 0 ? lines.join('\n') : undefined;
	};

	const leftOff = input.allKinship ? new Set<string>() : impliedKinshipEdgeIds(model);
	const notDrawn = new Set([...leftOff, ...hiddenInTree(model, null)]);
	const centred = centerId !== null && byId.has(centerId) ? centerId : undefined;
	// Sized from every line, as on screen, so a person is drawn as large as the reader knows them.
	const elements = toCytoscapeElements(model, {
		centerId: centred,
		edgeLabel: (edge) => edgeWords(t, edge),
		roleOf
	}).filter((element) => element.group === 'nodes' || !notDrawn.has(String(element.data.id)));
	return {
		model,
		elements,
		underNames: around !== null || choices.dates
	};
}
