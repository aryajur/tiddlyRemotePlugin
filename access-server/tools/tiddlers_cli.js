/**
 * tiddlers_cli - see and set the groups of tiddlers from the command line
 *
 * For testing before the admin panel exists (step 08), and for moving existing
 * tiddlers (which have no group = admin-only) into groups. Works directly on
 * <DATA_DIR>/tiddlers/*.json; the running server sees changes at once.
 *
 * Run from the access-server folder (Git Bash), with the same DATA_DIR as the server.
 * Put titles with spaces in quotes.
 *
 *   DATA_DIR=../tmp/access-users node tools/tiddlers_cli.js list
 *   DATA_DIR=../tmp/access-users node tools/tiddlers_cli.js set "Test Tiddler" hr
 *   DATA_DIR=../tmp/access-users node tools/tiddlers_cli.js set "Test Tiddler" hr,eng
 *   DATA_DIR=../tmp/access-users node tools/tiddlers_cli.js set "Test Tiddler" none      (no group = admin-only)
 *   DATA_DIR=../tmp/access-users node tools/tiddlers_cli.js set-ungrouped hr             (every tiddler without a group)
 *
 * Groups that do not exist yet are created in groups.json.
 */
const storage = require('../lib/storage');
const users = require('../lib/users');

function fail(message) {
	console.error('Error: ' + message);
	process.exit(1);
}

function parseGroups(text) {
	if (text === undefined) fail('give the groups, e.g. hr or hr,eng or none');
	if (text.trim().toLowerCase() === 'none') return [];
	const list = text.split(',').map(g => g.trim().toLowerCase()).filter(g => g !== '');
	list.forEach(g => { const p = users.checkGroupName(g); if (p) fail(p + ' ("' + g + '")'); });
	return Array.from(new Set(list));
}

function ensureGroups(list) {
	const data = users.loadGroups();
	let changed = false;
	list.forEach(g => {
		if (!data.groups[g]) {
			data.groups[g] = { description: '', created: new Date().toISOString() };
			changed = true;
			console.log('Created group "' + g + '"');
		}
	});
	if (changed) users.saveGroups(data);
}

function describe(groups) {
	return groups && groups.length ? groups.join(',') : '(none - administrators only)';
}

function setGroups(tiddler, groups) {
	tiddler.groups = groups;
	const result = storage.put(tiddler);
	if (result.conflict !== undefined) fail('could not save "' + tiddler.title + '"');
}

function main() {
	const args = process.argv.slice(2);
	storage.ensureDirs();
	console.log('Data directory: ' + storage.dataDir());

	switch (args[0]) {
	case 'list': {
		const all = storage.listAll().sort((a, b) => a.title.localeCompare(b.title));
		if (all.length === 0) console.log('(no tiddlers)');
		all.forEach(t => console.log(t.title.padEnd(40) + ' groups: ' + describe(t.groups)));
		return;
	}
	case 'set': {
		const title = args[1];
		if (!title) fail('usage: set "<title>" <groups|none>');
		const tiddler = storage.get(title);
		if (!tiddler) fail('no tiddler titled "' + title + '" (titles are case-sensitive; use "list")');
		const groups = parseGroups(args[2]);
		ensureGroups(groups);
		setGroups(tiddler, groups);
		console.log('"' + title + '" groups: ' + describe(groups));
		return;
	}
	case 'set-ungrouped': {
		const groups = parseGroups(args[1]);
		if (groups.length === 0) fail('give at least one group');
		ensureGroups(groups);
		let count = 0;
		storage.listAll().forEach(t => {
			if (!Array.isArray(t.groups) || t.groups.length === 0) {
				setGroups(t, groups);
				console.log('"' + t.title + '" groups: ' + describe(groups));
				count++;
			}
		});
		console.log(count + ' tiddler(s) updated');
		return;
	}
	default:
		console.log('Commands: list | set "<title>" <groups|none> | set-ungrouped <groups>');
		console.log('See the top of tools/tiddlers_cli.js for examples.');
	}
}

main();
