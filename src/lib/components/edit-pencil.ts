/*
 * Where to edit (docs/05 §5.7): the pencil of a value that edits in place sits directly after
 * the value's last word, on the text's last line — never at the column's edge, never on a line
 * of its own. The value is an inline box that reserves the pencil's room as end padding, which
 * the browser keeps on the same line as the last word; the pencil is placed absolutely in that
 * room, since an inline box's containing block ends where its last line ends.
 *
 * The pencil comes *first* in the markup: Chromium keeps a break opportunity at an
 * out-of-flow box's place in the text, so a pencil written after the last word could still
 * open a line of its own when the text exactly fills a line. (A word joiner before an inline
 * glyph failed the same way.)
 */

/** The value: an inline box with room for the pencil after its last word. */
export const VALUE_WITH_PENCIL = 'relative pr-4';

/** The pencil in that room; `.edit-pencil` (app.css) decides when it shows. */
export const PENCIL_AT_VALUE_END = 'edit-pencil absolute right-0 bottom-[0.2em]';
