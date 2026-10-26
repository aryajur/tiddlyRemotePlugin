/**
 * GET /health - is the server alive? (no authentication, like remote-server-example)
 *
 * setupRequired: true when AUTH_MODE=users and no user exists yet
 * (the admin panel uses it to show the "create first administrator" screen).
 */
const env = require('../../../../lib/env_helper');
const response = require('../../../../lib/response');
const storage = require('../../../../lib/storage');
const users = require('../../../../lib/users');

function handle(ctx) {
	const authMode = env.get('AUTH_MODE');
	response.ok(ctx, {
		status: 'ok',
		dataDir: storage.dataDir(),
		authMode: authMode,
		setupRequired: authMode === 'users' && users.userCount() === 0
	});
}

module.exports = { handle };
