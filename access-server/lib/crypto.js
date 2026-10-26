/**
 * crypto - password hashing and random tokens (Node's built-in crypto, no packages)
 *
 * Password hash format (identical on the Node and the later OpenResty server, so
 * users.json can be copied over without anyone resetting a password):
 *
 *     pbkdf2$<iterations>$<salt as hex>$<hash as hex>
 *     e.g. pbkdf2$20000$9f3c...(32 hex)$a81b...(64 hex)
 *
 *     PBKDF2-HMAC-SHA256, 20,000 iterations, 16-byte random salt, 32-byte result.
 *
 * Lua port: the pure-Lua PBKDF2 in ACCESS_CONTROL_ROADMAP.md Step 4.1 (verified
 * against the RFC 7914 test vectors) produces the same bytes; tokens from resty.random.
 */
const nodeCrypto = require('crypto');

const ITERATIONS = 20000;
const SALT_BYTES = 16;
const KEY_BYTES = 32;

function pbkdf2(password, salt, iterations) {
	return nodeCrypto.pbkdf2Sync(String(password), salt, iterations, KEY_BYTES, 'sha256');
}

// Store this, never the password itself
function hashPassword(password) {
	const salt = nodeCrypto.randomBytes(SALT_BYTES);
	const hash = pbkdf2(password, salt, ITERATIONS);
	return 'pbkdf2$' + ITERATIONS + '$' + salt.toString('hex') + '$' + hash.toString('hex');
}

// true if password matches the stored hash; false for a wrong password or a malformed hash
function verifyPassword(password, stored) {
	const parts = typeof stored === 'string' ? stored.split('$') : [];
	if (parts.length !== 4 || parts[0] !== 'pbkdf2') return false;
	const iterations = parseInt(parts[1], 10);
	if (!(iterations > 0)) return false;
	const expected = Buffer.from(parts[3], 'hex');
	if (expected.length !== KEY_BYTES) return false;
	const actual = pbkdf2(password, Buffer.from(parts[2], 'hex'), iterations);
	// Constant-time comparison: response time does not reveal how many bytes matched
	return nodeCrypto.timingSafeEqual(actual, expected);
}

// Spend the same time as a real check (used when the username does not exist,
// so response times do not reveal which usernames exist)
const DUMMY_HASH = hashPassword('dummy-password-for-timing');
function burnTime(password) {
	verifyPassword(password, DUMMY_HASH);
}

// 64 hex characters (32 random bytes) - login session token
function newToken() {
	return nodeCrypto.randomBytes(32).toString('hex');
}

module.exports = { hashPassword, verifyPassword, burnTime, newToken, ITERATIONS };
