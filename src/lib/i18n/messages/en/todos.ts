/* To-dos: what the household still owes a person, on the person page (docs/02 §2.26). */

export const todos = {
	'todos.title': 'To do',
	// The card as one line, with nothing open (docs/05 §5.5).
	'todos.none': 'Nothing open.',
	'todos.add': 'To do',
	'todos.form.what': 'What is still to do?',
	'todos.form.whatPlaceholder': 'e.g. give the book back',
	'todos.form.by': 'By',
	'todos.form.noDay': 'No day',
	'todos.form.save': 'Save',
	'todos.form.cancel': 'Cancel',
	'todos.dueBy': (p: { day: string }) => `by ${p.day}`,
	'todos.overdueSince': (p: { day: string }) => `overdue since ${p.day}`,
	'todos.notedBy': (p: { name: string }) => `noted by ${p.name}`,
	'todos.private': 'private',
	'todos.tick': (p: { title: string }) => `Done: ${p.title}`,
	'todos.untick': (p: { title: string }) => `Open again: ${p.title}`,
	'todos.edit': (p: { title: string }) => `Change: ${p.title}`,
	'todos.remove': 'Remove',
	'todos.done': (p: { title: string }) => `Done: ${p.title}`,
	'todos.removed': (p: { title: string }) => `Removed: ${p.title}`
};

/** The key set every translation of this area has to provide. */
export type TodosMessages = typeof todos;
