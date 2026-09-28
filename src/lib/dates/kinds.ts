/*
 * Important date kinds (docs/02 §2.13). Pure and framework-free so the domain, the command
 * vocabulary on a phone and the form all check against one list.
 */

/** Every kind an important date can have. */
export const IMPORTANT_DATE_KINDS = ['birthday', 'anniversary', 'custom'] as const;

/** One of `IMPORTANT_DATE_KINDS`. */
export type ImportantDateKind = (typeof IMPORTANT_DATE_KINDS)[number];
