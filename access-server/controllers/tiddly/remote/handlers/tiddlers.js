/**
 * Tiddler endpoints - same behaviour as remote-server-example, replies in the envelope
 *
 *   GET    /api/tiddlers          list   -> DATA: [ {title, modified, modifier, tags} ]
 *   GET    /api/tiddlers/<title>  get    -> DATA: the tiddler
 *   PUT    /api/tiddlers/<title>  put    -> DATA: { success: true, tiddler }
 *   DELETE /api/tiddlers/<title>  remove -> DATA: { success: true }
 */
const request = require('../../../../lib/request');
const response = require('../../../../lib/response');
const storage = require('../../../../lib/storage');

const PREFIX = '/api/tiddlers/';

// List without the text, so the list stays small (as remote-server-example)
function list(ctx) {
	const items = storage.listAll().map(t => ({
		title: t.title,
		modified: t.modified,
		modifier: t.modifier,
		tags: t.tags || []
	}));
	response.ok(ctx, items);
}

function get(ctx) {
	const title = request.titleFromUri(ctx, PREFIX);
	if (title === null || !storage.filename(title)) {
		return response.error(ctx, 400, 'Invalid tiddler title');
	}
	const tiddler = storage.get(title);
	if (!tiddler) {
		return response.error(ctx, 404, 'Tiddler not found');
	}
	response.ok(ctx, tiddler);
}

function put(ctx) {
	const title = request.titleFromUri(ctx, PREFIX);
	if (title === null || !storage.filename(title)) {
		return response.error(ctx, 400, 'Invalid tiddler title');
	}
	const body = request.jsonBody(ctx);
	if (body.error) {
		return response.error(ctx, 400, body.error);
	}
	const tiddler = body.data;
	if (!tiddler || typeof tiddler !== 'object' || Array.isArray(tiddler)) {
		return response.error(ctx, 400, 'Tiddler must be a JSON object');
	}

	// Same rules as remote-server-example: title from the URL, default modified/modifier
	tiddler.title = title;
	tiddler.modified = tiddler.modified || new Date().toISOString();
	tiddler.modifier = tiddler.modifier || 'RemoteStorage';

	const result = storage.put(tiddler);
	if (result.conflict !== undefined) {
		return response.error(ctx, 409, 'Another tiddler ("' + result.conflict + '") already uses the file name for this title');
	}
	response.ok(ctx, { success: true, tiddler: tiddler });
}

function remove(ctx) {
	const title = request.titleFromUri(ctx, PREFIX);
	if (title === null || !storage.filename(title)) {
		return response.error(ctx, 400, 'Invalid tiddler title');
	}
	if (!storage.remove(title)) {
		return response.error(ctx, 404, 'Tiddler not found');
	}
	response.ok(ctx, { success: true });
}

module.exports = { list, get, put, remove };
