/**
 * Login endpoints (AUTH_MODE=users)
 *
 *   POST /api/setup   {username, password} -> create the FIRST administrator
 *                     only while no user exists, and only from this computer
 *                     (unless SETUP_ALLOW_REMOTE=true). DATA: { token, user }
 *   POST /api/login   {username, password} -> DATA: { token, user, expiresIn }
 *   POST /api/logout  (logged in)          -> ends this login
 *   GET  /api/me      (logged in)          -> DATA: the current user
 *
 * Wrong username and wrong password give the SAME reply, so nobody can find out
 * which usernames exist.
 */
const env = require('../../../../lib/env_helper');
const log = require('../../../../lib/log_helper');
const request = require('../../../../lib/request');
const response = require('../../../../lib/response');
const crypto = require('../../../../lib/crypto');
const sessions = require('../../../../lib/sessions');
const users = require('../../../../lib/users');
const auth = require('../../../../lib/auth');

const NOT_IN_USERS_MODE = 'User login is not enabled on this server (AUTH_MODE=apikey)';

// Read {username, password} from the body; returns { username, password } or { error }
function credentials(ctx) {
	const body = request.jsonBody(ctx);
	if (body.error) return { error: body.error };
	const data = body.data || {};
	if (typeof data.username !== 'string' || typeof data.password !== 'string' ||
	    data.username.trim() === '' || data.password === '') {
		return { error: 'username and password are required' };
	}
	return { username: users.normalizeName(data.username), password: data.password };
}

function setup(ctx) {
	if (auth.mode() !== 'users') return response.error(ctx, 400, NOT_IN_USERS_MODE);

	if (users.userCount() > 0) {
		return response.error(ctx, 409, 'Setup already done: an administrator exists. Log in instead.');
	}
	if (!request.isLocal(ctx) && env.get('SETUP_ALLOW_REMOTE') !== 'true') {
		return response.error(ctx, 403, 'First-time setup is only allowed from the server computer itself');
	}

	const c = credentials(ctx);
	if (c.error) return response.error(ctx, 400, c.error);
	const problem = users.checkUsername(c.username) || users.checkPassword(c.password);
	if (problem) return response.error(ctx, 400, problem);

	const data = users.loadUsers();
	data.users[c.username] = {
		passwordHash: crypto.hashPassword(c.password),
		groups: [],
		defaultGroup: null,
		isAdmin: true,
		disabled: false,
		created: new Date().toISOString()
	};
	users.saveUsers(data);
	users.ensureGroupsFile();
	log.notice(ctx, 'SETUP: first administrator "', c.username, '" created');

	const token = sessions.create(c.username);
	response.ok(ctx, {
		token: token,
		user: users.publicUser(c.username, data.users[c.username]),
		expiresIn: sessions.ttlSeconds()
	});
}

function login(ctx) {
	if (auth.mode() !== 'users') return response.error(ctx, 400, NOT_IN_USERS_MODE);

	const c = credentials(ctx);
	if (c.error) return response.error(ctx, 400, c.error);

	const record = users.getUser(c.username);
	if (!record) {
		crypto.burnTime(c.password); // same response time as a wrong password
		log.warn(ctx, 'LOGIN FAILED: unknown user "', c.username, '"');
		return response.error(ctx, 401, 'Invalid username or password');
	}
	if (!crypto.verifyPassword(c.password, record.passwordHash)) {
		log.warn(ctx, 'LOGIN FAILED: wrong password for "', c.username, '"');
		return response.error(ctx, 401, 'Invalid username or password');
	}
	if (record.disabled) {
		log.warn(ctx, 'LOGIN REFUSED: account disabled "', c.username, '"');
		return response.error(ctx, 403, 'This account is disabled. Ask an administrator.');
	}

	const token = sessions.create(c.username);
	log.notice(ctx, 'LOGIN: "', c.username, '"');
	response.ok(ctx, {
		token: token,
		user: users.publicUser(c.username, record),
		expiresIn: sessions.ttlSeconds()
	});
}

function logout(ctx) {
	if (ctx.token) {
		sessions.destroy(ctx.token);
		log.notice(ctx, 'LOGOUT: "', ctx.user.username, '"');
	}
	response.ok(ctx, {});
}

function me(ctx) {
	if (auth.mode() !== 'users') {
		return response.ok(ctx, { username: ctx.user.username, groups: [], defaultGroup: null, isAdmin: true, authMode: 'apikey' });
	}
	const record = users.getUser(ctx.user.username);
	response.ok(ctx, Object.assign(users.publicUser(ctx.user.username, record), { authMode: 'users' }));
}

module.exports = { setup, login, logout, me };
