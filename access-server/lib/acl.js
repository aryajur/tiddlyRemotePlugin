/**
 * acl - who may access which tiddler (all permission rules in one place)
 *
 * THE RULE
 *   A user may see / open / search / save / delete a tiddler if they share at
 *   least one group with it. Administrators may access everything.
 *   A tiddler with NO group is admin-only (UNGROUPED_POLICY=admin, the default),
 *   or visible to every logged-in user (UNGROUPED_POLICY=everyone).
 *
 * Groups of a tiddler are stored in its file as  "groups": ["hr", ...]
 * and are written ONLY by the server (handlers/tiddlers.js), never taken from
 * a normal user's request.
 *
 * In AUTH_MODE=apikey the caller is an administrator, so nothing changes there.
 *
 * Lua port: same three functions (user.groupSet is a Lua table used as a set).
 */
const env = require('./env_helper');
const users = require('./users');

function tiddlerGroups(tiddler) {
	return tiddler && Array.isArray(tiddler.groups) ? tiddler.groups : [];
}

function isMember(user, group) {
	return Object.prototype.hasOwnProperty.call(user.groupSet || {}, group) && user.groupSet[group] === true;
}

// May this user access this tiddler (a stored tiddler, or a list entry with .groups)?
function canAccess(user, tiddler) {
	if (!user || !tiddler) return false;
	if (user.isAdmin) return true;
	const groups = tiddlerGroups(tiddler);
	if (groups.length === 0) {
		return env.get('UNGROUPED_POLICY') === 'everyone';
	}
	return groups.some(g => isMember(user, g));
}

// Clean a list of group names from a request: lower case, valid names, no duplicates
function cleanGroups(list) {
	if (!Array.isArray(list)) return [];
	const result = [];
	list.forEach(g => {
		const name = typeof g === 'string' ? g.trim().toLowerCase() : '';
		if (name && !users.checkGroupName(name) && result.indexOf(name) === -1) result.push(name);
	});
	return result;
}

// Groups for a NEW tiddler created by this user.
//   admin : exactly what was requested (may be [] = admin-only)
//   others: the requested groups the user belongs to; if none, the user's
//           default group (or first group). [] means the user is in no group.
function groupsForNew(user, requested) {
	const wanted = cleanGroups(requested);
	if (user.isAdmin) return wanted;
	const allowed = wanted.filter(g => isMember(user, g));
	if (allowed.length > 0) return allowed;
	if (user.defaultGroup && isMember(user, user.defaultGroup)) return [user.defaultGroup];
	const first = (user.groups || []).find(g => isMember(user, g));
	return first ? [first] : [];
}

module.exports = { canAccess, cleanGroups, groupsForNew, tiddlerGroups };
