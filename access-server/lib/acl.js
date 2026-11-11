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
 * and are written ONLY by the server (handlers/tiddlers.js). Who may change them
 * and who may delete a tiddler: see "Ownership" below (owner + administrators).
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

// ---- Ownership (step 07b) ------------------------------------------------
// A tiddler's owner is the user who first stored it on the server ("owner" in
// its file, set by the server, never by a request). Older tiddlers have no owner.

function isOwner(user, tiddler) {
	return !!user && !!tiddler && typeof tiddler.owner === 'string' && tiddler.owner === user.username;
}

// May this user delete it? Owner or administrator (and they must be able to access it).
// Returns null if allowed, else { status, error }.
function deleteProblem(user, tiddler) {
	if (user.isAdmin || isOwner(user, tiddler)) return null;
	return { status: 403, error: tiddler.owner ?
		'Only the owner ("' + tiddler.owner + '") or an administrator can delete this tiddler' :
		'Only an administrator can delete this tiddler (it has no owner)' };
}

// New groups for an EXISTING tiddler, requested by user.
//   admin : exactly the requested (valid) groups, [] allowed (= admin-only)
//   owner : the requested groups must all be the owner's own groups; groups the owner is
//           NOT in that the tiddler already has are kept (an owner cannot remove a group
//           an administrator added for other people). At least one group must remain.
//   others: refused.
// Returns { groups } or { status, error }.
function groupsForChange(user, tiddler, requested) {
	const wanted = cleanGroups(requested);
	if (user.isAdmin) return { groups: wanted };
	if (!isOwner(user, tiddler)) {
		return { status: 403, error: 'Only the owner or an administrator can change the groups of this tiddler' };
	}
	const notMine = wanted.filter(g => !isMember(user, g));
	if (notMine.length) {
		return { status: 400, error: 'You can only choose groups you are a member of (not: ' + notMine.join(', ') + ')' };
	}
	const kept = tiddlerGroups(tiddler).filter(g => !isMember(user, g));
	const groups = wanted.concat(kept.filter(g => wanted.indexOf(g) === -1));
	if (groups.length === 0) return { status: 400, error: 'Choose at least one group' };
	return { groups };
}

function sameGroups(a, b) {
	const x = cleanGroups(a).slice().sort(), y = cleanGroups(b).slice().sort();
	return x.length === y.length && x.every((g, i) => g === y[i]);
}

module.exports = { canAccess, cleanGroups, groupsForNew, tiddlerGroups, isOwner, deleteProblem, groupsForChange, sameGroups };
