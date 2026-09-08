/*
 * The English message catalogue: every area merged into one flat, dotted key space.
 * Adding an area means adding its module here and in the other language's barrel.
 */

import { auth } from './auth';
import { common } from './common';
import { nav } from './nav';
import { settings } from './settings';

/** Every message Stella can say in English — the source of truth for the key set. */
export const en = {
	...auth,
	...common,
	...nav,
	...settings
};
