/**
 * users - users.json and groups.json in DATA_DIR
 *
 *   users.json   { "version": 1, "users":  { "<username>": { passwordHash, groups, defaultGroup,
 *                                                            isAdmin, disabled, created } } }
 *   groups.json  { "version": 1, "groups": { "<name>": { description, created } } }
 *
 * The files are read on EVERY call (no caching), so a change - by the admin API,
 * the users CLI or by hand - takes effect on the very next request.
 * Usernames are stored and looked up in lower case ("Alice" and "alice" are the same user).
 *
 * Lua port: same functions with cjson + fileio.
 */
const path = require('path');
const storage = require('./storage');
const fileio = require('./fileio');

const USERNAME_RULE = /^[a-z0-9_.-]{3,32}$/;      // after lower-casing
const GROUP_NAME_RULE = /^[a-z0-9_.-]{2,32}$/;
const MIN_PASSWORD = 8;
const MAX_PASSWORD = 1024;

function usersFile() { return path.join(storage.dataDir(), 'users.json'); }
function groupsFile() { return path.join(storage.dataDir(), 'groups.json'); }

function readJson(file, emptyValue) {
	const text = fileio.read(file);
	if (text === null) return emptyValue;
	return JSON.parse(text); // a broken file is an error worth seeing (500 + log), not silently "no users"
}

function loadUsers() {
	const data = readJson(usersFile(), { version: 1, users: {} });
	if (!data.users || typeof data.users !== 'object') data.users = {};
	return data;
}

function saveUsers(data) {
	fileio.writeSafe(usersFile(), JSON.stringify(data, null, 2));
}

function loadGroups() {
	const data = readJson(groupsFile(), { version: 1, groups: {} });
	if (!data.groups || typeof data.groups !== 'object') data.groups = {};
	return data;
}

function saveGroups(data) {
	fileio.writeSafe(groupsFile(), JSON.stringify(data, null, 2));
}

function normalizeName(name) {
	return typeof name === 'string' ? name.trim().toLowerCase() : '';
}

// The stored user record (with passwordHash) or null
function getUser(username) {
	const users = loadUsers().users;
	const key = normalizeName(username);
	return Object.prototype.hasOwnProperty.call(users, key) ? users[key] : null;
}

function userCount() {
	return Object.keys(loadUsers().users).length;
}

// What may be sent to a browser: never the password hash
function publicUser(username, user) {
	return {
		username: username,
		groups: user.groups || [],
		defaultGroup: user.defaultGroup || null,
		isAdmin: !!user.isAdmin,
		disabled: !!user.disabled,
		created: user.created || null
	};
}

// Validation helpers: return an error message, or null if fine
function checkUsername(name) {
	return USERNAME_RULE.test(name) ? null :
		'Username must be 3-32 characters: letters, digits, "_", "." or "-"';
}

function checkPassword(password) {
	if (typeof password !== 'string' || password.length < MIN_PASSWORD) {
		return 'Password must be at least ' + MIN_PASSWORD + ' characters';
	}
	if (password.length > MAX_PASSWORD) return 'Password is too long';
	return null;
}

function checkGroupName(name) {
	return GROUP_NAME_RULE.test(name) ? null :
		'Group name must be 2-32 characters: letters, digits, "_", "." or "-"';
}

// Make sure groups.json exists (empty) so admins can see where groups live
function ensureGroupsFile() {
	if (fileio.read(groupsFile()) === null) saveGroups({ version: 1, groups: {} });
}

// Number of administrators that are not disabled (in a loaded users.json)
function activeAdminCount(data) {
	return Object.keys(data.users).filter(n => data.users[n].isAdmin && !data.users[n].disabled).length;
}

// Would this change leave NO active administrator? (target is currently an active admin
// and is being deleted, disabled or demoted). Used by the admin API and the users CLI.
function wouldRemoveLastAdmin(data, name) {
	const u = data.users[name];
	return !!u && u.isAdmin && !u.disabled && activeAdminCount(data) <= 1;
}

// Names in the list that are not in groups.json ([] if all exist)
function unknownGroups(list) {
	const existing = loadGroups().groups;
	return (list || []).filter(g => !Object.prototype.hasOwnProperty.call(existing, g));
}

module.exports = {
	usersFile, groupsFile, loadUsers, saveUsers, loadGroups, saveGroups, ensureGroupsFile,
	normalizeName, getUser, userCount, publicUser, checkUsername, checkPassword, checkGroupName,
	activeAdminCount, wouldRemoveLastAdmin, unknownGroups
};
