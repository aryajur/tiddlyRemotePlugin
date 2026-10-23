/**
 * storage - tiddlers on disk, one JSON file per tiddler
 *
 * Same file format and file naming as remote-server-example, so its tiddlers/
 * folder can be copied in unchanged:
 *     <DATA_DIR>/tiddlers/<sanitized title>.json
 *
 * Differences from remote-server-example (safety fixes, no effect on normal titles):
 *   - Windows device names (CON, NUL, COM1, ...) get a leading "_", control characters become "_".
 *   - Two different titles that map to the same file (e.g. "a/b" and "a_b", or on Windows
 *     "Notes" and "notes") are refused instead of silently overwriting each other.
 *   - get/remove only act on the file if the title stored inside it matches.
 *
 * Lua port: same functions. Lua cannot list a folder without a compiled library,
 * so listAll() will be backed by an index file there (roadmap Decision D8).
 */
const path = require('path');
const env = require('./env_helper');
const log = require('./log_helper');
const fileio = require('./fileio');

const WINDOWS_DEVICE_NAME = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;

function dataDir() {
	return path.resolve(env.get('DATA_DIR'));
}

function tiddlersDir() {
	return path.join(dataDir(), 'tiddlers');
}

function ensureDirs() {
	fileio.ensureDir(tiddlersDir());
}

// File name for a title, or null if the title cannot be stored
function filename(title) {
	if (typeof title !== 'string' || title === '' || title === '.' || title === '..') {
		return null;
	}
	// Same rule as remote-server-example, plus control characters
	let name = title.replace(/[<>:"/\\|?*]/g, '_').replace(/[\x00-\x1f]/g, '_');
	// "CON.json", "con.notes.json" ... are reserved on Windows
	if (WINDOWS_DEVICE_NAME.test(name.split('.')[0].trim())) {
		name = '_' + name;
	}
	return name + '.json';
}

function fileFor(title) {
	const name = filename(title);
	return name ? path.join(tiddlersDir(), name) : null;
}

// A stored tiddler belongs to `title` if its title matches (hand-made files without a title are accepted)
function belongsTo(tiddler, title) {
	return !tiddler || tiddler.title === undefined || tiddler.title === title;
}

// The tiddler object, or null if not found
function get(title) {
	const file = fileFor(title);
	if (!file) return null;
	const text = fileio.read(file);
	if (text === null) return null;
	const tiddler = JSON.parse(text);
	return belongsTo(tiddler, title) ? tiddler : null;
}

// Save a tiddler. Returns { ok: true } or { conflict: <title already using the file> }
function put(tiddler) {
	const file = fileFor(tiddler.title);
	const existingText = fileio.read(file);
	if (existingText !== null) {
		try {
			const existing = JSON.parse(existingText);
			if (!belongsTo(existing, tiddler.title)) {
				return { conflict: existing.title };
			}
		} catch (e) {
			log.warn(null, 'Overwriting unreadable tiddler file ', file, ': ', e.message);
		}
	}
	fileio.writeSafe(file, JSON.stringify(tiddler, null, 2));
	return { ok: true };
}

// Delete a tiddler; true if deleted, false if not found
function remove(title) {
	const file = fileFor(title);
	if (!file) return false;
	const text = fileio.read(file);
	if (text === null) return false;
	try {
		if (!belongsTo(JSON.parse(text), title)) return false;
	} catch (e) {
		// unreadable file with the right name: allow deleting it
	}
	return fileio.remove(file);
}

// Every stored tiddler (full objects). Unreadable files are logged and skipped.
function listAll() {
	const result = [];
	for (const name of fileio.listDir(tiddlersDir())) {
		if (!name.endsWith('.json')) continue;
		const file = path.join(tiddlersDir(), name);
		try {
			const tiddler = JSON.parse(fileio.read(file));
			if (tiddler && typeof tiddler === 'object' && typeof tiddler.title === 'string') {
				result.push(tiddler);
			} else {
				log.warn(null, 'Skipping ', name, ': no title');
			}
		} catch (e) {
			log.error(null, 'Error reading ', name, ': ', e.message);
		}
	}
	return result;
}

module.exports = { dataDir, tiddlersDir, ensureDirs, filename, get, put, remove, listAll };
