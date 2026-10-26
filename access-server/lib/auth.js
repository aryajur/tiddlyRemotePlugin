/**
 * auth - decides whether a request may run its handler
 *
 *   auth.required(handler)  -> runs handler only for a valid caller
 *   auth.adminOnly(handler) -> runs handler only for an administrator
 *
 * Used in the route table:  { uri: ..., handler: auth.required(tiddlers.list) }
 * After the check, ctx.user = { username, groups, groupSet, defaultGroup, isAdmin }.
 *
 * AUTH_MODE=apikey : X-API-Key header must equal API_KEY (exactly like
 *                    remote-server-example). The caller counts as administrator.
 * AUTH_MODE=users  : "Authorization: Bearer <token>" from POST /api/login.
 *                    The user is re-read from users.json on EVERY request, so a
 *                    changed group, a disabled or deleted user takes effect at once.
 *                    The API key is NOT accepted in this mode.
 *
 * Lua port: same wrappers; headers via ngx.req.get_headers(), user in ngx.ctx.user.
 */
const env = require('./env_helper');
const request = require('./request');
const response = require('./response');
const sessions = require('./sessions');
const users = require('./users');

const SUPPORTED_MODES = ['apikey', 'users'];

function mode() {
	return env.get('AUTH_MODE');
}

// The caller as seen by handlers
function makeUser(username, record) {
	const groups = Array.isArray(record.groups) ? record.groups : [];
	const groupSet = {};
	groups.forEach(g => { groupSet[g] = true; });
	return {
		username: username,
		groups: groups,
		groupSet: groupSet,
		defaultGroup: record.defaultGroup || null,
		isAdmin: !!record.isAdmin
	};
}

// Identify the caller. Returns null (and has already replied with 401) if not allowed.
function identify(ctx) {
	if (mode() === 'apikey') {
		const key = env.get('API_KEY');
		if (key && ctx.req.get('x-api-key') !== key) {
			response.error(ctx, 401, 'Unauthorized');
			return null;
		}
		return makeUser('apikey', { isAdmin: true, groups: [] });
	}

	if (mode() === 'users') {
		const token = request.bearerToken(ctx);
		if (!token) {
			response.error(ctx, 401, 'Login required');
			return null;
		}
		const username = sessions.get(token);
		if (!username) {
			response.error(ctx, 401, 'Session expired or invalid, please log in');
			return null;
		}
		const record = users.getUser(username);
		if (!record || record.disabled) {
			sessions.destroy(token);
			response.error(ctx, 401, 'Session expired or invalid, please log in');
			return null;
		}
		ctx.token = token;
		return makeUser(username, record);
	}

	response.error(ctx, 500, "AUTH_MODE '" + mode() + "' is not supported");
	return null;
}

function required(handler) {
	return function(ctx) {
		const user = identify(ctx);
		if (!user) return;
		ctx.user = user;
		return handler(ctx);
	};
}

function adminOnly(handler) {
	return function(ctx) {
		const user = identify(ctx);
		if (!user) return;
		if (!user.isAdmin) {
			return response.error(ctx, 403, 'Administrator only');
		}
		ctx.user = user;
		return handler(ctx);
	};
}

module.exports = { required, adminOnly, mode, SUPPORTED_MODES };
