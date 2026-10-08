import type { Circle, CircleColor } from '../domain/circles/circles';
import { circle } from './schema';

/*
 * A circle's own columns and the row they read back as — shared by the repository's one-circle
 * reads and the overview's read model, so the two cannot drift apart.
 */

export const circleColumns = {
	id: circle.id,
	householdId: circle.householdId,
	createdBy: circle.createdBy,
	visibility: circle.visibility,
	name: circle.name,
	description: circle.description,
	kind: circle.kind,
	color: circle.color,
	startDate: circle.startDate,
	endDate: circle.endDate
};

export const toCircle = (row: Record<string, unknown>): Circle => ({
	id: row.id as string,
	householdId: row.householdId as string,
	createdBy: row.createdBy as string,
	visibility: row.visibility as 'shared' | 'private',
	name: row.name as string,
	description: (row.description as string | null) ?? null,
	kind: row.kind as Circle['kind'],
	color: row.color as CircleColor,
	startDate: (row.startDate as string | null) ?? null,
	endDate: (row.endDate as string | null) ?? null
});
