/**
 * log_helper - log lines prefixed with the request id
 *
 * Same idea as log.build_context() in root_for_reference.lua:
 *     ngx.log(ngx.INFO, log.build_context(), "REQUEST ", host, " URI: ", uri)
 * becomes
 *     log.info(ctx, 'REQUEST ', host, ' URI: ', uri)
 *
 * Lua port: build_context() reads ngx.var.request_id; the level functions map to
 * ngx.log(ngx.ERR / ngx.WARN / ngx.NOTICE / ngx.INFO, ...).
 */

// "[req=<id>] " - lets you find every log line of one request
function build_context(ctx) {
	return '[req=' + ((ctx && ctx.requestId) || '-') + '] ';
}

function write(level, ctx, parts) {
	const line = new Date().toISOString() + ' ' + level + ' ' + build_context(ctx) + parts.join('');
	if (level === 'ERROR' || level === 'WARN') {
		console.error(line);
	} else {
		console.log(line);
	}
}

module.exports = {
	build_context,
	error: (ctx, ...parts) => write('ERROR', ctx, parts),
	warn: (ctx, ...parts) => write('WARN', ctx, parts),
	notice: (ctx, ...parts) => write('NOTICE', ctx, parts),
	info: (ctx, ...parts) => write('INFO', ctx, parts)
};
