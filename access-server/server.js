/**
 * TiddlyWiki Access Server - process start-up
 * Node.js counterpart of nginx.conf: listen on a port, read request bodies,
 * and hand EVERY request to root.js. No routing or logic lives here.
 *
 * Start:   npm start                         (port 3001, data in ./data, API-key mode)
 *          PORT=3002 DATA_DIR=../tmp/access-data npm start
 *          AUTH_MODE=users DATA_DIR=../tmp/access-users npm start   (username/password login)
 */
const express = require('express');
const env = require('./lib/env_helper');
const log = require('./lib/log_helper');
const response = require('./lib/response');
const storage = require('./lib/storage');
const auth = require('./lib/auth');
const users = require('./lib/users');
const sessions = require('./lib/sessions');
const root = require('./root');

function createApp() {
	const app = express();
	app.disable('x-powered-by');

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
			if (users.userCount() === 0) {
				console.log('\nNO USERS YET. Create the first administrator from THIS computer:');
				console.log('  curl -X POST http://localhost:' + port + '/api/setup -H "Content-Type: application/json" \\');
				console.log('       -d \'{"username":"admin","password":"choose-a-strong-password"}\'');
			}
		}
		console.log('\nAPI Endpoints (replies use the {RESP, CODE, MSG, DATA, META} envelope):');
		console.log('  POST   /api/setup             - Create the first administrator (users mode)');
		console.log('  POST   /api/login             - Log in, returns a token (users mode)');
		console.log('  POST   /api/logout            - Log out');
		console.log('  GET    /api/me                - Who am I');
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
