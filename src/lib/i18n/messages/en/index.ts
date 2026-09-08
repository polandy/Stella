/*
 * The English message catalogue: every area merged into one flat, dotted key space.
 * Adding an area means adding its module here and in the other language's barrel.
 */

import { auth } from './auth';
import { circles } from './circles';
import { common } from './common';
import { components } from './components';
import { contacts } from './contacts';
import { dates } from './dates';
import { errors } from './errors';
import { home } from './home';
import { interactions } from './interactions';
import { nav } from './nav';
import { search } from './search';
import { settings } from './settings';

/** Every message Stella can say in English — the source of truth for the key set. */
export const en = {
	...auth,
	...circles,
	...common,
	...components,
	...contacts,
	...dates,
	...errors,
	...home,
	...interactions,
	...nav,
	...search,
	...settings
};
