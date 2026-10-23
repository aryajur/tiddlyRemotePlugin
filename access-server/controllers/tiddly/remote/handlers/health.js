/**
 * GET /health - is the server alive? (no authentication, like remote-server-example)
 */
const env = require('../../../../lib/env_helper');
const response = require('../../../../lib/response');
const storage = require('../../../../lib/storage');

function handle(ctx) {
	response.ok(ctx, {
		status: 'ok',
		dataDir: storage.dataDir(),
		authMode: env.get('AUTH_MODE')
	});
}

module.exports = { handle };
