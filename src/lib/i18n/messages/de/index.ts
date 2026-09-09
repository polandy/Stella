/*
 * The German message catalogue: every area merged into one flat, dotted key space.
 * Adding an area means adding its module here and in the other language's barrel.
 */

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
import { nav } from './nav';
import { relationships } from './relationships';
import { search } from './search';
import { settings } from './settings';
import { story } from './story';

/** Every message Stella can say in German. */
export const de = {
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
	...nav,
	...relationships,
	...search,
	...settings,
	...story
};
