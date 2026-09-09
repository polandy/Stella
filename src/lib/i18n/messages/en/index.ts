/*
 * The English message catalogue: every area merged into one flat, dotted key space.
 * Adding an area means adding its module here and in the other language's barrel.
 */

import { archive } from './archive';
import { auth } from './auth';
import { circles } from './circles';
import { common } from './common';
import { components } from './components';
import { contact } from './contact';
import { contacts } from './contacts';
import { dates } from './dates';
import { errors } from './errors';
import { home } from './home';
import { importer } from './import';
import { interactions } from './interactions';
import { journal } from './journal';
import { kinship } from './kinship';
import { nav } from './nav';
import { relationships } from './relationships';
import { search } from './search';
import { settings } from './settings';
import { story } from './story';

/** Every message Stella can say in English — the source of truth for the key set. */
export const en = {
	...archive,
	...auth,
	...circles,
	...common,
	...components,
	...contact,
	...contacts,
	...dates,
	...errors,
	...home,
	...importer,
	...interactions,
	...journal,
	...kinship,
	...nav,
	...relationships,
	...search,
	...settings,
	...story
};
