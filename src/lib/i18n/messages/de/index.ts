/*
 * The German message catalogue: every area merged into one flat, dotted key space.
 * Adding an area means adding its module here and in the other language's barrel.
 */

import { auth } from './auth';
import { common } from './common';
import { nav } from './nav';
import { settings } from './settings';

/** Every message Stella can say in German. */
export const de = {
	...auth,
	...common,
	...nav,
	...settings
};
