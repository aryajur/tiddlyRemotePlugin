/**
 * request - helpers to read the incoming request
 *
 *   jsonBody(ctx)           -> { data } or { error }   (decode the JSON body)
 *   titleFromUri(ctx, pre)  -> title or null          (tiddler title from the raw URL)
 *   query(ctx, name)        -> query string value or ''
 *   dispatch({GET: f, ...}) -> handler that picks f by HTTP method (405 otherwise)
 *
 * Lua port: ngx.req.read_body() + get_body_data() (fallback get_body_file()) + cjson.decode,
 * ngx.var.request_uri + ngx.unescape_uri, ngx.req.get_uri_args(), ngx.req.get_method().
 */
const response = require('./response');

// Decode the request body as JSON. Express has already read it as raw bytes (server.js).
function jsonBody(ctx) {
	const body = ctx.req.body;
	if (!Buffer.isBuffer(body) || body.length === 0) {
		return { error: 'Request body is empty' };
	}
	try {
		return { data: JSON.parse(body.toString('utf8')) };
	} catch (e) {
		return { error: 'Invalid JSON in request body' };
	}
}

// Tiddler title from the RAW url path, e.g. "/api/tiddlers/a%2Fb" -> "a/b".
// The raw path keeps an encoded "/" (%2F) inside the title intact.
function titleFromUri(ctx, prefix) {
	if (!ctx.rawPath.startsWith(prefix)) return null;
	const encoded = ctx.rawPath.slice(prefix.length);
	if (encoded === '') return null;
	try {
		return decodeURIComponent(encoded);
	} catch (e) {
		return null; // malformed %-encoding
	}
}

// Value of a query string parameter, e.g. query(ctx, 'q') for /api/search?q=abc
function query(ctx, name) {
	const value = new URL(ctx.req.url, 'http://localhost').searchParams.get(name);
	return value === null ? '' : value;
}

// The route table matches on URL only (as root.lua does); this picks the function per method
function dispatch(handlers) {
	return function(ctx) {
		const handler = handlers[ctx.method];
		if (!handler) {
			return response.error(ctx, 405, 'Method not allowed');
		}
		return handler(ctx);
	};
}

module.exports = { jsonBody, titleFromUri, query, dispatch };
