/* To-dos: what the household still owes a person, on the person page (docs/02 §2.26). */

export const todos = {
	'todos.title': 'To do',
	// The card as one line, with nothing open (docs/05 §5.5).
	'todos.none': 'Nothing open.',
	'todos.add': 'Add',
	'todos.form.for': (p: { name: string }) => `To-do for ${p.name}`,
	'todos.form.what': 'What is still to do?',
	'todos.form.whatPlaceholder': 'e.g. give the book back',
	'todos.form.by': 'By',
	'todos.form.addDay': 'By when?',
	'todos.form.noDay': 'No day',
	'todos.dueBy': (p: { day: string }) => `by ${p.day}`,
	'todos.wasDue': (p: { day: string }) => `was due ${p.day}`,
	'todos.notedBy': (p: { name: string }) => `noted by ${p.name}`,
	// The checkbox's name: what ticking it does.
	'todos.tick': (p: { title: string }) => `Done: ${p.title}`,
	'todos.edit': (p: { title: string }) => `Change: ${p.title}`,
	'todos.remove': (p: { title: string }) => `Remove: ${p.title}`,
	// The toasts, with *Undo* beside them.
	'todos.done': (p: { title: string }) => `Done: ${p.title}`,
	'todos.removed': 'To-do removed',
	// *Undo* on a row whose tick is kept on the device; it names its to-do, and says *Undo*.
	'todos.recallTick': (p: { title: string }) => `Undo tick: ${p.title}`,
	// *Undo* on a tick kept on the device came too late: it had just gone out.
	'todos.tickOnItsWay': 'Already sent: it can be opened again from Activity.',
	// A done one in the person's Activity (docs/02 §2.23): its label, and unchecking it.
	'todos.story.done': 'Done',
	'todos.story.reopen': (p: { title: string }) => `Not done yet: ${p.title}`,
	'todos.story.reopened': (p: { title: string }) => `Open again: ${p.title}`,
	// Home's band (docs/02 §2.26.6): what is overdue or due within the week.
	'todos.band.title': 'To do',
	// `/todos`: every open to-do of the household, grouped by its day.
	'todos.list.title': 'To-dos',
	'todos.list.intro': 'Everything still to do, for everyone, the most pressing first.',
	'todos.list.open': (p: { count: number }) => `${p.count} open`,
	'todos.list.overdue': 'Overdue',
	'todos.list.thisWeek': 'This week',
	'todos.list.later': 'Later',
	'todos.list.noDay': 'No day',
	'todos.list.empty': 'Nothing open.',
	'todos.list.emptyHint': 'Note a to-do on a person’s page, and it shows up here.'
};

/** The key set every translation of this area has to provide. */
export type TodosMessages = typeof todos;
