# TiddlyWiki Access Server

Remote storage server for `zzz_RemoteStoragePlugin` (v1.10.0+) that will add
**users, groups and an admin panel**. It is built step by step
(see `paste_ready/` and `ACCESS_CONTROL_ROADMAP.md`).

Current state (step 03): same features as `remote-server-example`, API-key
protection only, replies in the standard envelope.

## Run

```bash
cd access-server
npm install
npm start                                   # http://localhost:3001, data in access-server/data/
```

Options (environment variables, defaults in `lib/env_helper.js`):

| Variable | Default | Meaning |
|---|---|---|
| `PORT` | `3001` | Port to listen on |
| `DATA_DIR` | `access-server/data` | Data folder; tiddlers are in `<DATA_DIR>/tiddlers/` |
| `AUTH_MODE` | `apikey` | `apikey` = X-API-Key header required (like remote-server-example) |
| `API_KEY` | `your-secret-api-key` | The key for `apikey` mode. Set your own for anything but local tests. |
| `CORS_ORIGIN` | `*` | Allowed browser origin |

Example (Git Bash): `PORT=3001 DATA_DIR=../tmp/access-data API_KEY=my-key npm start`

## API

Every reply: `{ "RESP": "OK"|"ERROR", "CODE": <status>, "MSG": "...", "DATA": ..., "META": { "request_id": "..." } }`

| Method | Path | DATA on success |
|---|---|---|
| GET | `/health` (no key) | `{status, dataDir, authMode}` |
| GET | `/api/tiddlers` | `[ {title, modified, modifier, tags} ]` |
| GET | `/api/tiddlers/<title>` | the tiddler |
| PUT | `/api/tiddlers/<title>` | `{success, tiddler}` |
| DELETE | `/api/tiddlers/<title>` | `{success}` |
| GET | `/api/search?q=<text>` | `[ {title, modified, modifier, tags, snippet} ]` |

Errors: 400 bad input, 401 bad/missing key, 404 not found, 405 wrong method,
409 two titles map to the same file name, 413 body over 50 MB, 500 server error.

## Structure (mirrors `root_for_reference.lua` for a later OpenResty port)

| Node.js file | Role | OpenResty/Lua counterpart |
|---|---|---|
| `server.js` | start-up, body reading, hands every request to root | `conf/nginx.conf` |
| `root.js` | entry point: CORS, logging, route lookup, error safety | `root.lua` |
| `controllers/tiddly/remote/controller.js` | ordered route list | `controller.lua` |
| `controllers/tiddly/remote/handlers/*.js` | one file per feature | `handlers/*.lua` |
| `lib/env_helper.js`, `lib/log_helper.js` | settings, logging | `env_helper.lua`, `log_helper.lua` |
| `lib/response.js` | envelope replies | `response.lua` |
| `lib/request.js` | body, title, query, method dispatch | `request.lua` |
| `lib/fileio.js`, `lib/storage.js` | files on disk | `fileio.lua`, `storage.lua` (+ index file) |
| `lib/auth.js` | credential check wrapper | `auth.lua` |
