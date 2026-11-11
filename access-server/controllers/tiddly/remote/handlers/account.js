/**
 * "My access" endpoints for the logged-in user (step 07b)
 *
 *   GET /api/me/access          -> DATA: {
 *                                    username, isAdmin, groups, defaultGroup,
 *                                    owned:      [ {title, groups, modified} ],          tiddlers this user owns
 *                                    accessible: [ {title, groups, owner, modified} ],   tiddlers this user can open
 *                                    counts:     { owned, accessible }
 *                                  }
 *   PUT /api/me/tiddler-groups  {title, groups: [...]}
 *                               -> change the groups of ONE tiddler the user owns
 *                                  (administrators: any tiddler). Same rules as a PUT
 *                                  with "groups" (lib/acl.js groupsForChange), but
 *                                  without sending the tiddler text - safe for
 *                                  tiddlers whose text is not loaded in the browser.
 */
const log = require('../../../../lib/log_helper');
const request = require('../../../../lib/request');
const response = require('../../../../lib/response');
const storage = require('../../../../lib/storage');
const users = require('../../../../lib/users');
const acl = require('../../../../lib/acl');

function access(ctx) {
	const user = ctx.user;
	const record = users.getUser(user.username);
	const all = storage.listAll()
		.filter(t => acl.canAccess(user, t))
		.sort((a, b) => a.title.localeCompare(b.title));
	const owned = all.filter(t => acl.isOwner(user, t))
		.map(t => ({ title: t.title, groups: acl.tiddlerGroups(t), modified: t.modified || null }));
	const accessible = all
		.map(t => ({ title: t.title, groups: acl.tiddlerGroups(t), owner: t.owner || null, modified: t.modified || null }));
	response.ok(ctx, {
		username: user.username,
		isAdmin: user.isAdmin,
		groups: user.groups,
		defaultGroup: record ? (record.defaultGroup || null) : null,
		owned: owned,
		accessible: accessible,
		counts: { owned: owned.length, accessible: accessible.length }
	});
}

function setMyTiddlerGroups(ctx) {
	const body = request.jsonBody(ctx);
	if (body.error) return response.error(ctx, 400, body.error);
	const b = body.data || {};
	if (typeof b.title !== 'string' || b.title === '') return response.error(ctx, 400, 'title is required');
	if (!Array.isArray(b.groups) || b.groups.some(g => typeof g !== 'string')) {
		return response.error(ctx, 400, 'groups must be a list of group names');
	}
	const tiddler = storage.get(b.title);
	if (!tiddler || !acl.canAccess(ctx.user, tiddler)) return response.error(ctx, 404, 'Tiddler not found');

	const change = acl.groupsForChange(ctx.user, tiddler, b.groups);
	if (change.error) return response.error(ctx, change.status, change.error);
	if (ctx.user.isAdmin) {
		const unknown = users.unknownGroups(change.groups);
		if (unknown.length) return response.error(ctx, 400, 'Unknown group: ' + unknown.join(', ') + ' (create it first)');
	}
	tiddler.groups = change.groups;
	storage.put(tiddler);
	log.notice(ctx, 'GROUPS ', ctx.user.username, ': "', b.title, '" -> [', change.groups.join(','), ']');
	response.ok(ctx, { title: b.title, groups: change.groups });
}

module.exports = { access, setMyTiddlerGroups };
