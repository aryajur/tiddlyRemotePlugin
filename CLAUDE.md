# TiddlyWiki Remote Storage Plugin - Development Documentation

**Last Updated**: 2025-11-12
**Author**: Milind Gupta
**License**: BSD 3-Clause

## Project Overview

This is a plugin for **TiddlyWiki Classic** that enables storing tiddlers on a remote server instead of in the HTML file. It provides full search integration, lazy loading, offline support, and seamless integration with existing TiddlyWiki plugins like SearchOptionsPlugin.

### Key Capabilities

- 🌐 **Remote Storage**: Store tiddlers via REST API on any HTTP server
- 🔍 **Unified Search**: Synchronous remote search integrated with local search
- 📋 **SearchOptionsPlugin Integration**: Full compatibility for list view results
- ⚡ **Lazy Loading**: Fetch content only when tiddler is opened
- 🔄 **Auto-sync**: Configurable synchronization with remote server
- 🛡️ **API Key Authentication**: Secure server communication
- 📴 **Offline Support**: Queue changes when offline, sync when online
- 💾 **LocalStorage Persistence**: Settings and pending changes survive page reloads
- 🎨 **Visual Indicators**: Blue border and toolbar button styling for remote tiddlers

## Project Structure

```
tiddlyRemotePlugin/
├── zzz_RemoteStoragePlugin.js    # Main plugin (1,181 lines)
├── README.md                      # User documentation & installation
├── CLAUDE.md                      # This file - development documentation
├── NEXT.txt                       # Future roadmap (untracked)
├── LICENSE                        # BSD 3-Clause
├── .gitignore                     # Git exclusions
└── remote-server-example/         # Node.js REST API server
    ├── server.js                  # Express server (210 lines)
    ├── package.json               # Node dependencies
    ├── README.md                  # Server documentation
    └── tiddlers/                  # File-based storage directory
```

## Technical Architecture

### Plugin Architecture (zzz_RemoteStoragePlugin.js)

The plugin is a single JavaScript file that extends TiddlyWiki Classic through several key mechanisms:

#### 1. RemoteStorageAdaptor Class

Extends `AdaptorBase` to implement the TiddlyWiki adaptor pattern:

```javascript
function RemoteStorageAdaptor() {
    this.host = config.extensions.RemoteStorage.serverUrl;
    this.apiKey = config.extensions.RemoteStorage.apiKey;
}
```

**Key Methods**:
- `getTiddlerList(context, userParams, callback)` - Fetches list of all remote tiddlers
- `getTiddler(title, context, userParams, callback)` - Fetches single tiddler content
- `putTiddler(tiddler, context, userParams, callback)` - Saves/updates tiddler on server
- `deleteTiddler(title, context, userParams, callback)` - Deletes tiddler from server
- `searchTiddlers(query, context, userParams, callback)` - Searches remote tiddlers

**Location**: Lines 263-493

#### 2. Function Overriding Pattern

The plugin hooks into core TiddlyWiki functions to intercept operations:

| Function | Purpose | Lines |
|----------|---------|-------|
| `store.saveTiddler` | Auto-sync remote tiddlers to server | 682-716 |
| `store.deleteTiddler` | Delete from remote server | 721-739 |
| `story.displayTiddler` | Lazy load remote tiddler content | 744-774 |
| `TiddlyWiki.prototype.search` | Add remote search results | 781-857 |
| `store.allTiddlersAsHtml` | Exclude remote content from HTML save | 863-905 |
| `store.loadFromDiv` | Auto-sync on wiki load | 910-918 |
| `story.refreshTiddler` | Add visual indicators | 985-1001 |
| `config.macros.toolbar.invokeCommand` | Style remote button | 939-957 |

#### 3. Remote Tiddler Detection

Tiddlers are marked as remote using custom fields:

```javascript
// Check if remote
Tiddler.prototype.isRemote = function() {
    return this.fields['remote.storage'] === 'true';
};

// Set remote status
Tiddler.prototype.setRemote = function(isRemote) {
    if(isRemote) {
        this.fields['remote.storage'] = 'true';
        this.fields['server.type'] = 'remotestorage';
        this.fields['server.host'] = config.extensions.RemoteStorage.serverUrl;
    }
};
```

**Location**: Lines 663-677

Remote tiddlers use a placeholder until loaded:
```javascript
text: '[This tiddler is stored remotely]'
```

#### 4. Cache Management System

Implements time-based caching with configurable timeout:

```javascript
config.extensions.RemoteStorage = {
    cache: {},                  // In-memory cache
    cacheTimeout: 300000,       // 5 minutes default
    // ...
};
```

**Cache Functions** (Lines 584-605):
- `cacheTiddler(tiddler)` - Store with timestamp
- `getCachedTiddler(title)` - Retrieve if not expired
- `removeCachedTiddler(title)` - Delete from cache

#### 5. Offline Queue System

Queues changes when offline, syncs when connection restored:

```javascript
config.extensions.RemoteStorage.pendingChanges = {};
```

**Queue Functions** (Lines 607-658):
- `queueChange(operation, data)` - Add to queue and localStorage
- `syncPendingChanges()` - Process queue when online

**Event Listeners** (Lines 31-39):
```javascript
window.addEventListener('online', function() {
    config.extensions.RemoteStorage.isOnline = true;
    config.extensions.RemoteStorage.syncPendingChanges();
    config.extensions.RemoteStorage.syncRemoteList();
});
```

#### 6. Toolbar Integration

Dynamically adds "remote" button to tiddler toolbars:

**Command Definition** (Lines 44-121):
```javascript
config.commands.remoteStorage = {
    text: "remote",
    tooltip: "Toggle remote storage for this tiddler",
    handler: function(event, src, title) { /* ... */ }
};
```

**Toolbar Injection** (Lines 128-258):
- Modifies `ToolbarCommands` tiddler
- Places button before `>` separator (main area)
- Adds to both ViewToolbar and EditToolbar
- Refreshes all displayed tiddlers to show button

#### 7. Search Integration

**Synchronous Remote Search** (Lines 781-857):

Critical for SearchOptionsPlugin compatibility. Uses synchronous XHR to fetch results inline:

```javascript
var xhr = new XMLHttpRequest();
xhr.open('GET', url, false); // false = synchronous
xhr.send();
```

Why synchronous?
- TiddlyWiki's search function expects immediate results
- SearchOptionsPlugin needs results in same execution context
- Async would break the list view display

Combines local and remote results, removing duplicates.

#### 8. Configuration UI

**Backstage Macro** (Lines 1006-1128):

Creates configuration panel in backstage area:
- Server URL input
- API Key (password field)
- Checkboxes: Auto-sync, Lazy loading, Remote search
- Cache timeout input
- Buttons: Save Settings, Test Connection, Sync Remote List
- Status display (online status, cache size, pending changes, last sync)

**LocalStorage Persistence** (Lines 1131-1149):
All settings saved to localStorage and restored on page load.

#### 9. Visual Styling

**CSS Injection** (Lines 962-982):

```css
.toolbar .remoteStorage.remoteActive {
    color: #0a84ff !important;
    font-weight: bold;
    background: linear-gradient(135deg, #e3f2fd 0%, #bbdefb 100%);
    border: 1px solid #0a84ff;
}

.tiddler.remoteIndication {
    border-left: 3px solid #0a84ff;
}
```

### Server Architecture (server.js)

**Technology Stack**:
- Node.js + Express.js
- CORS enabled for cross-origin requests
- Body-parser for JSON (50MB limit for large tiddlers)
- File-based storage (no database required)

**API Endpoints**:

| Method | Endpoint | Purpose | Handler Lines |
|--------|----------|---------|---------------|
| GET | `/api/tiddlers` | List all tiddlers | 60-87 |
| GET | `/api/tiddlers/:title` | Get specific tiddler | 90-104 |
| PUT | `/api/tiddlers/:title` | Create/update tiddler | 107-128 |
| DELETE | `/api/tiddlers/:title` | Delete tiddler | 131-144 |
| GET | `/api/search?q=query` | Search tiddlers | 147-182 |
| GET | `/health` | Health check | 185-187 |

**Authentication**:
- Optional API key via `X-API-Key` header
- Middleware checks on all `/api/*` routes (Lines 31-36)
- Environment variable: `API_KEY`

**Storage Strategy**:
- Each tiddler = one JSON file
- Filename: `sanitizedTitle.json`
- Directory: `DATA_DIR` env variable (default: `./tiddlers`)
- Character sanitization: `[<>:"/\\|?*]` → `_` (Line 48-51)

**Search Implementation** (Lines 147-182):
- Simple case-insensitive text search
- Searches: title, text content, tags
- Returns: title, modified, modifier, tags, snippet (first 200 chars)

## Data Flow Diagrams

### Tiddler Save Flow

```
User edits tiddler
    ↓
store.saveTiddler() [overridden]
    ↓
Check if isRemote()
    ↓
YES → RemoteStorageAdaptor.putTiddler()
    ↓
Online? → YES → AJAX PUT to /api/tiddlers/:title
    ↓                   ↓
    NO                  Success → Update cache
    ↓                            → Sync remote list
Queue for later                  → Clear dirty flag
```

### Lazy Loading Flow

```
User clicks tiddler
    ↓
story.displayTiddler() [overridden]
    ↓
Check if remote placeholder
    ↓
YES → Show "Loading..." message
    ↓
RemoteStorageAdaptor.getTiddler()
    ↓
Check cache
    ↓
HIT → Return cached        MISS → AJAX GET /api/tiddlers/:title
    ↓                               ↓
Display tiddler                     Cache result → Display
```

### Search Flow

```
User types search
    ↓
TiddlyWiki.prototype.search() [overridden]
    ↓
Execute local search (original function)
    ↓
Remote search enabled? → YES → Synchronous XHR to /api/search
    ↓                               ↓
    NO                              Parse results
    ↓                               ↓
Return local only              Create placeholders for new tiddlers
                                    ↓
                               Merge with local results (dedupe)
                                    ↓
                               Return combined results
```

## Configuration System

### Plugin Configuration Object

```javascript
config.extensions.RemoteStorage = {
    serverUrl: '',              // Remote server URL
    apiKey: '',                 // Optional API key
    cacheTimeout: 300000,       // 5 minutes
    autoSync: true,             // Auto-sync on load
    lazyLoading: true,          // Lazy load content
    cache: {},                  // In-memory cache
    pendingChanges: {},         // Offline queue
    isOnline: true,             // Network status
    lastSyncTime: 0,            // Last sync timestamp
    searchRemote: true          // Enable remote search
};
```

### LocalStorage Keys

All settings persist across page reloads:

- `RemoteStorage.serverUrl`
- `RemoteStorage.apiKey`
- `RemoteStorage.autoSync`
- `RemoteStorage.lazyLoading`
- `RemoteStorage.searchRemote`
- `RemoteStorage.cacheTimeout`
- `RemoteStorage.pendingChanges`

## Plugin Naming Convention

The `zzz_` prefix ensures load order:
- TiddlyWiki loads plugins alphabetically
- `zzz_RemoteStoragePlugin` loads after `SearchOptionsPlugin`
- Critical for proper integration with existing plugins
- Toolbar commands must be defined before other plugins reference them

## Compatibility & Integration

### TiddlyWiki Classic Version
- **Requires**: TiddlyWiki Classic 2.1+
- **jQuery**: Uses jQuery for AJAX and DOM manipulation
- **AdaptorBase**: Extends built-in adaptor system

### SearchOptionsPlugin Integration

**How it works**:
1. SearchOptionsPlugin calls `store.search()`
2. Our overridden search adds remote results
3. SearchOptionsPlugin receives combined results
4. List view displays both local and remote tiddlers
5. No configuration needed - automatic integration

**Key Features**:
- Remote results appear in list view
- Toggle between "Open Tiddlers" and "List View" modes
- Duplicate detection prevents showing same tiddler twice
- Lazy loading works with list view clicks

### Browser Compatibility

**Requirements**:
- Modern browser with localStorage support
- XMLHttpRequest support (for search)
- jQuery (bundled with TiddlyWiki Classic)

**Tested On**:
- Chrome/Edge (Chromium)
- Firefox
- Safari

## Development Guidelines

### Code Style

**Conventions Used**:
- TiddlyWiki Classic patterns (prototypes, config objects)
- jQuery for AJAX and DOM manipulation
- Function-based architecture (not ES6 classes)
- Inline documentation for complex sections

### Key Extension Points

If extending the plugin:

1. **New Server Endpoints**: Add to `RemoteStorageAdaptor.prototype`
2. **New Settings**: Add to `config.extensions.RemoteStorage` + localStorage
3. **New Toolbar Commands**: Follow `config.commands.remoteStorage` pattern
4. **New CSS**: Add to `config.shadowTiddlers.StyleSheetRemoteStorage`
5. **New Backstage Tasks**: Add to `config.backstageTasks` array

### Testing Checklist

**Manual Testing**:
- [ ] Toggle tiddler to remote storage
- [ ] Edit remote tiddler (saves to server)
- [ ] Delete remote tiddler (removes from server)
- [ ] Search includes remote results
- [ ] Lazy loading works when clicking tiddler
- [ ] Offline queue works (disconnect, edit, reconnect)
- [ ] Settings persist across page reload
- [ ] Test Connection button works
- [ ] Sync Remote List button works
- [ ] Visual indicators appear (blue border, button styling)
- [ ] SearchOptionsPlugin list view shows remote tiddlers

**Server Testing**:
- [ ] All 5 API endpoints respond correctly
- [ ] API key authentication works
- [ ] CORS allows browser requests
- [ ] Search returns relevant results
- [ ] Files are created/updated/deleted correctly

## Git Workflow

### Current Status
- **Branch**: `main`
- **Commits**: 3 total
  - `35a0e68` - Added Readme
  - `54ea3ad` - The plugin tested for simple tiddlers and searching
  - `9e1ed0b` - Initial commit

### Modified Files (Uncommitted)
- `.gitignore`
- `LICENSE`
- `README.md`
- `INSTALLATION.md` (will be merged into README.md)
- `remote-server-example/README.md`
- `remote-server-example/package.json`
- `remote-server-example/server.js`
- `zzz_RemoteStoragePlugin.js`

### Untracked Files
- `NEXT.txt` - Future roadmap (intentionally untracked for planning)
- `CLAUDE.md` - This documentation file

## Future Roadmap (from NEXT.txt)

### 1. Image Integration (High Priority)

**Goal**: Seamlessly upload and manage images in remote tiddlers

**Detection Points**:
- During tiddler save - scan for `[img[...]]` syntax
- During drag & drop - intercept image files
- During paste - detect base64 data URIs
- During external link processing - detect `file://` URLs

**Image Reference Types to Handle**:
```javascript
// Base64 embedded
[img[data:image/png;base64,iVBORw0KGgo...]]

// Local file references
[img[./images/photo.jpg]]
[img[file:///C:/Users/photos/image.png]]

// Relative paths
[img[images/diagram.svg]]

// Binary tiddler references
[img[MyImageTiddler]]
```

**New Server Endpoints**:
```
POST   /api/images           - Upload image (base64 or multipart)
GET    /api/images/:imageId  - Get image by ID
GET    /api/images           - List all images
DELETE /api/images/:imageId  - Delete image
```

**Server Response Format**:
```json
{
  "imageId": "abc-123-uuid",
  "url": "/api/images/abc-123-uuid",
  "filename": "photo.jpg",
  "contentType": "image/jpeg"
}
```

**URL Rewriting Strategy**:
```javascript
// Before save to server
[img[./photos/sunset.jpg]]
  → [img[{{remote-server-url}}/api/images/abc-123-uuid]]

// Store mapping in tiddler fields
fields: {
  "remote.images": JSON.stringify({
    "./photos/sunset.jpg": "abc-123-uuid",
    "data:image/png;base64,...": "def-456-uuid"
  })
}
```

**Implementation Points**:
1. **Enhanced `putTiddler`**: Scan text for images, upload, rewrite URLs
2. **New Functions**:
   - `config.extensions.RemoteStorage.processImages(tiddlerText, imageMapping)`
   - `config.extensions.RemoteStorage.uploadImage(imageData, callback)`
3. **Drag & Drop Handler**: Override TiddlyWiki's handler for images
4. **Cleanup**: Delete orphaned images when tiddler deleted

**Complexity Estimate**: High - requires text parsing, binary uploads, URL rewriting

### 2. Document Integration (Medium Priority)

Similar to image integration but for PDF, DOC, etc.

**File Types**:
- PDF documents
- Office files (DOC, DOCX, XLS, XLSX)
- Text files
- Archives (ZIP, etc.)

**Server Endpoints**:
```
POST   /api/documents/:docId
GET    /api/documents/:docId
DELETE /api/documents/:docId
```

### 3. Access Control (Medium Priority)

**User Authentication**:
- Multi-user support
- Per-tiddler permissions
- User groups and roles

**Potential Implementation**:
- JWT tokens
- OAuth integration
- Per-tiddler ACL fields

**Server Changes**:
- User management endpoints
- Permission checking middleware
- Session management

### 4. OpenResty Server (Low Priority)

**Why OpenResty**:
- High performance (Nginx + Lua)
- Better for production deployments
- Easier scaling
- Built-in caching

**Alternative to**: Current Express.js server

## Deployment Considerations

### Development Setup

```bash
# Clone repository
git clone <repo-url>
cd tiddlyRemotePlugin

# Start server
cd remote-server-example
npm install
npm start

# Server runs on http://localhost:3000
```

### Production Deployment

**Server Recommendations**:
1. **Use HTTPS** - Always encrypt API traffic
2. **Strong API Key** - Generate cryptographically secure key
3. **Environment Variables** - Never hardcode secrets
4. **Rate Limiting** - Add express-rate-limit middleware
5. **Input Validation** - Sanitize all user input
6. **Backup Strategy** - Regular backups of tiddlers directory
7. **Process Manager** - Use PM2 or systemd for server
8. **Reverse Proxy** - Nginx or Apache in front of Node.js

**Docker Deployment**:
```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY server.js ./
EXPOSE 3000
CMD ["node", "server.js"]
```

```bash
docker build -t tiddlywiki-remote-storage .
docker run -p 3000:3000 \
  -v $(pwd)/tiddlers:/app/tiddlers \
  -e API_KEY=your-secret-key \
  tiddlywiki-remote-storage
```

**Environment Variables**:
```bash
export PORT=3000
export DATA_DIR=/var/tiddlywiki/tiddlers
export API_KEY=your-secret-api-key
export NODE_ENV=production
```

### Security Checklist

- [ ] HTTPS enabled
- [ ] Strong API key (32+ characters)
- [ ] API key not in version control
- [ ] Input sanitization on all endpoints
- [ ] File size limits enforced
- [ ] CORS configured for specific domains only
- [ ] Rate limiting enabled
- [ ] Regular security updates
- [ ] Backup and disaster recovery plan
- [ ] Access logs enabled
- [ ] Error messages don't leak sensitive info

## Troubleshooting Guide

### Plugin Not Appearing
- Ensure tiddler has `systemConfig` tag
- Save and reload TiddlyWiki
- Clear browser cache
- Check browser console for errors

### Remote Button Not Showing
- Verify server URL is configured
- Check backstage → "remote storage" settings
- Refresh tiddler display
- Check ToolbarCommands tiddler

### Connection Errors
- Verify server is running
- Check URL format (no trailing slash)
- Browser console for CORS errors
- Verify API key matches
- Test with curl: `curl http://localhost:3000/health`

### Remote Search Not Working
- Enable "Search Remote" in settings
- Check server `/api/search` endpoint
- Look for error messages in popup
- Verify server is online
- Check API key

### Sync Issues
- Check online/offline status
- Review pending changes in settings
- Click "Sync Pending Changes" button
- Check server logs for errors

### Performance Issues
- Reduce cache timeout
- Enable lazy loading
- Check network latency
- Review server performance
- Check for large tiddlers

## Code Quality Notes

### Strengths
- Well-organized with clear sections
- Comprehensive error handling
- Good inline comments
- Proper use of TiddlyWiki patterns
- Backwards compatible with SearchOptionsPlugin
- Offline-first design with queue system
- No external dependencies beyond TiddlyWiki/jQuery

### Areas for Improvement
- **Synchronous XHR**: Deprecated but necessary for compatibility
- **No Unit Tests**: Should add automated testing
- **Image Upload**: Adds significant complexity
- **Input Sanitization**: Server could be more robust
- **Conflict Resolution**: No multi-user conflict handling
- **Error Recovery**: Limited retry logic
- **Documentation**: Could add JSDoc comments

### Technical Debt
- Synchronous XHR in search (unavoidable without major refactor)
- Direct DOM manipulation could use more jQuery
- Some functions are quite long (200+ lines)
- Limited error context in some callbacks

## Performance Characteristics

### Plugin Load Time
- ~1181 lines of JavaScript
- Loads after other plugins (zzz_ prefix)
- jQuery dependency
- Minimal initialization overhead

### Runtime Performance
- **Local Search**: No overhead
- **Remote Search**: Adds network latency (sync request blocks)
- **Cache**: O(1) lookup with timestamp check
- **Lazy Loading**: Only fetches when needed
- **Sync**: Async, doesn't block UI

### Network Usage
- **Lazy Loading**: Minimal - only fetches opened tiddlers
- **Aggressive Sync**: Higher - fetches all on load
- **Search**: One request per search query
- **Save**: One PUT request per save

### Storage Usage
- **LocalStorage**: Settings + pending changes queue
- **Memory**: In-memory cache with TTL
- **Server**: One JSON file per tiddler

## API Reference

### Main Configuration Object

```javascript
config.extensions.RemoteStorage
```

**Properties**:
- `serverUrl` (String) - Remote server URL
- `apiKey` (String) - API key for authentication
- `cacheTimeout` (Number) - Cache TTL in milliseconds
- `autoSync` (Boolean) - Auto-sync on load
- `lazyLoading` (Boolean) - Lazy load content
- `cache` (Object) - In-memory cache
- `pendingChanges` (Object) - Offline queue
- `isOnline` (Boolean) - Network status
- `lastSyncTime` (Number) - Last sync timestamp
- `searchRemote` (Boolean) - Enable remote search

**Methods**:
- `updateRemoteList(remoteTiddlers)` - Update remote tiddler list
- `syncRemoteList()` - Sync list from server
- `cacheTiddler(tiddler)` - Cache a tiddler
- `getCachedTiddler(title)` - Get cached tiddler
- `removeCachedTiddler(title)` - Remove from cache
- `queueChange(operation, data)` - Queue offline change
- `syncPendingChanges()` - Sync queued changes
- `syncRemoteTiddlers()` - Sync all remote tiddler content

### Tiddler Extensions

```javascript
Tiddler.prototype.isRemote()
```
Returns `true` if tiddler is stored remotely.

```javascript
Tiddler.prototype.setRemote(isRemote)
```
Sets remote storage status for tiddler.

### RemoteStorageAdaptor

```javascript
var adaptor = new RemoteStorageAdaptor();
```

**Methods**:
- `getTiddlerList(context, userParams, callback)`
- `getTiddler(title, context, userParams, callback)`
- `putTiddler(tiddler, context, userParams, callback)`
- `deleteTiddler(title, context, userParams, callback)`
- `searchTiddlers(query, context, userParams, callback)`

**Context Object**:
```javascript
{
  status: true/false,          // Success/failure
  statusText: "error message", // Error description
  tiddler: tiddlerObject,      // Returned tiddler
  tiddlers: [array],           // Returned list
  searchResults: [array]       // Search results
}
```

## Version History

- **v1.9.1** - Current version
  - Remote search integration
  - SearchOptionsPlugin compatibility
  - Lazy loading
  - Offline queue
  - Visual indicators

- **Earlier versions**
  - Basic remote storage
  - Toolbar integration
  - Cache system

## Contributing

When making changes:

1. **Update this file** - Keep CLAUDE.md current with changes
2. **Test thoroughly** - Use manual testing checklist
3. **Update README.md** - If user-facing changes
4. **Update NEXT.txt** - If planning new features
5. **Commit messages** - Clear, descriptive commit messages
6. **Code style** - Follow existing TiddlyWiki patterns

## Resources

### TiddlyWiki Classic Documentation
- [TiddlyWiki.com](http://tiddlywiki.com/)
- [TiddlyWiki Classic Documentation](http://classic.tiddlywiki.com/)
- [Plugin Development Guide](http://tiddlywiki.org/wiki/Plugins)

### Related Plugins
- [SearchOptionsPlugin](http://www.tiddlytools.com/#SearchOptionsPlugin) by Eric Shulman

### Server Technologies
- [Express.js Documentation](https://expressjs.com/)
- [Node.js Documentation](https://nodejs.org/)

## Contact & Support

**Author**: Milind Gupta
**License**: BSD 3-Clause
**Repository**: [GitHub URL]

For issues, questions, or contributions:
- Review this documentation
- Check the troubleshooting guide
- Test with the example server
- Open an issue on GitHub

---

**End of Development Documentation**
