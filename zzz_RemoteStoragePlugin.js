/***
|Name|zzz_RemoteStoragePlugin|
|Description|Store tiddlers on a remote server instead of in the HTML file (loads after other plugins)|
|Version|1.9.1|
|Author|Assistant|
|~CoreVersion|2.6.6|
|Type|plugin|
|License|BSD|
!!!!!Code
***/
//{{{
version.extensions.RemoteStoragePlugin = { major: 1, minor: 9, revision: 0, date: new Date(2024, 12, 25) };

(function($) {

// Configuration
config.extensions.RemoteStorage = {
	serverUrl: '', // Set this to your remote server URL
	apiKey: '', // Optional API key for authentication
	cacheTimeout: 300000, // 5 minutes cache timeout
	autoSync: true, // Automatically sync remote tiddlers
	lazyLoading: true, // Load remote tiddlers only when opened
	cache: {}, // Local cache for remote tiddlers
	pendingChanges: {}, // Queue for offline changes
	isOnline: true,
	lastSyncTime: 0, // Track when we last synced the remote list
	searchRemote: true // Enable remote search
};

// Check online status
window.addEventListener('online', function() {
	config.extensions.RemoteStorage.isOnline = true;
	config.extensions.RemoteStorage.syncPendingChanges();
	config.extensions.RemoteStorage.syncRemoteList();
});

window.addEventListener('offline', function() {
	config.extensions.RemoteStorage.isOnline = false;
});

//--
//-- Toolbar command for remote storage toggle (define early)
//--
config.commands.remoteStorage = {
	text: "remote",
	tooltip: "Toggle remote storage for this tiddler",
	isEnabled: function(tiddler) {
		return config.extensions.RemoteStorage.serverUrl !== '';
	},
	handler: function(event, src, title) {
		var tiddler = store.fetchTiddler(title);
		if(!tiddler) return false;

		var isRemote = tiddler.isRemote();

		if(confirm((isRemote ? "Move this tiddler to local storage?" : "Move this tiddler to remote storage?"))) {
			// Clone the tiddler to preserve it
			var newTiddler = new Tiddler(title);
			newTiddler.assign(tiddler.title, tiddler.text, tiddler.modifier,
				tiddler.modified, tiddler.tags, tiddler.created,
				merge({}, tiddler.fields), tiddler.creator);

			// Toggle remote status
			newTiddler.setRemote(!isRemote);

			if(!isRemote) {
				// Moving to remote storage
				var adaptor = new RemoteStorageAdaptor();
				adaptor.putTiddler(newTiddler, {}, null, function(context) {
					if(context.status) {
						store.addTiddler(newTiddler);
						story.refreshTiddler(title, null, true);
						displayMessage("Tiddler moved to remote storage");
					} else {
						displayMessage("Failed to move tiddler: " + context.statusText);
					}
				});
			} else {
				// Moving to local storage - first ensure we have the content
				if(tiddler.text === '[This tiddler is stored remotely]') {
					// Need to fetch content first
					var adaptor = new RemoteStorageAdaptor();
					adaptor.getTiddler(title, {}, null, function(context) {
						if(context.status && context.tiddler) {
							// Now we have the content, save locally and delete remote
							newTiddler.text = context.tiddler.text;
							newTiddler.setRemote(false);
							store.addTiddler(newTiddler);

							// Delete from remote
							adaptor.deleteTiddler(title, {}, null, function(deleteContext) {
								if(deleteContext.status) {
									story.refreshTiddler(title, null, true);
									displayMessage("Tiddler moved to local storage");
								} else {
									displayMessage("Warning: Failed to delete remote copy");
								}
							});
						} else {
							displayMessage("Failed to retrieve tiddler content");
						}
					});
				} else {
					// We already have the content
					var adaptor = new RemoteStorageAdaptor();
					adaptor.deleteTiddler(title, {}, null, function(context) {
						if(context.status) {
							store.addTiddler(newTiddler);
							story.refreshTiddler(title, null, true);
							displayMessage("Tiddler moved to local storage");
						} else {
							displayMessage("Failed to move tiddler: " + context.statusText);
						}
					});
				}
			}
		}

		return false;
	}
};

// Add command to toolbar arrays directly - this ensures it appears
config.commands.remoteStorage.isReadOnly = false;
config.commands.remoteStorage.hideReadOnly = false;

// Force add to toolbar configurations - CAREFULLY handle the > separator
jQuery(document).ready(function() {
	// Wait for TiddlyWiki to be fully loaded
	setTimeout(function() {
		// Update ToolbarCommands tiddler to place remoteStorage in the main toolbar area
		var toolbarTiddler = store.fetchTiddler("ToolbarCommands");
		if(toolbarTiddler) {
			var text = toolbarTiddler.text;
			var needsUpdate = false;


			// Handle ViewToolbar - move remoteStorage from after > to before >
			var viewLine = '';
			var otherLines = [];
			var lines = text.split('\n');

			for(var i = 0; i < lines.length; i++) {
				if(lines[i].indexOf('|ViewToolbar|') === 0) {
					viewLine = lines[i];
				} else {
					otherLines.push(lines[i]);
				}
			}

			if(viewLine) {
				// Parse the ViewToolbar line
				var match = viewLine.match(/\|ViewToolbar\|(.+)\|/);
				if(match) {
					var buttons = match[1];

					// Remove remoteStorage if it exists anywhere
					buttons = buttons.replace(/\s*remoteStorage\s*/g, ' ');

					// Split by > to separate main from more buttons
					if(buttons.indexOf('>') !== -1) {
						var parts = buttons.split('>');
						var mainButtons = parts[0].trim();
						var moreButtons = parts[1].trim();

						// Add remoteStorage to main buttons if not already there
						if(mainButtons.indexOf('remoteStorage') === -1) {
							mainButtons = mainButtons + ' remoteStorage';
							needsUpdate = true;
						}

						// Reconstruct the line
						viewLine = '|ViewToolbar|' + mainButtons + ' > ' + moreButtons + '|';
					} else {
						// No > separator, just add to the end
						if(buttons.indexOf('remoteStorage') === -1) {
							buttons = buttons.trim() + ' remoteStorage';
							viewLine = '|ViewToolbar|' + buttons + '|';
							needsUpdate = true;
						}
					}
				}
			}

			// Handle EditToolbar
			var editLine = '';
			var finalLines = [];

			for(var i = 0; i < otherLines.length; i++) {
				if(otherLines[i].indexOf('|EditToolbar|') === 0) {
					editLine = otherLines[i];
				} else {
					finalLines.push(otherLines[i]);
				}
			}

			if(editLine) {
				var match = editLine.match(/\|EditToolbar\|(.+)\|/);
				if(match) {
					var buttons = match[1];
					if(buttons.indexOf('remoteStorage') === -1) {
						buttons = buttons.trim() + ' remoteStorage';
						editLine = '|EditToolbar|' + buttons + '|';
						needsUpdate = true;
					}
				}
			}

			// Reconstruct the full text
			if(needsUpdate) {
				var newText = [];
				if(viewLine) newText.push(viewLine);
				if(editLine) newText.push(editLine);
				newText = newText.concat(finalLines);

				text = newText.join('\n');

				store.saveTiddler(toolbarTiddler.title, toolbarTiddler.title, text,
					toolbarTiddler.modifier, toolbarTiddler.modified, toolbarTiddler.tags, toolbarTiddler.fields);
				console.log("RemoteStorage: Updated ToolbarCommands tiddler");
			}
		} else {
			// Create ToolbarCommands tiddler with proper > separator
			var toolbarText = "|ViewToolbar|closeTiddler closeOthers +editTiddler remoteStorage > fields syncing permalink references jump|\n" +
							  "|EditToolbar|+saveTiddler -cancelTiddler deleteTiddler remoteStorage|";
			store.saveTiddler("ToolbarCommands", "ToolbarCommands", toolbarText,
				config.options.txtUserName, new Date(), [], {});
			console.log("RemoteStorage: Created ToolbarCommands tiddler");
		}

		// Also update the arrays directly as backup
		if(config.views.wikified.toolbar && config.views.wikified.toolbar.indexOf('remoteStorage') === -1) {
			// Add after editTiddler
			var editIndex = config.views.wikified.toolbar.indexOf('+editTiddler');
			if(editIndex !== -1) {
				config.views.wikified.toolbar.splice(editIndex + 1, 0, 'remoteStorage');
			} else {
				config.views.wikified.toolbar.push('remoteStorage');
			}
		}

		if(config.views.editor.toolbar && config.views.editor.toolbar.indexOf('remoteStorage') === -1) {
			var delIndex = config.views.editor.toolbar.indexOf('deleteTiddler');
			if(delIndex !== -1) {
				config.views.editor.toolbar.splice(delIndex + 1, 0, 'remoteStorage');
			} else {
				config.views.editor.toolbar.push('remoteStorage');
			}
		}

		// Refresh all currently displayed tiddlers to show the new button
		story.forEachTiddler(function(title, element) {
			story.refreshTiddler(title, null, true);
		});

		console.log("RemoteStorage: Toolbar buttons added to main area");
	}, 2000);
});

//--
//-- RemoteStorageAdaptor - Handles communication with remote server
//--
function RemoteStorageAdaptor() {
	this.host = config.extensions.RemoteStorage.serverUrl;
	this.apiKey = config.extensions.RemoteStorage.apiKey;
	return this;
}

RemoteStorageAdaptor.prototype = new AdaptorBase();
RemoteStorageAdaptor.prototype.type = 'remotestorage';

RemoteStorageAdaptor.serverType = 'remotestorage';
RemoteStorageAdaptor.serverLabel = 'Remote Storage';
RemoteStorageAdaptor.serverPrompt = 'Enter the URL of your remote storage server';

// Register the adaptor
config.adaptors.remotestorage = RemoteStorageAdaptor;

// API Methods
RemoteStorageAdaptor.prototype.getTiddlerList = function(context, userParams, callback) {
	context = this.setContext(context, userParams, callback);
	var url = this.host + '/api/tiddlers';

	$.ajax({
		url: url,
		type: 'GET',
		headers: this.apiKey ? { 'X-API-Key': this.apiKey } : {},
		success: function(data) {
			context.tiddlers = data;
			context.status = true;

			// Update local remote tiddler list
			config.extensions.RemoteStorage.updateRemoteList(data);

			if(callback) callback(context, userParams);
		},
		error: function(xhr) {
			context.status = false;
			context.statusText = 'Error getting tiddler list: ' + xhr.statusText;
			if(callback) callback(context, userParams);
		}
	});
	return true;
};

RemoteStorageAdaptor.prototype.getTiddler = function(title, context, userParams, callback) {
	context = this.setContext(context, userParams, callback);
	var url = this.host + '/api/tiddlers/' + encodeURIComponent(title);

	// Check cache first
	var cached = config.extensions.RemoteStorage.getCachedTiddler(title);
	if(cached) {
		context.tiddler = cached;
		context.status = true;
		if(callback) callback(context, userParams);
		return true;
	}

	// Sync remote list before fetching individual tiddler
	var adaptor = this;
	this.getTiddlerList({}, null, function(listContext) {
		if(listContext.status) {
			// Now fetch the individual tiddler
			$.ajax({
				url: url,
				type: 'GET',
				headers: adaptor.apiKey ? { 'X-API-Key': adaptor.apiKey } : {},
				success: function(data) {
					var tiddler = new Tiddler(title);
					tiddler.assign(data.title, data.text, data.modifier,
						new Date(data.modified), data.tags, new Date(data.created),
						data.fields, data.creator);

					// Ensure remote flag is set
					tiddler.fields['remote.storage'] = 'true';

					// Cache the tiddler
					config.extensions.RemoteStorage.cacheTiddler(tiddler);

					context.tiddler = tiddler;
					context.status = true;
					if(callback) callback(context, userParams);
				},
				error: function(xhr) {
					context.status = false;
					context.statusText = 'Error getting tiddler: ' + xhr.statusText;
					if(callback) callback(context, userParams);
				}
			});
		} else {
			// If list sync failed, try to get the tiddler anyway
			$.ajax({
				url: url,
				type: 'GET',
				headers: adaptor.apiKey ? { 'X-API-Key': adaptor.apiKey } : {},
				success: function(data) {
					var tiddler = new Tiddler(title);
					tiddler.assign(data.title, data.text, data.modifier,
						new Date(data.modified), data.tags, new Date(data.created),
						data.fields, data.creator);

					tiddler.fields['remote.storage'] = 'true';
					config.extensions.RemoteStorage.cacheTiddler(tiddler);

					context.tiddler = tiddler;
					context.status = true;
					if(callback) callback(context, userParams);
				},
				error: function(xhr) {
					context.status = false;
					context.statusText = 'Error getting tiddler: ' + xhr.statusText;
					if(callback) callback(context, userParams);
				}
			});
		}
	});

	return true;
};

RemoteStorageAdaptor.prototype.putTiddler = function(tiddler, context, userParams, callback) {
	context = this.setContext(context, userParams, callback);
	var url = this.host + '/api/tiddlers/' + encodeURIComponent(tiddler.title);

	// If offline, queue the change
	if(!config.extensions.RemoteStorage.isOnline) {
		config.extensions.RemoteStorage.queueChange('put', tiddler);
		context.status = true;
		context.statusText = 'Queued for sync when online';
		if(callback) callback(context, userParams);
		return true;
	}

	var data = {
		title: tiddler.title,
		text: tiddler.text,
		modifier: tiddler.modifier,
		modified: tiddler.modified,
		tags: tiddler.tags,
		created: tiddler.created,
		fields: tiddler.fields,
		creator: tiddler.creator
	};

	var adaptor = this;
	$.ajax({
		url: url,
		type: 'PUT',
		headers: this.apiKey ? { 'X-API-Key': this.apiKey } : {},
		data: JSON.stringify(data),
		contentType: 'application/json',
		success: function(response) {
			// Update cache
			config.extensions.RemoteStorage.cacheTiddler(tiddler);

			// Sync remote list after successful save
			adaptor.getTiddlerList({}, null, function(listContext) {
				// List is automatically updated in getTiddlerList success handler
			});

			context.status = true;
			if(callback) callback(context, userParams);
		},
		error: function(xhr) {
			context.status = false;
			context.statusText = 'Error saving tiddler: ' + xhr.statusText;
			if(callback) callback(context, userParams);
		}
	});
	return true;
};

RemoteStorageAdaptor.prototype.deleteTiddler = function(title, context, userParams, callback) {
	context = this.setContext(context, userParams, callback);
	var url = this.host + '/api/tiddlers/' + encodeURIComponent(title);

	// If offline, queue the change
	if(!config.extensions.RemoteStorage.isOnline) {
		config.extensions.RemoteStorage.queueChange('delete', { title: title });
		context.status = true;
		context.statusText = 'Queued for sync when online';
		if(callback) callback(context, userParams);
		return true;
	}

	var adaptor = this;
	$.ajax({
		url: url,
		type: 'DELETE',
		headers: this.apiKey ? { 'X-API-Key': this.apiKey } : {},
		success: function() {
			// Remove from cache
			config.extensions.RemoteStorage.removeCachedTiddler(title);

			// Sync remote list after successful delete
			adaptor.getTiddlerList({}, null, function(listContext) {
				// List is automatically updated in getTiddlerList success handler
			});

			context.status = true;
			if(callback) callback(context, userParams);
		},
		error: function(xhr) {
			context.status = false;
			context.statusText = 'Error deleting tiddler: ' + xhr.statusText;
			if(callback) callback(context, userParams);
		}
	});
	return true;
};

// NEW: Search remote tiddlers
RemoteStorageAdaptor.prototype.searchTiddlers = function(query, context, userParams, callback) {
	context = this.setContext(context, userParams, callback);
	var url = this.host + '/api/search?q=' + encodeURIComponent(query);

	$.ajax({
		url: url,
		type: 'GET',
		headers: this.apiKey ? { 'X-API-Key': this.apiKey } : {},
		success: function(data) {
			context.searchResults = data;
			context.status = true;
			if(callback) callback(context, userParams);
		},
		error: function(xhr) {
			context.status = false;
			context.statusText = 'Error searching remote tiddlers: ' + xhr.statusText;
			if(callback) callback(context, userParams);
		}
	});
	return true;
};

// Update remote tiddler list and sync with local store
config.extensions.RemoteStorage.updateRemoteList = function(remoteTiddlers) {
	if(!remoteTiddlers) return;

	var currentRemoteTitles = [];
	var remoteMap = {};

	// Build map of remote tiddlers
	for(var i = 0; i < remoteTiddlers.length; i++) {
		var remoteTiddler = remoteTiddlers[i];
		currentRemoteTitles.push(remoteTiddler.title);
		remoteMap[remoteTiddler.title] = remoteTiddler;
	}

	// Add new remote tiddlers as placeholders
	for(var title in remoteMap) {
		var remoteTiddler = remoteMap[title];
		var localTiddler = store.fetchTiddler(title);

		if(!localTiddler) {
			// Create placeholder for new remote tiddler
			var placeholder = new Tiddler(title);
			placeholder.assign(
				title,
				'[This tiddler is stored remotely]',
				remoteTiddler.modifier || 'RemoteStorage',
				new Date(remoteTiddler.modified || new Date()),
				remoteTiddler.tags || [],
				new Date(remoteTiddler.created || new Date()),
				{
					'remote.storage': 'true',
					'server.type': 'remotestorage',
					'server.host': this.serverUrl
				}
			);
			store.addTiddler(placeholder);
			displayMessage("Found new remote tiddler: " + title);
		} else if(localTiddler.isRemote() && localTiddler.text === '[This tiddler is stored remotely]') {
			// Update placeholder metadata if needed
			var needsUpdate = false;
			if(remoteTiddler.modified && localTiddler.modified.getTime() !== new Date(remoteTiddler.modified).getTime()) {
				localTiddler.modified = new Date(remoteTiddler.modified);
				needsUpdate = true;
			}
			if(remoteTiddler.modifier && localTiddler.modifier !== remoteTiddler.modifier) {
				localTiddler.modifier = remoteTiddler.modifier;
				needsUpdate = true;
			}
			if(needsUpdate) {
				store.addTiddler(localTiddler);
			}
		}
	}

	// Remove local placeholders for tiddlers that no longer exist remotely
	store.forEachTiddler(function(title, tiddler) {
		if(tiddler.isRemote() &&
		   tiddler.text === '[This tiddler is stored remotely]' &&
		   currentRemoteTitles.indexOf(title) === -1) {
			// This remote tiddler no longer exists on server
			store.deleteTiddler(title);
			displayMessage("Remote tiddler deleted from server: " + title);
		}
	});

	this.lastSyncTime = new Date().getTime();

	// Refresh the story to update any displayed tiddlers
	story.forEachTiddler(function(title, element) {
		story.refreshTiddler(title, null, true);
	});
};

// Sync remote list (can be called independently)
config.extensions.RemoteStorage.syncRemoteList = function() {
	if(!this.serverUrl || !this.isOnline) return;

	var adaptor = new RemoteStorageAdaptor();
	adaptor.getTiddlerList({}, null, function(context) {
		if(context.status) {
			// updateRemoteList is called automatically in getTiddlerList
			displayMessage("Remote tiddler list synchronized");
		} else {
			displayMessage("Failed to sync remote list: " + context.statusText);
		}
	});
};

// Cache management
config.extensions.RemoteStorage.cacheTiddler = function(tiddler) {
	this.cache[tiddler.title] = {
		tiddler: tiddler,
		timestamp: new Date().getTime()
	};
};

config.extensions.RemoteStorage.getCachedTiddler = function(title) {
	var cached = this.cache[title];
	if(cached) {
		var age = new Date().getTime() - cached.timestamp;
		if(age < this.cacheTimeout) {
			return cached.tiddler;
		}
		delete this.cache[title];
	}
	return null;
};

config.extensions.RemoteStorage.removeCachedTiddler = function(title) {
	delete this.cache[title];
};

// Queue management for offline changes
config.extensions.RemoteStorage.queueChange = function(operation, data) {
	var key = data.title || data;
	this.pendingChanges[key] = {
		operation: operation,
		data: data,
		timestamp: new Date().getTime()
	};
	// Save to localStorage for persistence
	if(window.localStorage) {
		localStorage.setItem('RemoteStorage.pendingChanges', JSON.stringify(this.pendingChanges));
	}
};

config.extensions.RemoteStorage.syncPendingChanges = function() {
	if(!this.isOnline) return;

	var adaptor = new RemoteStorageAdaptor();
	for(var key in this.pendingChanges) {
		var change = this.pendingChanges[key];
		switch(change.operation) {
			case 'put':
				adaptor.putTiddler(change.data, {}, null, function(context) {
					if(context.status) {
						delete config.extensions.RemoteStorage.pendingChanges[key];
					}
				});
				break;
			case 'delete':
				adaptor.deleteTiddler(change.data.title, {}, null, function(context) {
					if(context.status) {
						delete config.extensions.RemoteStorage.pendingChanges[key];
					}
				});
				break;
		}
	}
	// Update localStorage
	if(window.localStorage) {
		localStorage.setItem('RemoteStorage.pendingChanges', JSON.stringify(this.pendingChanges));
	}
};

// Load pending changes from localStorage on startup
if(window.localStorage) {
	var pending = localStorage.getItem('RemoteStorage.pendingChanges');
	if(pending) {
		try {
			config.extensions.RemoteStorage.pendingChanges = JSON.parse(pending);
		} catch(e) {}
	}
}

//--
//-- Tiddler extensions - Add remote storage field
//--
Tiddler.prototype.isRemote = function() {
	return this.fields['remote.storage'] === 'true';
};

Tiddler.prototype.setRemote = function(isRemote) {
	if(isRemote) {
		this.fields['remote.storage'] = 'true';
		this.fields['server.type'] = 'remotestorage';
		this.fields['server.host'] = config.extensions.RemoteStorage.serverUrl;
	} else {
		delete this.fields['remote.storage'];
		delete this.fields['server.type'];
		delete this.fields['server.host'];
	}
};

//--
//-- Override store.saveTiddler to handle remote tiddlers
//--
var originalSaveTiddler = store.saveTiddler;
store.saveTiddler = function(title, newTitle, newBody, modifier, modified, tags, fields, clearChangeCount, created, creator) {
	// Get the existing tiddler to check if it's remote
	var existingTiddler = store.fetchTiddler(title);
	var wasRemote = existingTiddler && existingTiddler.isRemote();

	// Call the original saveTiddler to update the local store
	var result = originalSaveTiddler.apply(this, arguments);

	// Get the newly saved tiddler
	var newTiddler = store.fetchTiddler(newTitle || title);

	// If it's a remote tiddler, sync to server and don't mark as dirty
	if(newTiddler && newTiddler.isRemote()) {
		// Save to remote server
		var adaptor = new RemoteStorageAdaptor();
		adaptor.putTiddler(newTiddler, {}, null, function(context) {
			if(context.status) {
				// Clear the dirty flag since we've saved to remote
				store.setDirty(false);
				displayMessage("Remote tiddler '" + newTiddler.title + "' saved to server");
			} else {
				displayMessage("Failed to save remote tiddler: " + context.statusText);
			}
		});

		// If this was originally a remote tiddler, clear dirty immediately
		// since the content is going to the server, not the HTML file
		if(wasRemote) {
			store.setDirty(false);
		}
	}

	return result;
};

//--
//-- Override store.deleteTiddler to handle remote tiddlers
//--
var originalDeleteTiddler = store.deleteTiddler;
store.deleteTiddler = function(title) {
	var tiddler = store.fetchTiddler(title);

	// If it's a remote tiddler, delete from server
	if(tiddler && tiddler.isRemote()) {
		var adaptor = new RemoteStorageAdaptor();
		adaptor.deleteTiddler(title, {}, null, function(context) {
			if(context.status) {
				displayMessage("Remote tiddler '" + title + "' deleted from server");
			} else {
				displayMessage("Failed to delete remote tiddler: " + context.statusText);
			}
		});
	}

	// Call the original deleteTiddler
	return originalDeleteTiddler.apply(this, arguments);
};

//--
//-- Override story.displayTiddler for lazy loading
//--
var originalDisplayTiddler = story.displayTiddler;
story.displayTiddler = function(srcElement, tiddler, template, animate, slowly) {
	var title = tiddler instanceof Tiddler ? tiddler.title : tiddler;
	var t = store.fetchTiddler(title);

	// If it's a remote tiddler placeholder, fetch the real content
	if(t && t.isRemote() && t.text === '[This tiddler is stored remotely]') {
		// Show loading message
		displayMessage("Loading remote tiddler: " + title);

		// Fetch from server (this will also sync the remote list)
		var adaptor = new RemoteStorageAdaptor();
		adaptor.getTiddler(title, {}, null, function(context) {
			if(context.status && context.tiddler) {
				// Preserve the remote flag
				context.tiddler.setRemote(true);
				store.addTiddler(context.tiddler);
				// Display the tiddler
				originalDisplayTiddler.call(story, srcElement, context.tiddler, template, animate, slowly);
			} else {
				displayMessage("Failed to load remote tiddler: " + title);
			}
		});

		// Don't display the placeholder
		return null;
	}

	// Normal display for non-remote or already-loaded tiddlers
	return originalDisplayTiddler.apply(this, arguments);
};

//--
//-- Override store.search to include remote results
//-- This works with any search interface (original, SearchOptionsPlugin, etc.)
//-- Uses synchronous waiting with timeout for remote results
//--
var originalStoreSearch = TiddlyWiki.prototype.search;
TiddlyWiki.prototype.search = function(searchRegExp, sortField, excludeTag, match) {
	// Get local results first using original search
	var localResults = originalStoreSearch.call(this, searchRegExp, sortField, excludeTag, match);

	// If remote search is enabled and we have a server, also search remotely
	if(config.extensions.RemoteStorage.searchRemote &&
	   config.extensions.RemoteStorage.serverUrl &&
	   config.extensions.RemoteStorage.isOnline) {

		try {
			// Convert RegExp to string for server search
			var query = searchRegExp.source;
			var url = config.extensions.RemoteStorage.serverUrl + '/api/search?q=' + encodeURIComponent(query);

			// Make synchronous XMLHttpRequest
			var xhr = new XMLHttpRequest();
			xhr.open('GET', url, false); // false = synchronous
			xhr.setRequestHeader('X-API-Key', config.extensions.RemoteStorage.apiKey);
			xhr.send();

			if(xhr.status === 200) {
				var searchResults = JSON.parse(xhr.responseText);

				if(searchResults.length > 0) {
					// Process remote search results
					var remoteResults = [];
					var localTitles = localResults.map(function(t) { return t.title; });

					for(var i = 0; i < searchResults.length; i++) {
						var result = searchResults[i];

						// Skip if already in local results
						if(localTitles.indexOf(result.title) !== -1) {
							continue;
						}

						var tiddler = store.fetchTiddler(result.title);

						if(tiddler) {
							// Server already confirmed this tiddler matches the search, so include it
							remoteResults.push(tiddler);
						} else {
							// Create placeholder for missing remote tiddler
							var placeholder = new Tiddler(result.title, '[This tiddler is stored remotely]',
								config.options.txtUserName, new Date(), result.tags || [], new Date());
							placeholder.setRemote(true);
							store.addTiddler(placeholder);
							remoteResults.push(placeholder);
						}
					}

					if(remoteResults.length > 0) {
						// Combine local and remote results
						var combinedResults = localResults.concat(remoteResults);

						// Sort combined results if needed
						if(sortField) {
							combinedResults.sort(function(a, b) {
								return a[sortField] < b[sortField] ? -1 : (a[sortField] == b[sortField] ? 0 : +1)
							});
						}

						return combinedResults;
					}
				}
			} else {
				displayMessage("Remote search failed (HTTP " + xhr.status + ")");
			}
		} catch(e) {
			displayMessage("Remote search error: " + e.message);
		}
	}

	// Return local results (either no remote search or no remote results)
	return localResults;
};


//--
//-- Override TiddlyWiki save mechanism
//--
var originalAllTiddlersAsHtml = store.allTiddlersAsHtml;
store.allTiddlersAsHtml = function() {
	var original = originalAllTiddlersAsHtml.apply(this, arguments);

	// Filter out remote tiddlers but include a placeholder
	var lines = original.split('\n');
	var result = [];
	var inRemoteTiddler = false;
	var currentTiddler = null;

	for(var i = 0; i < lines.length; i++) {
		var line = lines[i];

		// Check for tiddler start
		var titleMatch = line.match(/<div title="([^"]+)"/);
		if(titleMatch) {
			currentTiddler = store.fetchTiddler(titleMatch[1]);
			if(currentTiddler && currentTiddler.isRemote()) {
				inRemoteTiddler = true;
				// Add a placeholder for the remote tiddler
				result.push('<div title="' + titleMatch[1] + '" modifier="RemoteStorage" created="' +
					currentTiddler.created.convertToYYYYMMDDHHMM() + '" modified="' +
					currentTiddler.modified.convertToYYYYMMDDHHMM() + '" remote.storage="true" ' +
					'server.type="remotestorage" server.host="' + config.extensions.RemoteStorage.serverUrl + '">' +
					'<pre>[This tiddler is stored remotely]</pre></div>');
				continue;
			}
		}

		// Check for tiddler end
		if(line.indexOf('</div>') !== -1 && inRemoteTiddler) {
			inRemoteTiddler = false;
			continue;
		}

		// Skip lines inside remote tiddlers
		if(!inRemoteTiddler) {
			result.push(line);
		}
	}

	return result.join('\n');
};

//--
//-- Override TiddlyWiki load mechanism
//--
var originalLoadFromDiv = store.loadFromDiv;
store.loadFromDiv = function(src, idPrefix, noUpdate) {
	originalLoadFromDiv.apply(this, arguments);

	// After loading, sync remote list to get any new remote tiddlers
	if(config.extensions.RemoteStorage.autoSync) {
		config.extensions.RemoteStorage.syncRemoteList();
	}
};

// Sync remote tiddlers (for non-lazy loading)
config.extensions.RemoteStorage.syncRemoteTiddlers = function() {
	store.forEachTiddler(function(title, tiddler) {
		if(tiddler.isRemote() && tiddler.text === '[This tiddler is stored remotely]') {
			// Fetch the real content from remote server
			var adaptor = new RemoteStorageAdaptor();
			adaptor.getTiddler(title, {}, null, function(context) {
				if(context.status && context.tiddler) {
					// Preserve the remote flag
					context.tiddler.setRemote(true);
					store.addTiddler(context.tiddler);
					story.refreshTiddler(title, null, true);
				}
			});
		}
	});
};

// Modify toolbar creation to check remote status
var originalInvokeCommand = config.macros.toolbar.invokeCommand;
config.macros.toolbar.invokeCommand = function(place, title, subTitle, className, params) {
	var tiddler = store.fetchTiddler(title);

	// Special handling for remoteStorage command
	if(className === 'remoteStorage' && tiddler && tiddler.isRemote()) {
		// Create button with special styling
		var btn = createTiddlyButton(place,
			config.commands.remoteStorage.text + " ✓",
			"This tiddler is stored remotely",
			config.commands.remoteStorage.handler,
			className + ' remoteActive');
		btn.setAttribute('commandName', className);
		btn.setAttribute('tiddler', title);
		return btn;
	}

	return originalInvokeCommand.apply(this, arguments);
};

//--
//-- Add CSS for remote storage indicators
//--
config.shadowTiddlers.StyleSheetRemoteStorage =
"/*{{{*/\n" +
".toolbar .remoteStorage { color: #666; }\n" +
".toolbar .remoteStorage.remoteActive { \n" +
"  color: #0a84ff !important;\n" +
"  font-weight: bold;\n" +
"  background: linear-gradient(135deg, #e3f2fd 0%, #bbdefb 100%);\n" +
"  padding: 1px 4px;\n" +
"  border-radius: 3px;\n" +
"  border: 1px solid #0a84ff;\n" +
"}\n" +
".toolbar .remoteStorage:hover { \n" +
"  background: #f0f0f0;\n" +
"  text-decoration: none;\n" +
"}\n" +
".tiddler.remoteIndication {\n" +
"  border-left: 3px solid #0a84ff;\n" +
"}\n" +
"/*}}}*/";

store.addNotification("StyleSheetRemoteStorage", refreshStyles);

// Mark tiddlers with remote indication
var originalRefreshTiddler = story.refreshTiddler;
story.refreshTiddler = function(title, template, force, customFields, defaultText) {
	var result = originalRefreshTiddler.apply(this, arguments);

	// Add visual indication for remote tiddlers
	var tiddlerElem = story.getTiddler(title);
	if(tiddlerElem) {
		var tiddler = store.fetchTiddler(title);
		if(tiddler && tiddler.isRemote()) {
			jQuery(tiddlerElem).addClass('remoteIndication');
		} else {
			jQuery(tiddlerElem).removeClass('remoteIndication');
		}
	}

	return result;
};

//--
//-- Configuration macro
//--
config.macros.remoteStorage = {
	label: "Remote Storage Settings",
	prompt: "Configure remote storage server",
	handler: function(place) {
		var wrapper = createTiddlyElement(place, 'div', null, 'remoteStorageConfig');

		createTiddlyElement(wrapper, 'h3', null, null, 'Remote Storage Configuration');

		var form = createTiddlyElement(wrapper, 'div');

		// Server URL
		createTiddlyElement(form, 'label', null, null, 'Server URL: ');
		var urlInput = createTiddlyElement(form, 'input', null, null);
		urlInput.type = 'text';
		urlInput.value = config.extensions.RemoteStorage.serverUrl;
		urlInput.style.width = '300px';
		createTiddlyElement(form, 'br');

		// API Key
		createTiddlyElement(form, 'label', null, null, 'API Key (optional): ');
		var keyInput = createTiddlyElement(form, 'input', null, null);
		keyInput.type = 'password';
		keyInput.value = config.extensions.RemoteStorage.apiKey;
		keyInput.style.width = '300px';
		createTiddlyElement(form, 'br');

		// Auto sync
		createTiddlyElement(form, 'label', null, null, 'Auto-sync: ');
		var autoSyncCheck = createTiddlyElement(form, 'input', null, null);
		autoSyncCheck.type = 'checkbox';
		autoSyncCheck.checked = config.extensions.RemoteStorage.autoSync;
		createTiddlyElement(form, 'br');

		// Lazy loading
		createTiddlyElement(form, 'label', null, null, 'Lazy loading (load when opened): ');
		var lazyCheck = createTiddlyElement(form, 'input', null, null);
		lazyCheck.type = 'checkbox';
		lazyCheck.checked = config.extensions.RemoteStorage.lazyLoading;
		createTiddlyElement(form, 'br');

		// Remote search
		createTiddlyElement(form, 'label', null, null, 'Search remote tiddlers: ');
		var searchCheck = createTiddlyElement(form, 'input', null, null);
		searchCheck.type = 'checkbox';
		searchCheck.checked = config.extensions.RemoteStorage.searchRemote;
		createTiddlyElement(form, 'br');

		// Cache timeout
		createTiddlyElement(form, 'label', null, null, 'Cache timeout (ms): ');
		var cacheInput = createTiddlyElement(form, 'input', null, null);
		cacheInput.type = 'number';
		cacheInput.value = config.extensions.RemoteStorage.cacheTimeout;
		createTiddlyElement(form, 'br');

		// Save button
		createTiddlyButton(form, 'Save Settings', 'Save remote storage configuration', function() {
			config.extensions.RemoteStorage.serverUrl = urlInput.value;
			config.extensions.RemoteStorage.apiKey = keyInput.value;
			config.extensions.RemoteStorage.autoSync = autoSyncCheck.checked;
			config.extensions.RemoteStorage.lazyLoading = lazyCheck.checked;
			config.extensions.RemoteStorage.searchRemote = searchCheck.checked;
			config.extensions.RemoteStorage.cacheTimeout = parseInt(cacheInput.value);

			// Save to localStorage
			if(window.localStorage) {
				localStorage.setItem('RemoteStorage.serverUrl', config.extensions.RemoteStorage.serverUrl);
				localStorage.setItem('RemoteStorage.apiKey', config.extensions.RemoteStorage.apiKey);
				localStorage.setItem('RemoteStorage.autoSync', config.extensions.RemoteStorage.autoSync);
				localStorage.setItem('RemoteStorage.lazyLoading', config.extensions.RemoteStorage.lazyLoading);
				localStorage.setItem('RemoteStorage.searchRemote', config.extensions.RemoteStorage.searchRemote);
				localStorage.setItem('RemoteStorage.cacheTimeout', config.extensions.RemoteStorage.cacheTimeout);
			}

			displayMessage('Remote storage settings saved');

			// Trigger list sync after settings change
			if(config.extensions.RemoteStorage.autoSync) {
				config.extensions.RemoteStorage.syncRemoteList();
			}
		});

		// Test connection button
		createTiddlyButton(form, 'Test Connection', 'Test connection to remote server', function() {
			var adaptor = new RemoteStorageAdaptor();
			adaptor.host = urlInput.value;
			adaptor.apiKey = keyInput.value;

			adaptor.getTiddlerList({}, null, function(context) {
				if(context.status) {
					displayMessage('Connection successful! Found ' +
						(context.tiddlers ? context.tiddlers.length : 0) + ' remote tiddlers');
				} else {
					displayMessage('Connection failed: ' + context.statusText);
				}
			});
		});

		// Sync now button
		createTiddlyButton(form, 'Sync Remote List', 'Sync the remote tiddler list now', function() {
			config.extensions.RemoteStorage.syncRemoteList();
		});

		// Status display
		var statusDiv = createTiddlyElement(wrapper, 'div', null, 'remoteStorageStatus');
		createTiddlyElement(statusDiv, 'h4', null, null, 'Status');
		var statusText = 'Online: ' + config.extensions.RemoteStorage.isOnline;
		statusText += '\nLazy Loading: ' + (config.extensions.RemoteStorage.lazyLoading ? 'Enabled' : 'Disabled');
		statusText += '\nRemote Search: ' + (config.extensions.RemoteStorage.searchRemote ? 'Enabled' : 'Disabled');
		statusText += '\nCached tiddlers: ' + Object.keys(config.extensions.RemoteStorage.cache).length;
		statusText += '\nPending changes: ' + Object.keys(config.extensions.RemoteStorage.pendingChanges).length;
		statusText += '\nLast sync: ' + (config.extensions.RemoteStorage.lastSyncTime ?
			new Date(config.extensions.RemoteStorage.lastSyncTime).toLocaleString() : 'Never');
		createTiddlyElement(statusDiv, 'pre', null, null, statusText);

		// Sync pending changes button
		if(Object.keys(config.extensions.RemoteStorage.pendingChanges).length > 0) {
			createTiddlyButton(statusDiv, 'Sync Pending Changes', 'Sync pending offline changes', function() {
				config.extensions.RemoteStorage.syncPendingChanges();
				displayMessage('Syncing pending changes...');
			});
		}
	}
};

// Load settings from localStorage on startup
if(window.localStorage) {
	var url = localStorage.getItem('RemoteStorage.serverUrl');
	if(url) config.extensions.RemoteStorage.serverUrl = url;

	var key = localStorage.getItem('RemoteStorage.apiKey');
	if(key) config.extensions.RemoteStorage.apiKey = key;

	var autoSync = localStorage.getItem('RemoteStorage.autoSync');
	if(autoSync) config.extensions.RemoteStorage.autoSync = autoSync === 'true';

	var lazyLoading = localStorage.getItem('RemoteStorage.lazyLoading');
	if(lazyLoading) config.extensions.RemoteStorage.lazyLoading = lazyLoading === 'true';

	var searchRemote = localStorage.getItem('RemoteStorage.searchRemote');
	if(searchRemote) config.extensions.RemoteStorage.searchRemote = searchRemote === 'true';

	var timeout = localStorage.getItem('RemoteStorage.cacheTimeout');
	if(timeout) config.extensions.RemoteStorage.cacheTimeout = parseInt(timeout);
}

// Add to backstage
config.backstageTasks.push('remoteStorage');
merge(config.tasks, {
	remoteStorage: {
		text: 'remote storage',
		tooltip: 'Configure remote storage for tiddlers',
		content: '<<remoteStorage>>'
	}
});

// Auto-sync remote list on startup
jQuery(document).ready(function() {
	if(config.extensions.RemoteStorage.autoSync && config.extensions.RemoteStorage.serverUrl) {
		setTimeout(function() {
			// Always sync the remote list first
			config.extensions.RemoteStorage.syncRemoteList();

			// Sync pending changes
			config.extensions.RemoteStorage.syncPendingChanges();

			// If not using lazy loading, also sync tiddler content
			if(!config.extensions.RemoteStorage.lazyLoading) {
				setTimeout(function() {
					config.extensions.RemoteStorage.syncRemoteTiddlers();
				}, 2000);
			}
		}, 1000);
	}
});

})(jQuery);
//}}}