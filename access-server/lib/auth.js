/**
 * auth - decides whether a request may run its handler
 *
 *   auth.required(handler) -> wrapped handler that checks credentials first
 *
 * Used in the route table:  { uri: ..., handler: auth.required(tiddlers.list) }
 *
 * Step 03 supports AUTH_MODE=apikey only: exactly the check remote-server-example
 * does (X-API-Key header must equal API_KEY). The caller is then treated as an
 * administrator, so later permission code needs no special case for this mode.
 * AUTH_MODE=users (login + groups) is added in step 04.
 *
 * Lua port: same wrapper; header via ngx.req.get_headers()["x-api-key"], user in ngx.ctx.user.
 */
const env = require('./env_helper');
const response = require('./response');

const SUPPORTED_MODES = ['apikey'];

function required(handler) {
	return function(ctx) {
		const mode = env.get('AUTH_MODE');
		if (mode === 'apikey') {
			const key = env.get('API_KEY');
			if (key && ctx.req.get('x-api-key') !== key) {
				return response.error(ctx, 401, 'Unauthorized');
			}
			ctx.user = { username: 'apikey', groups: [], isAdmin: true };
			return handler(ctx);
		}
		return response.error(ctx, 500, "AUTH_MODE '" + mode + "' is not supported");
	};
}

module.exports = { required, SUPPORTED_MODES };
