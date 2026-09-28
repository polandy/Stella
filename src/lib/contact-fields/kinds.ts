/*
 * Contact field kinds (docs/02 §2.3). Pure and framework-free so the domain, the command
 * vocabulary on a phone and the form all check against one list.
 */

/** Every kind a contact field can have. */
export const CONTACT_FIELD_KINDS = ['phone', 'email', 'address', 'url', 'social', 'date', 'custom'] as const;

/** One of `CONTACT_FIELD_KINDS`. */
export type ContactFieldKind = (typeof CONTACT_FIELD_KINDS)[number];
