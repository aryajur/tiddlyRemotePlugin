/**
 * users_cli - manage users from the command line (no server or login needed)
 *
 * For testing before the admin panel exists (step 08), and for emergencies
 * (e.g. the only administrator forgot the password). Works directly on
 * <DATA_DIR>/users.json and groups.json; the running server sees changes at once.
 *
 * Run from the access-server folder (Git Bash), with the same DATA_DIR as the server:
 *
 *   DATA_DIR=../tmp/access-users node tools/users_cli.js list
 *   DATA_DIR=../tmp/access-users node tools/users_cli.js add alice alice-pass-1 --groups hr,eng --default hr
 *   DATA_DIR=../tmp/access-users node tools/users_cli.js add boss boss-pass-12 --admin
 *   DATA_DIR=../tmp/access-users node tools/users_cli.js passwd alice new-pass-123
 *   DATA_DIR=../tmp/access-users node tools/users_cli.js groups alice hr --default hr
 *   DATA_DIR=../tmp/access-users node tools/users_cli.js disable alice
 *   DATA_DIR=../tmp/access-users node tools/users_cli.js enable alice
 *   DATA_DIR=../tmp/access-users node tools/users_cli.js delete alice
 *
 * Groups named in --groups / groups are created in groups.json if missing.
 * Note: a password typed on the command line can end up in the shell history.
 */
const crypto = require('../lib/crypto');
const storage = require('../lib/storage');
const users = require('../lib/users');

function fail(message) {
	console.error('Error: ' + message);
	process.exit(1);
}

function option(args, name) {
	const i = args.indexOf(name);
	return i !== -1 && i + 1 < args.length ? args[i + 1] : null;
}

function parseGroups(text) {
	const list = (text || '').split(',').map(g => g.trim().toLowerCase()).filter(g => g !== '');
	list.forEach(g => { const p = users.checkGroupName(g); if (p) fail(p + ' ("' + g + '")'); });
	return Array.from(new Set(list));
}

// Create missing groups in groups.json
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
	if (changed || !require('fs').existsSync(users.groupsFile())) users.saveGroups(data);
}

function setGroups(record, args) {
	const groups = parseGroups(option(args, '--groups') !== null ? option(args, '--groups') : args[2]);
	ensureGroups(groups);
	record.groups = groups;
	const def = option(args, '--default');
	if (def !== null) {
		if (groups.indexOf(def.toLowerCase()) === -1) fail('--default must be one of the user\'s groups');
		record.defaultGroup = def.toLowerCase();
	} else if (record.defaultGroup && groups.indexOf(record.defaultGroup) === -1) {
		record.defaultGroup = groups[0] || null;
	} else if (!record.defaultGroup) {
		record.defaultGroup = groups[0] || null;
	}
}

function main() {
	const args = process.argv.slice(2);
	const command = args[0];
	storage.ensureDirs();
	console.log('Data directory: ' + storage.dataDir());

	const data = users.loadUsers();
	const name = users.normalizeName(args[1]);
	const record = name ? data.users[name] : null;

	switch (command) {
	case 'list': {
		const names = Object.keys(data.users).sort();
		if (names.length === 0) console.log('(no users)');
		names.forEach(n => {
			const u = data.users[n];
			console.log(n.padEnd(20) + (u.isAdmin ? 'ADMIN ' : '      ') + (u.disabled ? 'DISABLED ' : '         ') +
				'groups: ' + (u.groups || []).join(',') + (u.defaultGroup ? '  (default ' + u.defaultGroup + ')' : ''));
		});
		console.log('Groups: ' + Object.keys(users.loadGroups().groups).sort().join(', '));
		return;
	}
	case 'add': {
		if (!name) fail('usage: add <username> <password> [--admin] [--groups a,b] [--default a]');
		if (record) fail('user "' + name + '" already exists');
		const problem = users.checkUsername(name) || users.checkPassword(args[2]);
		if (problem) fail(problem);
		const user = {
			passwordHash: crypto.hashPassword(args[2]),
			groups: [], defaultGroup: null,
			isAdmin: args.indexOf('--admin') !== -1,
			disabled: false,
			created: new Date().toISOString()
		};
		setGroups(user, ['add', name, '', ...args.slice(3)]);
		data.users[name] = user;
		users.saveUsers(data);
		console.log('Added user "' + name + '"' + (user.isAdmin ? ' (administrator)' : '') +
			', groups: ' + (user.groups.join(',') || '(none)'));
		return;
	}
	case 'passwd': {
		if (!record) fail('no such user "' + name + '"');
		const problem = users.checkPassword(args[2]);
		if (problem) fail(problem);
		record.passwordHash = crypto.hashPassword(args[2]);
		users.saveUsers(data);
		console.log('Password changed for "' + name + '" (existing logins stay valid until they expire or the server restarts)');
		return;
	}
	case 'groups': {
		if (!record) fail('no such user "' + name + '"');
		setGroups(record, args);
		users.saveUsers(data);
		console.log('Groups of "' + name + '": ' + (record.groups.join(',') || '(none)') +
			(record.defaultGroup ? ' (default ' + record.defaultGroup + ')' : ''));
		return;
	}
	case 'disable':
	case 'enable': {
		if (!record) fail('no such user "' + name + '"');
		record.disabled = command === 'disable';
		users.saveUsers(data);
		console.log('User "' + name + '" ' + command + 'd');
		return;
	}
	case 'delete': {
		if (!record) fail('no such user "' + name + '"');
		delete data.users[name];
		users.saveUsers(data);
		console.log('Deleted user "' + name + '"');
		return;
	}
	default:
		console.log('Commands: list | add | passwd | groups | disable | enable | delete');
		console.log('See the top of tools/users_cli.js for examples.');
	}
}

main();
