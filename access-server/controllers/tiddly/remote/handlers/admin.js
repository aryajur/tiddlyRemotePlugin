/**
 * Admin API (step 07) - administrators only, AUTH_MODE=users only
 *
 *   GET    /api/admin/users                 list users (never password hashes)
 *   POST   /api/admin/users                 {username, password, groups?, defaultGroup?, isAdmin?}
 *   PUT    /api/admin/users/<name>          any of {password, groups, defaultGroup, isAdmin, disabled}
 *   DELETE /api/admin/users/<name>
 *
 *   GET    /api/admin/groups                list groups with number of users and tiddlers
 *   POST   /api/admin/groups                {name, description?}
 *   PUT    /api/admin/groups/<name>         {description}
 *   DELETE /api/admin/groups/<name>         refused (409) while in use, unless ?force=true
 *
 *   GET    /api/admin/tiddlers              every tiddler with its groups and owner (?ungrouped=true: only no-group ones)
 *   PUT    /api/admin/tiddler-groups        {titles: [...], groups: [...], mode: "set"|"add"|"remove"}
 *   PUT    /api/admin/tiddler-owner         {titles: [...], owner: "<username>" | null}   (step 07b)
 *
 * Safety rules
 *   - There is always at least one active (not disabled) administrator.
 *   - Administrators cannot delete, disable or demote THEMSELVES (another admin must),
 *     so nobody locks themselves out by accident.
 *   - Groups given for users or tiddlers must exist (create the group first).
 *   - Deleting or disabling a user, or changing their password, ends their logins.
 *   - Every change is written to the server log as  ADMIN <who>: <what>.
 *
 * Changes take effect on the next request (users.json and tiddler files are re-read).
 */
const log = require('../../../../lib/log_helper');
const request = require('../../../../lib/request');
const response = require('../../../../lib/response');
const storage = require('../../../../lib/storage');
const crypto = require('../../../../lib/crypto');
const sessions = require('../../../../lib/sessions');
const users = require('../../../../lib/users');
const auth = require('../../../../lib/auth');
const acl = require('../../../../lib/acl');

const USERS_PREFIX = '/api/admin/users/';
const GROUPS_PREFIX = '/api/admin/groups/';

// The admin API manages users.json, which only exists in users mode
function usersModeOnly(handler) {
	return function(ctx) {
		if (auth.mode() !== 'users') {
			return response.error(ctx, 400, 'The admin API needs AUTH_MODE=users');
		}
		return handler(ctx);
	};
}

function audit(ctx, text) {
	log.notice(ctx, 'ADMIN ', ctx.user.username, ': ', text);
}

// JSON body as an object, or null (error already sent)
function bodyObject(ctx) {
	const body = request.jsonBody(ctx);
	if (body.error) { response.error(ctx, 400, body.error); return null; }
	if (!body.data || typeof body.data !== 'object' || Array.isArray(body.data)) {
		response.error(ctx, 400, 'Request body must be a JSON object');
		return null;
	}
	return body.data;
}

// Validate a groups list from a request. Returns { groups } or { error }
function validGroups(value) {
	if (!Array.isArray(value) || value.some(g => typeof g !== 'string')) {
		return { error: 'groups must be a list of group names' };
	}
	const bad = value.map(g => g.trim().toLowerCase()).filter(g => users.checkGroupName(g));
	if (bad.length) return { error: 'Invalid group name: ' + JSON.stringify(bad) };
	const groups = acl.cleanGroups(value); // lower case, no duplicates
	const unknown = users.unknownGroups(groups);
	if (unknown.length) return { error: 'Unknown group: ' + unknown.join(', ') + ' (create it first)' };
	return { groups };
}

// A default group that is one of the groups, else the first group, else null
function fixDefault(groups, wanted) {
	if (wanted && groups.indexOf(wanted) !== -1) return wanted;
	return groups[0] || null;
}

function nameFrom(ctx, prefix) {
	const name = request.titleFromUri(ctx, prefix);
	return name === null ? '' : users.normalizeName(name);
}

// ---------------------------------------------------------------- users

function listUsers(ctx) {
	const data = users.loadUsers();
	const list = Object.keys(data.users).sort().map(n => users.publicUser(n, data.users[n]));
	response.ok(ctx, list);
}

function createUser(ctx) {
	const b = bodyObject(ctx);
	if (!b) return;
	const name = users.normalizeName(b.username);
	const problem = users.checkUsername(name) || users.checkPassword(b.password);
	if (problem) return response.error(ctx, 400, problem);

	const data = users.loadUsers();
	if (data.users[name]) return response.error(ctx, 409, 'A user named "' + name + '" already exists');

	let groups = [];
	if (b.groups !== undefined) {
		const g = validGroups(b.groups);
		if (g.error) return response.error(ctx, 400, g.error);
		groups = g.groups;
	}
	if (b.defaultGroup && groups.indexOf(String(b.defaultGroup).toLowerCase()) === -1) {
		return response.error(ctx, 400, 'defaultGroup must be one of the user\'s groups');
	}
	data.users[name] = {
		passwordHash: crypto.hashPassword(b.password),
		groups: groups,
		defaultGroup: fixDefault(groups, b.defaultGroup ? String(b.defaultGroup).toLowerCase() : null),
		isAdmin: b.isAdmin === true,
		disabled: false,
		created: new Date().toISOString()
	};
	users.saveUsers(data);
	audit(ctx, 'created user "' + name + '"' + (b.isAdmin === true ? ' (administrator)' : '') + ' groups [' + groups.join(',') + ']');
	response.ok(ctx, { user: users.publicUser(name, data.users[name]) });
}

function updateUser(ctx) {
	const name = nameFrom(ctx, USERS_PREFIX);
	const data = users.loadUsers();
	const u = data.users[name];
	if (!u) return response.error(ctx, 404, 'No user named "' + name + '"');
	const b = bodyObject(ctx);
	if (!b) return;
	const self = name === ctx.user.username;
	const changes = [];

	if (b.isAdmin !== undefined && typeof b.isAdmin !== 'boolean') return response.error(ctx, 400, 'isAdmin must be true or false');
	if (b.disabled !== undefined && typeof b.disabled !== 'boolean') return response.error(ctx, 400, 'disabled must be true or false');

	const demoting = b.isAdmin === false && u.isAdmin;
	const disabling = b.disabled === true && !u.disabled;
	if (self && (demoting || disabling)) {
		return response.error(ctx, 400, 'You cannot ' + (demoting ? 'remove your own administrator rights' : 'disable your own account') +
			'. Ask another administrator.');
	}
	if ((demoting || disabling) && users.wouldRemoveLastAdmin(data, name)) {
		return response.error(ctx, 409, '"' + name + '" is the last active administrator and must stay one');
	}

	if (b.password !== undefined) {
		const p = users.checkPassword(b.password);
		if (p) return response.error(ctx, 400, p);
	}
	let groups = u.groups || [];
	if (b.groups !== undefined) {
		const g = validGroups(b.groups);
		if (g.error) return response.error(ctx, 400, g.error);
		groups = g.groups;
	}
	let defaultGroup = u.defaultGroup || null;
	if (b.defaultGroup !== undefined) {
		const wanted = b.defaultGroup === null || b.defaultGroup === '' ? null : String(b.defaultGroup).toLowerCase();
		if (wanted && groups.indexOf(wanted) === -1) return response.error(ctx, 400, 'defaultGroup must be one of the user\'s groups');
		defaultGroup = wanted;
	}

	// All checks passed: apply
	if (b.groups !== undefined) { u.groups = groups; changes.push('groups [' + groups.join(',') + ']'); }
	u.defaultGroup = fixDefault(groups, defaultGroup);
	if (b.defaultGroup !== undefined) changes.push('default group ' + (u.defaultGroup || 'none'));
	if (b.isAdmin !== undefined && b.isAdmin !== !!u.isAdmin) { u.isAdmin = b.isAdmin; changes.push(b.isAdmin ? 'made administrator' : 'administrator rights removed'); }
	if (b.disabled !== undefined && b.disabled !== !!u.disabled) { u.disabled = b.disabled; changes.push(b.disabled ? 'disabled' : 'enabled'); }
	if (b.password !== undefined) { u.passwordHash = crypto.hashPassword(b.password); changes.push('password changed'); }
	users.saveUsers(data);

	// End their logins when access is taken away or the password is reset by someone else
	if (u.disabled || (b.password !== undefined && !self)) sessions.destroyUser(name);
	audit(ctx, 'updated user "' + name + '": ' + (changes.join(', ') || 'no change'));
	response.ok(ctx, { user: users.publicUser(name, u) });
}

function deleteUser(ctx) {
	const name = nameFrom(ctx, USERS_PREFIX);
	const data = users.loadUsers();
	if (!data.users[name]) return response.error(ctx, 404, 'No user named "' + name + '"');
	if (name === ctx.user.username) return response.error(ctx, 400, 'You cannot delete your own account. Ask another administrator.');
	if (users.wouldRemoveLastAdmin(data, name)) {
		return response.error(ctx, 409, '"' + name + '" is the last active administrator and cannot be deleted');
	}
	delete data.users[name];
	users.saveUsers(data);
	sessions.destroyUser(name);
	audit(ctx, 'deleted user "' + name + '"');
	response.ok(ctx, { deleted: name });
}

// ---------------------------------------------------------------- groups

function usage() {
	const data = users.loadUsers();
	const all = storage.listAll();
	return function(group) {
		return {
			users: Object.keys(data.users).filter(n => (data.users[n].groups || []).indexOf(group) !== -1).length,
			tiddlers: all.filter(t => acl.tiddlerGroups(t).indexOf(group) !== -1).length
		};
	};
}

function listGroups(ctx) {
	const groups = users.loadGroups().groups;
	const count = usage();
	const list = Object.keys(groups).sort().map(name => Object.assign({
		name: name,
		description: groups[name].description || '',
		created: groups[name].created || null
	}, count(name)));
	response.ok(ctx, list);
}

function createGroup(ctx) {
	const b = bodyObject(ctx);
	if (!b) return;
	const name = typeof b.name === 'string' ? b.name.trim().toLowerCase() : '';
	const problem = users.checkGroupName(name);
	if (problem) return response.error(ctx, 400, problem);
	const description = typeof b.description === 'string' ? b.description.trim().slice(0, 500) : '';
	const data = users.loadGroups();
	if (data.groups[name]) return response.error(ctx, 409, 'A group named "' + name + '" already exists');
	data.groups[name] = { description: description, created: new Date().toISOString() };
	users.saveGroups(data);
	audit(ctx, 'created group "' + name + '"');
	response.ok(ctx, { group: Object.assign({ name: name }, data.groups[name], { users: 0, tiddlers: 0 }) });
}

function updateGroup(ctx) {
	const name = nameFrom(ctx, GROUPS_PREFIX);
	const data = users.loadGroups();
	if (!data.groups[name]) return response.error(ctx, 404, 'No group named "' + name + '"');
	const b = bodyObject(ctx);
	if (!b) return;
	if (typeof b.description !== 'string') return response.error(ctx, 400, 'description must be text');
	data.groups[name].description = b.description.trim().slice(0, 500);
	users.saveGroups(data);
	audit(ctx, 'updated description of group "' + name + '"');
	response.ok(ctx, { group: Object.assign({ name: name }, data.groups[name], usage()(name)) });
}

function deleteGroup(ctx) {
	const name = nameFrom(ctx, GROUPS_PREFIX);
	const data = users.loadGroups();
	if (!data.groups[name]) return response.error(ctx, 404, 'No group named "' + name + '"');
	const inUse = usage()(name);
	const force = request.query(ctx, 'force') === 'true';
	if ((inUse.users > 0 || inUse.tiddlers > 0) && !force) {
		return response.error(ctx, 409, 'Group "' + name + '" is used by ' + inUse.users + ' user(s) and ' +
			inUse.tiddlers + ' tiddler(s). Delete with force to remove it from all of them.');
	}

	// Remove the group from users (fixing their default group) ...
	const userData = users.loadUsers();
	let removedFromUsers = 0;
	Object.keys(userData.users).forEach(n => {
		const u = userData.users[n];
		if ((u.groups || []).indexOf(name) !== -1) {
			u.groups = u.groups.filter(g => g !== name);
			u.defaultGroup = fixDefault(u.groups, u.defaultGroup === name ? null : u.defaultGroup);
			removedFromUsers++;
		}
	});
	if (removedFromUsers) users.saveUsers(userData);

	// ... and from tiddlers (a tiddler left with no group becomes admin-only)
	let removedFromTiddlers = 0;
	storage.listAll().forEach(t => {
		const g = acl.tiddlerGroups(t);
		if (g.indexOf(name) !== -1) {
			t.groups = g.filter(x => x !== name);
			storage.put(t);
			removedFromTiddlers++;
		}
	});

	delete data.groups[name];
	users.saveGroups(data);
	audit(ctx, 'deleted group "' + name + '" (removed from ' + removedFromUsers + ' user(s), ' + removedFromTiddlers + ' tiddler(s))');
	response.ok(ctx, { deleted: name, removedFromUsers: removedFromUsers, removedFromTiddlers: removedFromTiddlers });
}

// ---------------------------------------------------------------- tiddler groups

function listTiddlers(ctx) {
	const onlyUngrouped = request.query(ctx, 'ungrouped') === 'true';
	const list = storage.listAll()
		.filter(t => !onlyUngrouped || acl.tiddlerGroups(t).length === 0)
		.sort((a, b) => a.title.localeCompare(b.title))
		.map(t => ({ title: t.title, groups: acl.tiddlerGroups(t), owner: t.owner || null, modified: t.modified, modifier: t.modifier, tags: t.tags || [] }));
	response.ok(ctx, list);
}

function setTiddlerGroups(ctx) {
	const b = bodyObject(ctx);
	if (!b) return;
	if (!Array.isArray(b.titles) || b.titles.length === 0 || b.titles.some(t => typeof t !== 'string')) {
		return response.error(ctx, 400, 'titles must be a non-empty list of tiddler titles');
	}
	const mode = b.mode || 'set';
	if (['set', 'add', 'remove'].indexOf(mode) === -1) return response.error(ctx, 400, 'mode must be "set", "add" or "remove"');
	const g = validGroups(b.groups);
	if (g.error) return response.error(ctx, 400, g.error);
	if (mode !== 'set' && g.groups.length === 0) return response.error(ctx, 400, 'give at least one group to ' + mode);

	const updated = [], notFound = [];
	b.titles.forEach(title => {
		const t = storage.get(title);
		if (!t) { notFound.push(title); return; }
		let groups = acl.tiddlerGroups(t);
		if (mode === 'set') groups = g.groups.slice();
		if (mode === 'add') groups = groups.concat(g.groups.filter(x => groups.indexOf(x) === -1));
		if (mode === 'remove') groups = groups.filter(x => g.groups.indexOf(x) === -1);
		t.groups = groups;
		storage.put(t);
		updated.push({ title: title, groups: groups });
	});
	audit(ctx, mode + ' groups [' + g.groups.join(',') + '] on ' + updated.length + ' tiddler(s)' +
		(notFound.length ? ', ' + notFound.length + ' not found' : ''));
	response.ok(ctx, { updated: updated, notFound: notFound });
}

// PUT /api/admin/tiddler-owner {titles: [...], owner: "<username>" | null}  (step 07b)
// Give tiddlers an owner (e.g. older tiddlers that have none), or remove the owner.
function setTiddlerOwner(ctx) {
	const b = bodyObject(ctx);
	if (!b) return;
	if (!Array.isArray(b.titles) || b.titles.length === 0 || b.titles.some(t => typeof t !== 'string')) {
		return response.error(ctx, 400, 'titles must be a non-empty list of tiddler titles');
	}
	let owner = null;
	if (b.owner !== null && b.owner !== undefined && b.owner !== '') {
		owner = users.normalizeName(b.owner);
		if (!users.getUser(owner)) return response.error(ctx, 400, 'No user named "' + owner + '"');
	}
	const updated = [], notFound = [];
	b.titles.forEach(title => {
		const t = storage.get(title);
		if (!t) { notFound.push(title); return; }
		if (owner) t.owner = owner; else delete t.owner;
		storage.put(t);
		updated.push({ title: title, owner: owner });
	});
	audit(ctx, 'owner ' + (owner || '(none)') + ' set on ' + updated.length + ' tiddler(s)' +
		(notFound.length ? ', ' + notFound.length + ' not found' : ''));
	response.ok(ctx, { updated: updated, notFound: notFound });
}

module.exports = {
	usersModeOnly,
	listUsers, createUser, updateUser, deleteUser,
	listGroups, createGroup, updateGroup, deleteGroup,
	listTiddlers, setTiddlerGroups, setTiddlerOwner
};
