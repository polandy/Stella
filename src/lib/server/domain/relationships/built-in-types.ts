import type { RelationshipType } from './relationships';

/*
 * Built-in relationship types (docs/03 §relationship_type). Stable ids (= key) let the
 * startup seeder upsert them idempotently. `household_id` is NULL for these globals.
 */

export const BUILT_IN_RELATIONSHIP_TYPES: readonly RelationshipType[] = [
	// Family first, closest first — the family terms Stella works out can each be stored as one
	// of these once the household confirms it (docs/02 §2.4.1).
	{
		id: 'parent_child',
		householdId: null,
		key: 'parent_child',
		forwardLabel: 'Parent of',
		reverseLabel: 'Child of',
		category: 'family',
		symmetric: false,
		sortOrder: 0
	},
	{
		id: 'grandparent_grandchild',
		householdId: null,
		key: 'grandparent_grandchild',
		forwardLabel: 'Grandparent of',
		reverseLabel: 'Grandchild of',
		category: 'family',
		symmetric: false,
		sortOrder: 1
	},
	{
		id: 'great_grandparent_great_grandchild',
		householdId: null,
		key: 'great_grandparent_great_grandchild',
		forwardLabel: 'Great-grandparent of',
		reverseLabel: 'Great-grandchild of',
		category: 'family',
		symmetric: false,
		sortOrder: 2
	},
	{
		id: 'sibling',
		householdId: null,
		key: 'sibling',
		forwardLabel: 'Sibling of',
		reverseLabel: 'Sibling of',
		category: 'family',
		symmetric: true,
		sortOrder: 3
	},
	{
		id: 'half_sibling',
		householdId: null,
		key: 'half_sibling',
		forwardLabel: 'Half-sibling of',
		reverseLabel: 'Half-sibling of',
		category: 'family',
		symmetric: true,
		sortOrder: 4
	},
	{
		id: 'aunt_uncle_niece_nephew',
		householdId: null,
		key: 'aunt_uncle_niece_nephew',
		forwardLabel: 'Aunt / uncle of',
		reverseLabel: 'Niece / nephew of',
		category: 'family',
		symmetric: false,
		sortOrder: 5
	},
	{
		id: 'cousin',
		householdId: null,
		key: 'cousin',
		forwardLabel: 'Cousin of',
		reverseLabel: 'Cousin of',
		category: 'family',
		symmetric: true,
		sortOrder: 6
	},
	{
		id: 'parent_in_law_child_in_law',
		householdId: null,
		key: 'parent_in_law_child_in_law',
		forwardLabel: 'Parent-in-law of',
		reverseLabel: 'Child-in-law of',
		category: 'family',
		symmetric: false,
		sortOrder: 7
	},
	{
		id: 'sibling_in_law',
		householdId: null,
		key: 'sibling_in_law',
		forwardLabel: 'Sibling-in-law of',
		reverseLabel: 'Sibling-in-law of',
		category: 'family',
		symmetric: true,
		sortOrder: 8
	},
	{
		id: 'partner',
		householdId: null,
		key: 'partner',
		forwardLabel: 'Partner of',
		reverseLabel: 'Partner of',
		category: 'romantic',
		symmetric: true,
		sortOrder: 9
	},
	{
		id: 'spouse',
		householdId: null,
		key: 'spouse',
		forwardLabel: 'Spouse of',
		reverseLabel: 'Spouse of',
		category: 'romantic',
		symmetric: true,
		sortOrder: 10
	},
	{
		id: 'friend',
		householdId: null,
		key: 'friend',
		forwardLabel: 'Friend of',
		reverseLabel: 'Friend of',
		category: 'social',
		symmetric: true,
		sortOrder: 11
	},
	{
		id: 'colleague',
		householdId: null,
		key: 'colleague',
		forwardLabel: 'Colleague of',
		reverseLabel: 'Colleague of',
		category: 'professional',
		symmetric: true,
		sortOrder: 12
	},
	{
		id: 'mentor_mentee',
		householdId: null,
		key: 'mentor_mentee',
		forwardLabel: 'Mentor of',
		reverseLabel: 'Mentee of',
		category: 'professional',
		symmetric: false,
		sortOrder: 13
	},
	{
		id: 'neighbor',
		householdId: null,
		key: 'neighbor',
		forwardLabel: 'Neighbor of',
		reverseLabel: 'Neighbor of',
		category: 'social',
		symmetric: true,
		sortOrder: 14
	},
	{
		id: 'acquaintance',
		householdId: null,
		key: 'acquaintance',
		forwardLabel: 'Acquaintance of',
		reverseLabel: 'Acquaintance of',
		category: 'social',
		symmetric: true,
		sortOrder: 15
	},
	{
		id: 'knows',
		householdId: null,
		key: 'knows',
		forwardLabel: 'Knows',
		reverseLabel: 'Knows',
		category: 'social',
		symmetric: true,
		sortOrder: 16
	},
	{
		id: 'other',
		householdId: null,
		key: 'other',
		forwardLabel: 'Connected to',
		reverseLabel: 'Connected to',
		category: 'other',
		symmetric: true,
		sortOrder: 17
	}
];
