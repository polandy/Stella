import type { ImportWording } from './plan';

/*
 * The wording an English session hands the import plan. Tests share it so a change to the
 * `ImportWording` port shows up in one place rather than in every import spec.
 */
export const englishWording: ImportWording = {
	gift: 'Gift',
	lifeEvent: 'Life event',
	pet: 'Pet',
	monicaActivity: (kind) => `(Monica activity: ${kind})`,
	metThrough: (name) => `Through ${name}`,
	metThroughInfo: (info, name) => `${info} (through ${name})`,
	day: (isoDay) =>
		new Date(isoDay).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
};
