/*
 * Where an import came from (docs/02 §2.16). The wizard accepts three files and reads all of
 * them into one typed view; this names the three and the prefix each puts on its source ids.
 */

/** Which accepted export a reading came from. */
export type ImportSource = 'sql' | 'json' | 'vcard';

/**
 * The prefix of every source id a reading produces. Monica's two exports describe the same
 * records and share one prefix; a vCard is a different source and must never be mistaken for
 * a re-run of a Monica import.
 */
export const sourcePrefix = (source: ImportSource): string => (source === 'vcard' ? 'vcard' : 'monica');
