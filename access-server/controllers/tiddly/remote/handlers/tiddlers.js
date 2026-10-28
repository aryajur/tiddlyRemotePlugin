/**
 * Tiddler endpoints - with group access control (step 06)
 *
 *   GET    /api/tiddlers          list   -> DATA: [ {title, modified, modifier, tags, groups} ]  (only allowed ones)
 *   GET    /api/tiddlers/<title>  get    -> DATA: the tiddler
 *   PUT    /api/tiddlers/<title>  put    -> DATA: { success: true, tiddler }
 *   DELETE /api/tiddlers/<title>  remove -> DATA: { success: true }
 *
 * Every rule comes from lib/acl.js. A tiddler the user may not access is
 * answered exactly like a missing one (404 "Tiddler not found"), so nobody can
 * find out that it exists (roadmap Decision D11).
 */
const request = require('../../../../lib/request');
const response = require('../../../../lib/response');
const storage = require('../../../../lib/storage');
const acl = require('../../../../lib/acl');

const PREFIX = '/api/tiddlers/';
const NOT_FOUND = 'Tiddler not found';

// List without the text, so the list stays small. Only tiddlers this user may access.
function list(ctx) {
	const items = storage.listAll()
		.filter(t => acl.canAccess(ctx.user, t))
		.map(t => ({
			title: t.title,
			modified: t.modified,
			modifier: t.modifier,
			tags: t.tags || [],
			groups: acl.tiddlerGroups(t)
		}));
	response.ok(ctx, items);
}

function get(ctx) {
	const title = request.titleFromUri(ctx, PREFIX);
	if (title === null || !storage.filename(title)) {
		return response.error(ctx, 400, 'Invalid tiddler title');
	}
	const tiddler = storage.get(title);
	if (!tiddler || !acl.canAccess(ctx.user, tiddler)) {
		return response.error(ctx, 404, NOT_FOUND);
	}
	response.ok(ctx, tiddler);
}

function put(ctx) {
	const user = ctx.user;
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

	// Groups are decided HERE, never taken as-is from the request
	const requestedGroups = Array.isArray(tiddler.groups) ? tiddler.groups : undefined;
	delete tiddler.groups;

	const existing = storage.get(title);
	if (existing) {
		// Updating: only if allowed; a normal user can never change the groups
		if (!acl.canAccess(user, existing)) {
			return response.error(ctx, 404, NOT_FOUND);
		}
		tiddler.groups = (user.isAdmin && requestedGroups !== undefined) ?
			acl.cleanGroups(requestedGroups) : acl.tiddlerGroups(existing);
	} else {
		// Creating: the creator's group (admins: what they asked for, may be none = admin-only)
		tiddler.groups = acl.groupsForNew(user, requestedGroups);
		if (!user.isAdmin && tiddler.groups.length === 0) {
			return response.error(ctx, 403,
				'You are not a member of any group, so you cannot store tiddlers on the server. Ask an administrator.');
		}
	}

	// Same rules as remote-server-example: title from the URL, default modified/modifier
	tiddler.title = title;
	tiddler.modified = tiddler.modified || new Date().toISOString();
	tiddler.modifier = tiddler.modifier || 'RemoteStorage';

	const result = storage.put(tiddler);
	if (result.conflict !== undefined) {
		// Do not reveal the other title to someone who may not see it
		const other = user.isAdmin ? ' ("' + result.conflict + '")' : '';
		return response.error(ctx, 409, 'Another tiddler' + other + ' already uses the file name for this title. Choose a different title.');
	}
	response.ok(ctx, { success: true, tiddler: tiddler });
}

function remove(ctx) {
	const title = request.titleFromUri(ctx, PREFIX);
	if (title === null || !storage.filename(title)) {
		return response.error(ctx, 400, 'Invalid tiddler title');
	}
	const existing = storage.get(title);
	if (!existing || !acl.canAccess(ctx.user, existing)) {
		return response.error(ctx, 404, NOT_FOUND);
	}
	if (!storage.remove(title)) {
		return response.error(ctx, 404, NOT_FOUND);
	}
	response.ok(ctx, { success: true });
}

module.exports = { list, get, put, remove };
