/**
 * Route table for the tiddly/remote domain - the same shape root.lua expects:
 * an ordered list of { uri = <pattern>, handler = <function> }.
 *
 * root.js runs the FIRST route whose pattern matches the URL path, so:
 *   - put more specific routes first ("/api/tiddlers/<title>" before "/api/tiddlers")
 *   - anchor every pattern with ^ and $
 * HTTP methods are chosen inside the route with request.dispatch(), not in root.js.
 *
 * Lua port: the same list with Lua patterns, e.g. "^/api/tiddlers/.+$"
 * (escape "-" as "%-" in Lua patterns).
 */
const auth = require('../../../lib/auth');
const request = require('../../../lib/request');
const health = require('./handlers/health');
const session = require('./handlers/session');
const tiddlers = require('./handlers/tiddlers');
const search = require('./handlers/search');

module.exports = [
	{ uri: /^\/health$/,           handler: health.handle },

	// Login (step 04). setup and login need no login themselves.
	{ uri: /^\/api\/setup$/,       handler: request.dispatch({ POST: session.setup }) },
	{ uri: /^\/api\/login$/,       handler: request.dispatch({ POST: session.login }) },
	{ uri: /^\/api\/logout$/,      handler: auth.required(request.dispatch({ POST: session.logout })) },
	{ uri: /^\/api\/me$/,          handler: auth.required(request.dispatch({ GET: session.me })) },

	// Tiddlers
	{ uri: /^\/api\/search$/,      handler: auth.required(request.dispatch({ GET: search.handle })) },
	{ uri: /^\/api\/tiddlers\/.+$/, handler: auth.required(request.dispatch({
		GET: tiddlers.get,
		PUT: tiddlers.put,
		DELETE: tiddlers.remove
	})) },
	{ uri: /^\/api\/tiddlers$/,    handler: auth.required(request.dispatch({ GET: tiddlers.list })) }
];
