import type { NewContactField } from '../contact-fields/contact-fields';
import type { HeldAddress, HomeChange, HomeRepository, NewHome } from '../homes/homes';

/*
 * A `HomeRepository` over plain arrays, for the home use-cases. Which people the viewer may
 * see is the access layer's decision, covered against SQLite in `db/home-repository.test.ts`;
 * here it is a fixed set the test names. The one rule the database keeps is kept too: a home
 * left with nobody in it is gone.
 */

export interface HomeWorld {
	homes: NewHome[];
	members: { homeId: string; contactId: string }[];
	// Seeded with the columns that matter; what the change adds is held whole.
	fields: (Pick<NewContactField, 'id' | 'contactId' | 'kind' | 'label' | 'value' | 'meta'> &
		Partial<NewContactField>)[];
}

export function homeRepositoryWith(
	world: HomeWorld,
	seen: ReadonlySet<string>
): HomeRepository & { world: HomeWorld } {
	return {
		world,
		async findForMemberVisibleTo(_viewer, homeId, contactId) {
			const home = world.homes.find((h) => h.id === homeId);
			const lives = world.members.some((m) => m.homeId === homeId && m.contactId === contactId);
			if (!home || !lives || !seen.has(contactId)) return null;
			return {
				id: home.id,
				householdId: home.householdId,
				label: home.label,
				value: home.value,
				meta: home.meta,
				members: world.members
					.filter((m) => m.homeId === homeId)
					.map((m) => ({ contactId: m.contactId, visible: seen.has(m.contactId) }))
			};
		},
		async addressesOf(contactIds) {
			const ids = new Set(contactIds);
			const own: HeldAddress[] = world.fields
				.filter((f) => ids.has(f.contactId) && f.kind === 'address')
				.map((f) => ({ ...f, source: 'field' }));
			const homes: HeldAddress[] = world.members
				.filter((m) => ids.has(m.contactId))
				.flatMap((m) => {
					const home = world.homes.find((h) => h.id === m.homeId);
					return home
						? [
								{
									contactId: m.contactId,
									source: 'home' as const,
									id: home.id,
									label: home.label,
									value: home.value,
									meta: home.meta
								}
							]
						: [];
				});
			return [...own, ...homes];
		},
		async apply(change: HomeChange) {
			if (change.create) world.homes.push(change.create);
			if (change.update) {
				const { id, label, value } = change.update;
				world.homes = world.homes.map((h) => (h.id === id ? { ...h, label, value } : h));
			}
			for (const drop of change.dropFields) {
				world.fields = world.fields.filter(
					(f) => !(f.id === drop.fieldId && f.contactId === drop.contactId)
				);
			}
			world.fields.push(...change.addFields);
			world.members.push(...change.join.map(({ homeId, contactId }) => ({ homeId, contactId })));
			for (const out of change.leave) {
				world.members = world.members.filter(
					(m) => !(m.homeId === out.homeId && m.contactId === out.contactId)
				);
			}
			world.homes = world.homes.filter((h) => world.members.some((m) => m.homeId === h.id));
		}
	};
}
