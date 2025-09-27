# TiddlyWiki Classic Remote Storage Plugin

A plugin for TiddlyWiki Classic that enables storing tiddlers on a remote server, with full search integration and SearchOptionsPlugin compatibility.

## Features

- 🌐 **Remote Storage**: Store tiddlers on any HTTP server with REST API
- 🔍 **Unified Search**: Search both local and remote tiddlers simultaneously
- 📋 **List View Support**: Full compatibility with SearchOptionsPlugin for organized search results
- ⚡ **Lazy Loading**: Remote content loaded only when needed
- 🔄 **Auto-sync**: Automatic synchronization with remote server
- 🛡️ **API Key Authentication**: Secure server communication
- 🔌 **Plugin Compatibility**: Works with existing TiddlyWiki plugins

## Quick Start

### 1. Install the Plugin

1. **Download** `zzz_RemoteStoragePlugin.js`
2. **Open your TiddlyWiki** in a browser
3. **Create a new tiddler**:
   - Title: `zzz_RemoteStoragePlugin`
   - Tags: `systemConfig`
   - Content: Copy and paste the entire contents of `zzz_RemoteStoragePlugin.js`
4. **Save and reload** your TiddlyWiki

### 2. Set Up the Server (Optional)

If you want to run the example server:

```bash
cd remote-server-example
npm install
npm start
```

The server will run on `http://localhost:3000`

### 3. Configure Remote Storage

1. Click **backstage** → **remote storage**
2. Enter your server URL (e.g., `http://localhost:3000`)
3. Enter API Key (if your server requires one)
4. Click **Save Settings**
5. Click **Test Connection**

## SearchOptionsPlugin Integration

This plugin is fully compatible with [SearchOptionsPlugin](http://www.tiddlytools.com/#SearchOptionsPlugin) by Eric Shulman:

- **Automatic Integration**: Install both plugins and remote search works immediately
- **List View**: Remote tiddlers appear in SearchOptionsPlugin's list view
- **Toggle Support**: Switch between "Open Tiddlers" and "List View" modes
- **Unified Results**: Local and remote search results displayed together

### Installation Order

The `zzz_` prefix ensures this plugin loads after SearchOptionsPlugin, enabling proper integration.

## Usage

### Creating Remote Tiddlers

1. **Write any tiddler** normally in TiddlyWiki
2. **Click the "remote" button** in the tiddler toolbar
3. **Confirm upload** - the tiddler is now stored remotely

### Searching

- **Use normal search** - finds both local and remote tiddlers
- **With SearchOptionsPlugin**: Toggle between opening all results or showing as a list
- **Remote results**: Appear as placeholders until opened (lazy loading)

### Managing Remote Tiddlers

- **View all remote**: Check backstage → remote storage → "List Remote Tiddlers"
- **Download remote**: Click "Download" button on any remote tiddler
- **Sync all**: Use "Sync All Remote" in backstage to download all remote content

## API Server Requirements

Your server should implement these endpoints:

- `GET /api/tiddlers` - List all tiddlers
- `GET /api/tiddlers/:title` - Get specific tiddler
- `POST /api/tiddlers` - Create/update tiddler
- `DELETE /api/tiddlers/:title` - Delete tiddler
- `GET /api/search?q=query` - Search tiddlers

See `remote-server-example/` for a complete implementation.

## Files

- **`zzz_RemoteStoragePlugin.js`** - Main plugin file
- **`INSTALLATION.md`** - Detailed installation instructions
- **`remote-server-example/`** - Example server implementation
- **`.gitignore`** - Git ignore rules

## Compatibility

- **TiddlyWiki Classic**: 2.1+
- **Browsers**: Modern browsers with localStorage support
- **SearchOptionsPlugin**: Full compatibility
- **Other Plugins**: Designed to work alongside existing plugins

## Security

- Use HTTPS in production
- Keep API keys secure
- Don't commit TiddlyWikis with API keys to public repositories
- Consider environment-specific configurations

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test with both standalone and SearchOptionsPlugin scenarios
5. Submit a pull request

## License

BSD Open Source License

## Support

For issues, questions, or contributions:
- Check existing issues in the repository
- Review `INSTALLATION.md` for troubleshooting
- Test with the example server in `remote-server-example/`

---

**Note**: This plugin uses the `zzz_` prefix to ensure it loads after other plugins like SearchOptionsPlugin, enabling seamless integration with existing TiddlyWiki setups.