/**
 * GET /api/search?q=<text> - same simple search as remote-server-example
 *
 * Case-insensitive plain-text match in title + text + tags.
 * DATA: [ {title, modified, modifier, tags, snippet (first 200 characters)} ]
 *
 * Lua port: string.lower + string.find(haystack, needle, 1, true) (plain find).
 * Note: Lua's string.lower only lower-cases A-Z (roadmap Step 3.4).
 */
const request = require('../../../../lib/request');
const response = require('../../../../lib/response');
const storage = require('../../../../lib/storage');

function handle(ctx) {
	const needle = request.query(ctx, 'q').toLowerCase();
	const results = [];

	for (const t of storage.listAll()) {
		const tags = t.tags || [];
		const haystack = (t.title + ' ' + (t.text || '') + ' ' + tags.join(' ')).toLowerCase();
		if (haystack.includes(needle)) {
			results.push({
				title: t.title,
				modified: t.modified,
				modifier: t.modifier,
				tags: tags,
				snippet: t.text ? t.text.substring(0, 200) : ''
			});
		}
	}
	response.ok(ctx, results);
}

module.exports = { handle };
