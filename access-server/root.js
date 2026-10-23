/**
 * TiddlyWiki Access Server - Request entry point
 * Node.js counterpart of root_for_reference.lua (same structure, for a 1:1 OpenResty port later)
 *
 * Every request comes here. It:
 *   1. adds CORS headers and answers browser pre-flight (OPTIONS) requests
 *   2. logs the request
 *   3. loads controllers/<domain.path>/controller.js (an ordered route list)
 *   4. runs the FIRST route whose uri pattern matches - errors become a JSON 500
 *   5. answers 404 in the envelope if nothing matched
 */
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const env = require('./lib/env_helper');
const log = require('./lib/log_helper');
const response = require('./lib/response');

const controllersLoc = path.join(__dirname, 'controllers');

const domain = {
	name: env.get('SUBDOMAIN') + '.' + env.get('DOMAIN'),
	path: 'tiddly/remote/'
};

// Per-request state (Lua: ngx.var / ngx.ctx)
function newContext(req, res) {
	const rawPath = req.url.split('?')[0];
	return {
		req: req,
		res: res,
		method: req.method,
		rawPath: rawPath,   // still %-encoded: used to read tiddler titles exactly
		uri: rawPath,       // used for route matching
		requestId: crypto.randomBytes(16).toString('hex'),
		user: null          // set by auth.required()
	};
}

// The plugin runs from file:// or another origin, so browsers need these headers
function applyCors(ctx) {
	ctx.res.set('Access-Control-Allow-Origin', env.get('CORS_ORIGIN'));
	ctx.res.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
	ctx.res.set('Access-Control-Allow-Headers', 'Content-Type, X-API-Key, Authorization');
}

function handle(req, res) {
	const ctx = newContext(req, res);
	applyCors(ctx);

	// Browser pre-flight before PUT/DELETE or custom headers: answer it, nothing else to do
	if (ctx.method === 'OPTIONS') {
		res.status(204).end();
		return;
	}

	log.info(ctx, 'REQUEST ', req.headers.host || '-', ' ', ctx.method, ' URI: ', ctx.uri);

	const controllerFile = path.join(controllersLoc, domain.path, 'controller.js');
	if (fs.existsSync(controllerFile)) {
		let controller;
		try {
			controller = require(controllerFile);
		} catch (err) {
			log.error(ctx, 'ERROR LOADING CONTROLLER: ', err.stack || String(err));
			response.error(ctx, 500, 'Failed to load controller');
			return;
		}

		if (Array.isArray(controller)) {
			for (const route of controller) {
				if (route.uri.test(ctx.uri)) {
					log.notice(ctx, 'Handler: ', String(route.uri));
					try {
						route.handler(ctx);
					} catch (err) {
						log.error(ctx, 'Handler error: ', err.stack || String(err));
						response.error(ctx, 500, 'Internal server error');
					}
					return;
				}
			}
		}
	}

	// No handler matched
	response.error(ctx, 404, 'Endpoint not found');
}

module.exports = { handle, newContext, applyCors };
