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

## Installation

### Method 1: Copy/Paste (Recommended)

1. **Download** `zzz_RemoteStoragePlugin.js` from this repository

2. **Open your TiddlyWiki** in a browser

3. **Create a new tiddler**:
   - Click "new tiddler"
   - Set title: `zzz_RemoteStoragePlugin`
   - Add tag: `systemConfig` (IMPORTANT!)
   - Content: Copy and paste the entire contents of `zzz_RemoteStoragePlugin.js`

4. **Save and reload** your TiddlyWiki
   - Save the tiddler
   - Save your TiddlyWiki
   - Reload the page

### Method 2: Manual Edit (Advanced)

1. **Open your TiddlyWiki HTML file** in a text editor

2. **Find the store area**:
   - Search for `<div id="storeArea">`

3. **Add the plugin**:
   - Inside the storeArea, add:
   ```html
   <div title="zzz_RemoteStoragePlugin" modifier="YourName" created="202412251200" modified="202412251200" tags="systemConfig">
   <pre>
   [Paste the entire content of zzz_RemoteStoragePlugin.js here]
   </pre>
   </div>
   ```

4. **Save and open** the HTML file in your browser

### Method 3: Build Process (For Developers)

If you're building TiddlyWiki from source:

1. **Copy the plugin** to the plugins directory:
   ```bash
   cp zzz_RemoteStoragePlugin.js plugins/
   ```

2. **Add to build recipe** (if using recipes):
   ```
   plugin: plugins/zzz_RemoteStoragePlugin.js
   ```

3. **Rebuild TiddlyWiki**:
   ```bash
   npm run build-core
   ```

### Verification

After installation, verify the plugin is working:

1. **Check backstage**:
   - Click "backstage"
   - You should see "remote storage" option

2. **Check tiddler toolbar**:
   - Open any tiddler
   - You should see a "remote" button in the toolbar

3. **Check plugin info**:
   - Open the tiddler "zzz_RemoteStoragePlugin"
   - It should have the tag "systemConfig"
   - The type should be "text/javascript"

## Server Setup

### Set Up the Example Server

If you want to run the example server:

1. **Navigate to the server directory**:
   ```bash
   cd remote-server-example
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Start the server**:
   ```bash
   npm start
   ```

The server will run on `http://localhost:3000`

For more details, see `remote-server-example/README.md`

## Configuration

### Configure Remote Storage in TiddlyWiki

1. Click **backstage** → **remote storage**
2. Enter your server URL (e.g., `http://localhost:3000`)
3. Enter API Key (if your server requires one)
4. Enable/disable options:
   - **Auto-sync**: Automatically sync on load
   - **Lazy loading**: Load tiddler content only when opened
   - **Search remote**: Include remote tiddlers in search results
5. Click **Save Settings**
6. Click **Test Connection** to verify

## SearchOptionsPlugin Integration

This plugin is fully compatible with [SearchOptionsPlugin](http://www.tiddlytools.com/#SearchOptionsPlugin) by Eric Shulman:

- **Automatic Integration**: Install both plugins and remote search works immediately
- **List View**: Remote tiddlers appear in SearchOptionsPlugin's list view
- **Toggle Support**: Switch between "Open Tiddlers" and "List View" modes
- **Unified Results**: Local and remote search results displayed together

### Installation Order

The `zzz_` prefix ensures this plugin loads after SearchOptionsPlugin, enabling proper integration.

### Remote Search Features

- **Unified Results**: Local and remote tiddlers appear together in search results
- **Smart Filtering**: Prevents duplicate results when a tiddler exists both locally and remotely
- **Lazy Loading**: Remote tiddler content is only fetched when you open the tiddler
- **Error Handling**: Network errors are shown via TiddlyWiki's message popup system
- **Fallback**: If remote search fails, local search results are still shown

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

## Troubleshooting

### Plugin not appearing
- Ensure the tiddler has the tag `systemConfig`
- Save and reload your TiddlyWiki
- Clear browser cache if needed
- Check browser console for JavaScript errors

### Remote button not showing
- Check that server URL is configured in backstage → "remote storage"
- Verify the ToolbarCommands tiddler includes `remoteStorage`
- Refresh the tiddler display
- Try closing and reopening the tiddler

### Connection errors
- Check server is running (`http://localhost:3000/health` should respond)
- Verify URL is correct (no trailing slash)
- Check browser console for CORS errors
- Ensure API key matches (if used)
- Verify firewall/network settings

### Remote search not working
- Verify "Search Remote" is enabled in backstage → "remote storage"
- Check that server supports `/api/search` endpoint
- Look for error messages in TiddlyWiki's message popup
- Ensure server is online and API key is correct
- Check browser console for network errors

### SearchOptionsPlugin conflicts
- Ensure RemoteStoragePlugin is named with `zzz_` prefix
- Verify SearchOptionsPlugin is installed and working first
- Both plugins should show remote results in list view
- Check browser console for any JavaScript errors

### Sync issues
- Check online/offline status in settings
- Review "Pending changes" count in backstage
- Click "Sync Pending Changes" button if changes are queued
- Check server logs for errors
- Verify server has write permissions to data directory

## Files

- **`zzz_RemoteStoragePlugin.js`** - Main plugin file
- **`CLAUDE.md`** - Development documentation and technical details
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

## Uninstalling

To remove the plugin:

1. Delete the "zzz_RemoteStoragePlugin" tiddler
2. Save your TiddlyWiki
3. Reload the page

Remote tiddlers will be converted back to local storage automatically.

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test with both standalone and SearchOptionsPlugin scenarios
5. Update documentation (README.md and CLAUDE.md if needed)
6. Submit a pull request

## License

BSD Open Source License

## Support

For issues, questions, or contributions:
- Check the **Troubleshooting** section above
- Review `CLAUDE.md` for technical details and development documentation
- Check existing issues in the repository
- Test with the example server in `remote-server-example/`

---

**Note**: This plugin uses the `zzz_` prefix to ensure it loads after other plugins like SearchOptionsPlugin, enabling seamless integration with existing TiddlyWiki setups.