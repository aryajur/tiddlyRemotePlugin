# TiddlyWiki Access Server

Remote storage server for `zzz_RemoteStoragePlugin` (v1.10.0+) that adds
**users, groups and an admin panel**. It is built step by step
(see `paste_ready/` and `ACCESS_CONTROL_ROADMAP.md`).

Current state (step 04):
- `AUTH_MODE=apikey` (default): same features as `remote-server-example`, API-key protection.
- `AUTH_MODE=users`: username/password login with session tokens. Every logged-in
  user can still see every tiddler; group rules arrive in step 06.

## Run

```bash
cd access-server
npm install
npm start                                                   # API-key mode, port 3001, data in access-server/data/
AUTH_MODE=users DATA_DIR=../tmp/access-users npm start      # login mode
```

Options (environment variables, defaults in `lib/env_helper.js`):

| Variable | Default | Meaning |
|---|---|---|
| `PORT` | `3001` | Port to listen on |
| `DATA_DIR` | `access-server/data` | Data folder: `tiddlers/`, `users.json`, `groups.json` |
| `AUTH_MODE` | `apikey` | `apikey` = X-API-Key header (like remote-server-example); `users` = login |
| `API_KEY` | `your-secret-api-key` | Key for `apikey` mode. Set your own for anything but local tests. |
| `SESSION_TTL` | `28800` | `users` mode: how long a login is valid, in seconds (8 hours) |
| `SETUP_ALLOW_REMOTE` | `false` | `users` mode: allow `/api/setup` from other computers |
| `CORS_ORIGIN` | `*` | Allowed browser origin |

## First administrator (users mode)

With no users yet, the server prints the command. From the server computer:

```bash
curl -X POST http://localhost:3001/api/setup -H "Content-Type: application/json" \
     -d '{"username":"admin","password":"choose-a-strong-password"}'
```

Works only once (while no user exists) and only from the server computer itself.

## Users from the command line

`tools/users_cli.js` edits `users.json` / `groups.json` directly (for tests before
the admin panel, and to reset a forgotten admin password). Use the same `DATA_DIR`
as the server:

```bash
DATA_DIR=../tmp/access-users node tools/users_cli.js list
DATA_DIR=../tmp/access-users node tools/users_cli.js add alice alice-pass-1 --groups hr,eng --default hr
DATA_DIR=../tmp/access-users node tools/users_cli.js passwd admin new-admin-pass
```

Commands: `list`, `add`, `passwd`, `groups`, `disable`, `enable`, `delete`.

## API

Every reply: `{ "RESP": "OK"|"ERROR", "CODE": <status>, "MSG": "...", "DATA": ..., "META": { "request_id": "..." } }`

| Method | Path | Who | DATA on success |
|---|---|---|---|
| GET | `/health` | anyone | `{status, dataDir, authMode, setupRequired}` |
| POST | `/api/setup` | first run, server computer | `{token, user, expiresIn}` |
| POST | `/api/login` | anyone, body `{username, password}` | `{token, user, expiresIn}` |
| POST | `/api/logout` | logged in | `{}` |
| GET | `/api/me` | logged in | `{username, groups, defaultGroup, isAdmin, disabled, created, authMode}` |
| GET | `/api/tiddlers` | logged in / API key | `[ {title, modified, modifier, tags} ]` |
| GET | `/api/tiddlers/<title>` | logged in / API key | the tiddler |
| PUT | `/api/tiddlers/<title>` | logged in / API key | `{success, tiddler}` |
| DELETE | `/api/tiddlers/<title>` | logged in / API key | `{success}` |
| GET | `/api/search?q=<text>` | logged in / API key | `[ {title, modified, modifier, tags, snippet} ]` |

"Logged in" = header `Authorization: Bearer <token>` (users mode). The API key is
not accepted in users mode.

Errors: 400 bad input, 401 not logged in / bad key / expired login, 403 disabled
account or setup from another computer, 404 not found, 405 wrong method,
409 conflict (setup already done; two titles map to one file name),
413 body over 50 MB, 500 server error.

## Data files

```
<DATA_DIR>/tiddlers/<title>.json   one file per tiddler (same format as remote-server-example)
<DATA_DIR>/users.json              { "version": 1, "users": { "<name>": { passwordHash, groups,
                                     defaultGroup, isAdmin, disabled, created } } }
<DATA_DIR>/groups.json             { "version": 1, "groups": { "<name>": { description, created } } }
```

Passwords are stored only as `pbkdf2$20000$<salt hex>$<hash hex>` (PBKDF2-HMAC-SHA256),
the same format the later OpenResty server uses. Never commit `DATA_DIR`.

## Structure (mirrors `root_for_reference.lua` for a later OpenResty port)

| Node.js file | Role | OpenResty/Lua counterpart |
|---|---|---|
| `server.js` | start-up, body reading, hands every request to root | `conf/nginx.conf` |
| `root.js` | entry point: CORS, logging, route lookup, error safety | `root.lua` |
| `controllers/tiddly/remote/controller.js` | ordered route list | `controller.lua` |
| `controllers/tiddly/remote/handlers/*.js` | one file per feature | `handlers/*.lua` |
| `lib/env_helper.js`, `lib/log_helper.js` | settings, logging | `env_helper.lua`, `log_helper.lua` |
| `lib/response.js` | envelope replies | `response.lua` |
| `lib/request.js` | body, title, query, token, method dispatch | `request.lua` |
| `lib/fileio.js`, `lib/storage.js` | files on disk | `fileio.lua`, `storage.lua` (+ index file) |
| `lib/crypto.js` | password hashing, tokens | `crypto.lua` (pure-Lua PBKDF2) |
| `lib/users.js` | users.json, groups.json | `users.lua` |
| `lib/sessions.js` | login tokens in memory | `lua_shared_dict sessions` |
| `lib/auth.js` | `required` / `adminOnly` wrappers | `auth.lua` |
| `tools/users_cli.js` | command-line user management | (optional `resty` script) |
