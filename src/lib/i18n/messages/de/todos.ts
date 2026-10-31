import type { TodosMessages } from '../en/todos';

/** German for `messages/en/todos.ts`. */
export const todos: TodosMessages = {
	'todos.title': 'Todos',
	'todos.none': 'Nichts offen.',
	'todos.add': 'Todo',
	'todos.form.for': (p) => `Todo für ${p.name}`,
	'todos.form.what': 'Was ist noch zu tun?',
	'todos.form.whatPlaceholder': 'z. B. das Buch zurückgeben',
	'todos.form.by': 'Bis',
	'todos.form.addDay': 'Bis zu einem Tag',
	'todos.form.noDay': 'Kein Tag',
	'todos.dueBy': (p) => `bis ${p.day}`,
	'todos.overdueSince': (p) => `überfällig seit ${p.day}`,
	'todos.notedBy': (p) => `notiert von ${p.name}`,
	'todos.tick': (p) => `Erledigt: ${p.title}`,
	'todos.edit': (p) => `Ändern: ${p.title}`,
	'todos.remove': (p) => `Entfernen: ${p.title}`,
	'todos.done': (p) => `Erledigt: ${p.title}`,
	'todos.removed': 'Todo entfernt'
};
