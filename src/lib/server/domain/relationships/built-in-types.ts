import type { RelationshipType } from './relationships';

/*
 * Built-in relationship types (docs/03 §relationship_type). Stable ids (= key) let the
 * startup seeder upsert them idempotently. `household_id` is NULL for these globals.
 */

export const BUILT_IN_RELATIONSHIP_TYPES: readonly RelationshipType[] = [
	{ id: 'parent_child', householdId: null, key: 'parent_child', forwardLabel: 'Parent of', reverseLabel: 'Child of', category: 'family', symmetric: false, sortOrder: 0 },
	{ id: 'grandparent_grandchild', householdId: null, key: 'grandparent_grandchild', forwardLabel: 'Grandparent of', reverseLabel: 'Grandchild of', category: 'family', symmetric: false, sortOrder: 1 },
	{ id: 'sibling', householdId: null, key: 'sibling', forwardLabel: 'Sibling of', reverseLabel: 'Sibling of', category: 'family', symmetric: true, sortOrder: 2 },
	{ id: 'partner', householdId: null, key: 'partner', forwardLabel: 'Partner of', reverseLabel: 'Partner of', category: 'romantic', symmetric: true, sortOrder: 3 },
	{ id: 'spouse', householdId: null, key: 'spouse', forwardLabel: 'Spouse of', reverseLabel: 'Spouse of', category: 'romantic', symmetric: true, sortOrder: 4 },
	{ id: 'friend', householdId: null, key: 'friend', forwardLabel: 'Friend of', reverseLabel: 'Friend of', category: 'social', symmetric: true, sortOrder: 5 },
	{ id: 'colleague', householdId: null, key: 'colleague', forwardLabel: 'Colleague of', reverseLabel: 'Colleague of', category: 'professional', symmetric: true, sortOrder: 6 },
	{ id: 'mentor_mentee', householdId: null, key: 'mentor_mentee', forwardLabel: 'Mentor of', reverseLabel: 'Mentee of', category: 'professional', symmetric: false, sortOrder: 7 },
	{ id: 'neighbor', householdId: null, key: 'neighbor', forwardLabel: 'Neighbor of', reverseLabel: 'Neighbor of', category: 'social', symmetric: true, sortOrder: 8 },
	{ id: 'acquaintance', householdId: null, key: 'acquaintance', forwardLabel: 'Acquaintance of', reverseLabel: 'Acquaintance of', category: 'social', symmetric: true, sortOrder: 9 },
	{ id: 'knows', householdId: null, key: 'knows', forwardLabel: 'Knows', reverseLabel: 'Knows', category: 'social', symmetric: true, sortOrder: 10 },
	{ id: 'other', householdId: null, key: 'other', forwardLabel: 'Connected to', reverseLabel: 'Connected to', category: 'other', symmetric: true, sortOrder: 11 }
];
