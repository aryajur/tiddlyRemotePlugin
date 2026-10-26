/**
 * sessions - login tokens kept in memory
 *
 *   create(username) -> token          (valid for SESSION_TTL seconds, default 8 hours)
 *   get(token)       -> username|null  (null when unknown or expired)
 *   destroy(token)                      (logout)
 *   destroyUser(username)               (user deleted/disabled: log out everywhere)
 *
 * Restarting the server logs everybody out - accepted (roadmap Decision D7).
 *
 * Lua port: ngx.shared.sessions (lua_shared_dict) with set(token, username, ttl).
 */
const crypto = require('./crypto');
const env = require('./env_helper');

const sessions = new Map(); // token -> { username, expires }

function ttlSeconds() {
	const ttl = parseInt(env.get('SESSION_TTL'), 10);
	return ttl > 0 ? ttl : 28800;
}

function removeExpired() {
	const now = Date.now();
	for (const [token, s] of sessions) {
		if (s.expires <= now) sessions.delete(token);
	}
}

function create(username) {
	removeExpired();
	const token = crypto.newToken();
	sessions.set(token, { username: username, expires: Date.now() + ttlSeconds() * 1000 });
	return token;
}

function get(token) {
	if (typeof token !== 'string' || token === '') return null;
	const s = sessions.get(token);
	if (!s) return null;
	if (s.expires <= Date.now()) {
		sessions.delete(token);
		return null;
	}
	return s.username;
}

function destroy(token) {
	sessions.delete(token);
}

function destroyUser(username) {
	for (const [token, s] of sessions) {
		if (s.username === username) sessions.delete(token);
	}
}

module.exports = { create, get, destroy, destroyUser, ttlSeconds };
