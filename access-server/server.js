/**
 * TiddlyWiki Access Server - process start-up
 * Node.js counterpart of nginx.conf: listen on a port, read request bodies,
 * and hand EVERY request to root.js. No routing or logic lives here.
 *
 * Start:   npm start                         (port 3001, data in ./data, API-key mode)
 *          PORT=3002 DATA_DIR=../tmp/access-data npm start
 *          AUTH_MODE=users DATA_DIR=../tmp/access-users npm start   (username/password login)
 *
 * Admin panel (step 08): http://localhost:3001/admin/  - plain files from public/admin/
 */
const path = require('path');
const express = require('express');
const env = require('./lib/env_helper');
const log = require('./lib/log_helper');
const response = require('./lib/response');
const storage = require('./lib/storage');
const auth = require('./lib/auth');
const users = require('./lib/users');
const sessions = require('./lib/sessions');
const root = require('./root');

// Admin panel (step 08): static files, same origin as the API (no CORS needed, roadmap D14).
// Lua port: "location /admin/ { root html; }" in nginx.conf, with the same headers.
const ADMIN_DIR = path.join(__dirname, 'public', 'admin');
const ADMIN_HEADERS = {
	// Only our own script and stylesheet may run, the page cannot be framed,
	// and fetch() may only talk to this server. A tiddler title like
	// <img src=x onerror=alert(1)> can therefore never run code in the panel.
	'Content-Security-Policy': "default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; " +
		"img-src 'self'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'",
	'X-Content-Type-Options': 'nosniff',
	'X-Frame-Options': 'DENY',
	'Referrer-Policy': 'no-referrer',
	'Cache-Control': 'no-cache'
};

function createApp() {
	const app = express();
	app.disable('x-powered-by');

	// /admin -> /admin/ (redirect), /admin/ -> index.html, /admin/admin.js ...
	// Anything not found falls through to root.js (404 in the envelope).
	app.use('/admin', (req, res, next) => { res.set(ADMIN_HEADERS); next(); },
		express.static(ADMIN_DIR, { index: 'index.html', redirect: true, dotfiles: 'ignore', fallthrough: true }));

	// Read every request body as raw bytes, max 50 MB (same limit as remote-server-example).
	// Handlers decode JSON themselves (lib/request.js), like the Lua version will.
	app.use(express.raw({ type: () => true, limit: '50mb' }));

	// Everything goes through the entry point
	app.use((req, res) => root.handle(req, res));

	// Body too large or unreadable: reply in the envelope instead of Express' HTML page
	app.use((err, req, res, next) => {
		const ctx = root.newContext(req, res);
		root.applyCors(ctx);
		const status = err.status || err.statusCode || 400;
		log.warn(ctx, 'Request rejected: ', err.message);
		response.error(ctx, status, status === 413 ? 'Request body too large' : 'Could not read request body');
	});

	return app;
}

function start() {
	const mode = env.get('AUTH_MODE');
	if (auth.SUPPORTED_MODES.indexOf(mode) === -1) {
		console.error("Unsupported AUTH_MODE '" + mode + "'. Supported: " + auth.SUPPORTED_MODES.join(', '));
		process.exit(1);
	}

	const ungrouped = env.get('UNGROUPED_POLICY');
	if (ungrouped !== 'admin' && ungrouped !== 'everyone') {
		console.error("Unsupported UNGROUPED_POLICY '" + ungrouped + "'. Use 'admin' or 'everyone'.");
		process.exit(1);
	}

	storage.ensureDirs();
	const port = parseInt(env.get('PORT'), 10);

	createApp().listen(port, () => {
		console.log('TiddlyWiki Access Server running on http://localhost:' + port);
		console.log('Data directory: ' + storage.dataDir());
		console.log('Auth mode: ' + mode);
		if (mode === 'apikey') {
			const key = env.get('API_KEY');
			console.log('API Key required: ' + !!key);
			if (key === env.DEFAULTS.API_KEY) {
				console.log('WARNING: using the default API key. Set API_KEY for anything but local testing.');
			}
		}
		if (mode === 'users') {
			console.log('Users file: ' + users.usersFile());
			console.log('Login valid for: ' + sessions.ttlSeconds() + ' seconds');
			console.log('Group access: users see only tiddlers of their groups; tiddlers without a group: ' +
				(ungrouped === 'admin' ? 'administrators only' : 'every logged-in user') + ' (UNGROUPED_POLICY=' + ungrouped + ')');
			if (users.userCount() === 0) {
				console.log('\nNO USERS YET. Create the first administrator from THIS computer:');
				console.log('  curl -X POST http://localhost:' + port + '/api/setup -H "Content-Type: application/json" \\');
				console.log('       -d \'{"username":"admin","password":"choose-a-strong-password"}\'');
				console.log('  or open http://localhost:' + port + '/admin/ in a browser on THIS computer.');
			}
			console.log('Admin panel: http://localhost:' + port + '/admin/');
		}
		console.log('\nAPI Endpoints (replies use the {RESP, CODE, MSG, DATA, META} envelope):');
		console.log('  POST   /api/setup             - Create the first administrator (users mode)');
		console.log('  POST   /api/login             - Log in, returns a token (users mode)');
		console.log('  POST   /api/logout            - Log out');
		console.log('  GET    /api/me                - Who am I');
		console.log('  GET    /api/me/access         - My groups, tiddlers I own, tiddlers I can access');
		console.log('  PUT    /api/me/tiddler-groups - Change the groups of a tiddler I own');
		console.log('  *      /api/admin/...         - Users, groups, tiddler groups (administrators, users mode)');
		console.log('  GET    /api/tiddlers          - List all tiddlers');
		console.log('  GET    /api/tiddlers/:title   - Get a specific tiddler');
		console.log('  PUT    /api/tiddlers/:title   - Create/update a tiddler');
		console.log('  DELETE /api/tiddlers/:title   - Delete a tiddler');
		console.log('  GET    /api/search?q=query    - Search tiddlers');
		console.log('  GET    /health                - Health check');
	});
}

if (require.main === module) {
	start();
}

module.exports = { createApp };
