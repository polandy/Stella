import type { TodosMessages } from '../en/todos';

/** German for `messages/en/todos.ts`. */
export const todos: TodosMessages = {
	'todos.title': 'Offene Punkte',
	'todos.none': 'Nichts offen.',
	'todos.add': 'Offener Punkt',
	'todos.form.what': 'Was ist noch zu tun?',
	'todos.form.whatPlaceholder': 'z. B. das Buch zurückgeben',
	'todos.form.by': 'Bis',
	'todos.form.noDay': 'Kein Tag',
	'todos.form.save': 'Speichern',
	'todos.form.cancel': 'Abbrechen',
	'todos.dueBy': (p) => `bis ${p.day}`,
	'todos.overdueSince': (p) => `überfällig seit ${p.day}`,
	'todos.notedBy': (p) => `notiert von ${p.name}`,
	'todos.private': 'privat',
	'todos.tick': (p) => `Erledigt: ${p.title}`,
	'todos.untick': (p) => `Wieder offen: ${p.title}`,
	'todos.edit': (p) => `Ändern: ${p.title}`,
	'todos.remove': 'Entfernen',
	'todos.done': (p) => `Erledigt: ${p.title}`,
	'todos.removed': (p) => `Entfernt: ${p.title}`
};
