/**
 * response - every reply in the standard envelope
 *
 *     { "RESP": "OK" | "ERROR", "CODE": <http status>, "MSG": "...", "DATA": ..., "META": { "request_id": "..." } }
 *
 * Handlers never write JSON themselves; they call response.ok() or response.error().
 * The plugin (v1.10.0+) reads DATA from this envelope via config.extensions.RemoteStorage.unwrap().
 *
 * Lua port: same functions without the ctx argument (ngx.status, ngx.header, ngx.say),
 * plus response.array() because cjson encodes an empty Lua table as {} instead of [].
 */
const log = require('./log_helper');

function send(ctx, status, resp, msg, data) {
	if (ctx.res.headersSent) {
		// A reply was already sent (should not happen); never send two
		log.error(ctx, 'Reply already sent, dropping: ', resp, ' ', status, ' ', msg || '');
		return;
	}
	ctx.res.status(status);
	ctx.res.set('Content-Type', 'application/json; charset=utf-8');
	ctx.res.send(JSON.stringify({
		RESP: resp,
		CODE: status,
		MSG: msg || '',
		DATA: data === undefined ? {} : data,
		META: { request_id: ctx.requestId }
	}));
}

// Success reply; data becomes DATA
function ok(ctx, data, msg) {
	send(ctx, 200, 'OK', msg, data);
}

// Error reply; DATA is always {}
function error(ctx, status, msg) {
	send(ctx, status, 'ERROR', msg || 'Internal server error', {});
}

module.exports = { ok, error, send };
