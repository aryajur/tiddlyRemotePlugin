# Installing RemoteStoragePlugin in TiddlyWiki Classic

## Important Notes

- **Plugin Name**: The plugin is named `zzz_RemoteStoragePlugin.js`
- **Loading Order**: The `zzz_` prefix ensures it loads after other plugins (like SearchOptionsPlugin)
- **SearchOptionsPlugin Compatibility**: Works seamlessly with SearchOptionsPlugin for list view search results
- **Remote Search**: Includes remote tiddler search that integrates with any search interface

## Method 1: Copy/Paste (Recommended)

1. **Open your TiddlyWiki**

2. **Create a new tiddler**:
   - Click "new tiddler"
   - Set title: `zzz_RemoteStoragePlugin`
   - Add tag: `systemConfig` (IMPORTANT!)

3. **Copy the plugin code**:
   - Open `zzz_RemoteStoragePlugin.js` in a text editor
   - Copy ALL the content

4. **Paste and save**:
   - Paste the code into the tiddler text area
   - Save the tiddler
   - Save your TiddlyWiki
   - Reload the page

## Method 2: Manual Edit (Advanced)

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

## Method 3: Build Process (For Developers)

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

## Verification

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

## Configuration

1. **Set up the server** (see remote-server-example/README.md):
   ```bash
   cd plugins/remote-server-example
   npm install
   npm start
   ```

2. **Configure in TiddlyWiki**:
   - Click backstage → "remote storage"
   - Enter Server URL: `http://localhost:3000`
   - Enter API Key (if configured)
   - Click "Save Settings"
   - Click "Test Connection"

## SearchOptionsPlugin Compatibility

This plugin is fully compatible with SearchOptionsPlugin by Eric Shulman:

1. **Installation Order**: The `zzz_` prefix ensures RemoteStoragePlugin loads after SearchOptionsPlugin
2. **List View Search**: Remote tiddlers appear in SearchOptionsPlugin's list view alongside local results
3. **Automatic Integration**: No additional configuration needed - remote search works with any search interface
4. **Toggle Support**: Use SearchOptionsPlugin's toggle between "Open Tiddlers" and "List View" modes

### Remote Search Features

- **Unified Results**: Local and remote tiddlers appear together in search results
- **Smart Filtering**: Prevents duplicate results when a tiddler exists both locally and remotely
- **Lazy Loading**: Remote tiddler content is only fetched when you open the tiddler
- **Error Handling**: Network errors are shown via TiddlyWiki's message popup system
- **Fallback**: If remote search fails, local search results are still shown

## Troubleshooting

### Plugin not appearing
- Ensure the tiddler has the tag `systemConfig`
- Save and reload your TiddlyWiki
- Clear browser cache if needed

### Remote button not showing
- Check that server URL is configured
- Verify in backstage → "remote storage"

### Connection errors
- Check server is running
- Verify URL is correct (no trailing slash)
- Check browser console for CORS errors
- Ensure API key matches (if used)

### Remote search not working
- Verify "Search Remote" is enabled in backstage → "remote storage"
- Check that server supports `/api/search` endpoint
- Look for error messages in TiddlyWiki's message popup
- Ensure server is online and API key is correct

### SearchOptionsPlugin conflicts
- Ensure RemoteStoragePlugin is named with `zzz_` prefix
- Verify SearchOptionsPlugin is installed and working first
- Both plugins should show remote results in list view

## Security Notes

- Always use HTTPS in production
- Keep API keys secure
- Don't commit TiddlyWiki with API keys to public repos
- Consider using environment-specific configs

## Uninstalling

To remove the plugin:

1. Delete the "zzz_RemoteStoragePlugin" tiddler
2. Save your TiddlyWiki
3. Reload the page

Remote tiddlers will be converted back to local storage automatically.