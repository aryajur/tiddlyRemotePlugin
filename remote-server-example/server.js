/**
 * Example Remote Storage Server for TiddlyWiki RemoteStoragePlugin
 *
 * This is a simple Node.js/Express server that implements the API
 * required by the RemoteStoragePlugin.
 *
 * API Endpoints:
 * - GET    /api/tiddlers          - List all tiddlers
 * - GET    /api/tiddlers/:title   - Get a specific tiddler
 * - PUT    /api/tiddlers/:title   - Create/update a tiddler
 * - DELETE /api/tiddlers/:title   - Delete a tiddler
 * - GET    /api/search?q=query    - Search tiddlers
 */

const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const fs = require('fs').promises;
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_DIR = process.env.DATA_DIR || './tiddlers';
const API_KEY = process.env.API_KEY || 'your-secret-api-key';

// Middleware
app.use(cors());
app.use(bodyParser.json({ limit: '50mb' }));

// Optional API key authentication
function checkApiKey(req, res, next) {
	if (API_KEY && req.headers['x-api-key'] !== API_KEY) {
		return res.status(401).json({ error: 'Unauthorized' });
	}
	next();
}

// Ensure data directory exists
async function ensureDataDir() {
	try {
		await fs.mkdir(DATA_DIR, { recursive: true });
	} catch (err) {
		console.error('Failed to create data directory:', err);
	}
}

// Helper functions
function sanitizeFilename(title) {
	// Replace characters that are invalid in filenames
	return title.replace(/[<>:"/\\|?*]/g, '_');
}

function getTiddlerPath(title) {
	return path.join(DATA_DIR, sanitizeFilename(title) + '.json');
}

// Routes

// GET /api/tiddlers - List all tiddlers
app.get('/api/tiddlers', checkApiKey, async (req, res) => {
	try {
		const files = await fs.readdir(DATA_DIR);
		const tiddlers = [];

		for (const file of files) {
			if (file.endsWith('.json')) {
				try {
					const content = await fs.readFile(path.join(DATA_DIR, file), 'utf8');
					const tiddler = JSON.parse(content);
					tiddlers.push({
						title: tiddler.title,
						modified: tiddler.modified,
						modifier: tiddler.modifier,
						tags: tiddler.tags || []
					});
				} catch (err) {
					console.error(`Error reading ${file}:`, err);
				}
			}
		}

		res.json(tiddlers);
	} catch (err) {
		console.error('Error listing tiddlers:', err);
		res.status(500).json({ error: 'Failed to list tiddlers' });
	}
});

// GET /api/tiddlers/:title - Get a specific tiddler
app.get('/api/tiddlers/:title', checkApiKey, async (req, res) => {
	try {
		const filePath = getTiddlerPath(req.params.title);
		const content = await fs.readFile(filePath, 'utf8');
		const tiddler = JSON.parse(content);
		res.json(tiddler);
	} catch (err) {
		if (err.code === 'ENOENT') {
			res.status(404).json({ error: 'Tiddler not found' });
		} else {
			console.error('Error reading tiddler:', err);
			res.status(500).json({ error: 'Failed to read tiddler' });
		}
	}
});

// PUT /api/tiddlers/:title - Create/update a tiddler
app.put('/api/tiddlers/:title', checkApiKey, async (req, res) => {
	try {
		const title = req.params.title;
		const tiddler = req.body;

		// Ensure title matches
		tiddler.title = title;

		// Add server metadata
		tiddler.modified = tiddler.modified || new Date().toISOString();
		tiddler.modifier = tiddler.modifier || 'RemoteStorage';

		// Save to file
		const filePath = getTiddlerPath(title);
		await fs.writeFile(filePath, JSON.stringify(tiddler, null, 2), 'utf8');

		res.json({ success: true, tiddler: tiddler });
	} catch (err) {
		console.error('Error saving tiddler:', err);
		res.status(500).json({ error: 'Failed to save tiddler' });
	}
});

// DELETE /api/tiddlers/:title - Delete a tiddler
app.delete('/api/tiddlers/:title', checkApiKey, async (req, res) => {
	try {
		const filePath = getTiddlerPath(req.params.title);
		await fs.unlink(filePath);
		res.json({ success: true });
	} catch (err) {
		if (err.code === 'ENOENT') {
			res.status(404).json({ error: 'Tiddler not found' });
		} else {
			console.error('Error deleting tiddler:', err);
			res.status(500).json({ error: 'Failed to delete tiddler' });
		}
	}
});

// GET /api/search - Search tiddlers
app.get('/api/search', checkApiKey, async (req, res) => {
	try {
		const query = req.query.q || '';
		const files = await fs.readdir(DATA_DIR);
		const results = [];

		for (const file of files) {
			if (file.endsWith('.json')) {
				try {
					const content = await fs.readFile(path.join(DATA_DIR, file), 'utf8');
					const tiddler = JSON.parse(content);

					// Simple text search in title, text, and tags
					const searchText = `${tiddler.title} ${tiddler.text} ${(tiddler.tags || []).join(' ')}`.toLowerCase();
					if (searchText.includes(query.toLowerCase())) {
						results.push({
							title: tiddler.title,
							modified: tiddler.modified,
							modifier: tiddler.modifier,
							tags: tiddler.tags || [],
							// Include a snippet of matching text
							snippet: tiddler.text ? tiddler.text.substring(0, 200) : ''
						});
					}
				} catch (err) {
					console.error(`Error reading ${file}:`, err);
				}
			}
		}

		res.json(results);
	} catch (err) {
		console.error('Error searching tiddlers:', err);
		res.status(500).json({ error: 'Failed to search tiddlers' });
	}
});

// Health check
app.get('/health', (req, res) => {
	res.json({ status: 'ok', dataDir: DATA_DIR });
});

// Start server
async function start() {
	await ensureDataDir();

	app.listen(PORT, () => {
		console.log(`Remote Storage Server running on http://localhost:${PORT}`);
		console.log(`Data directory: ${path.resolve(DATA_DIR)}`);
		console.log(`API Key required: ${!!API_KEY}`);
		console.log('\nAPI Endpoints:');
		console.log('  GET    /api/tiddlers          - List all tiddlers');
		console.log('  GET    /api/tiddlers/:title   - Get a specific tiddler');
		console.log('  PUT    /api/tiddlers/:title   - Create/update a tiddler');
		console.log('  DELETE /api/tiddlers/:title   - Delete a tiddler');
		console.log('  GET    /api/search?q=query    - Search tiddlers');
		console.log('  GET    /health                - Health check');
	});
}

start().catch(err => {
	console.error('Failed to start server:', err);
	process.exit(1);
});