import type { Tag } from '../domain/tags/tags';
import type { TagColor } from '../../tags/colors';
import { tag } from './schema';

/*
 * A tag's columns and the row they read back as — shared by the repository's lookup and the
 * tag lists, so the two cannot drift apart.
 */

export const tagColumns = {
	id: tag.id,
	householdId: tag.householdId,
	name: tag.name,
	color: tag.color
};

export const toTag = (row: {
	id: string;
	householdId: string;
	name: string;
	color: string;
}): Tag => ({
	id: row.id,
	householdId: row.householdId,
	name: row.name,
	color: row.color as TagColor
});
