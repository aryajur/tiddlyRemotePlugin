/**
 * env_helper - read configuration from environment variables
 *
 * Same interface as the env_helper used by root_for_reference.lua:
 *     env.get(name)            -> value or the built-in default
 *     env.get(name, fallback)  -> value or fallback
 *
 * All defaults live in one table so every setting is documented in one place.
 * Lua port: identical table + os.getenv(name) (remember the `env NAME;` lines in nginx.conf).
 */
const path = require('path');

const DEFAULTS = {
	PORT: '3001',                                   // example server uses 3000, OpenResty will use 8080
	DATA_DIR: path.join(__dirname, '..', 'data'),   // tiddlers/ (and later users.json, groups.json) live here
	AUTH_MODE: 'apikey',                            // 'apikey' = behaves like remote-server-example
	API_KEY: 'your-secret-api-key',                 // same default as remote-server-example
	CORS_ORIGIN: '*',                               // allowed browser origin
	SUBDOMAIN: 'wiki',                              // only used for logging (as in root_for_reference.lua)
	DOMAIN: 'localhost'
};

function get(name, fallback) {
	const value = process.env[name];
	if (value === undefined || value === '') {
		return fallback !== undefined ? fallback : DEFAULTS[name];
	}
	return value;
}

module.exports = { get, DEFAULTS };
