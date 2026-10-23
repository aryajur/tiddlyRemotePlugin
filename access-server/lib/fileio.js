/**
 * fileio - small, synchronous file helpers
 *
 * Synchronous on purpose: the code reads top-to-bottom like the Lua version
 * (OpenResty file io is blocking too) and one request finishes its
 * read-modify-write before the next starts.
 *
 * Lua port: io.open / f:read("*a") / os.remove / os.rename.
 * Note for the port: os.rename on Windows FAILS if the target exists,
 * so the Lua writeSafe must os.remove(target) first. Node's rename replaces it.
 */
const fs = require('fs');

// Whole file as text, or null if it does not exist
function read(file) {
	try {
		return fs.readFileSync(file, 'utf8');
	} catch (e) {
		if (e.code === 'ENOENT') return null;
		throw e;
	}
}

// Write via a temporary file, so a crash never leaves a half-written file behind
function writeSafe(file, content) {
	const tmp = file + '.tmp';
	fs.writeFileSync(tmp, content, 'utf8');
	try {
		fs.renameSync(tmp, file);
	} catch (e) {
		// Windows can refuse to replace a file that is briefly open (antivirus, indexer)
		if (e.code === 'EPERM' || e.code === 'EEXIST' || e.code === 'EACCES') {
			fs.rmSync(file, { force: true });
			fs.renameSync(tmp, file);
		} else {
			fs.rmSync(tmp, { force: true });
			throw e;
		}
	}
}

// Delete a file; true if deleted, false if it did not exist
function remove(file) {
	try {
		fs.unlinkSync(file);
		return true;
	} catch (e) {
		if (e.code === 'ENOENT') return false;
		throw e;
	}
}

// File names in a folder
function listDir(dir) {
	return fs.readdirSync(dir);
}

// Create a folder (and parents) if missing
function ensureDir(dir) {
	fs.mkdirSync(dir, { recursive: true });
}

module.exports = { read, writeSafe, remove, listDir, ensureDir };
