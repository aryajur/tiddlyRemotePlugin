# Remote Storage Server for TiddlyWiki

This is an example server implementation for the TiddlyWiki RemoteStoragePlugin.

## Setup

1. Install dependencies:
```bash
npm install
```

2. Configure environment variables (optional):
```bash
export PORT=3000                    # Server port (default: 3000)
export DATA_DIR=./tiddlers          # Directory to store tiddlers (default: ./tiddlers)
export API_KEY=your-secret-api-key  # API key for authentication (optional)
```

3. Start the server:
```bash
npm start
```

For development with auto-reload:
```bash
npm run dev
```

## API Endpoints

- `GET /api/tiddlers` - List all tiddlers
- `GET /api/tiddlers/:title` - Get a specific tiddler
- `PUT /api/tiddlers/:title` - Create/update a tiddler
- `DELETE /api/tiddlers/:title` - Delete a tiddler
- `GET /api/search?q=query` - Search tiddlers
- `GET /health` - Health check

## Authentication

If `API_KEY` environment variable is set, all API requests must include the `X-API-Key` header:

```
X-API-Key: your-secret-api-key
```

## Storage

Tiddlers are stored as JSON files in the `DATA_DIR` directory (default: `./tiddlers`).
Each tiddler is saved as a separate `.json` file with the tiddler's title as the filename.

## Using with TiddlyWiki

1. Install the RemoteStoragePlugin in your TiddlyWiki
2. Open the Backstage area and click "remote storage"
3. Configure:
   - Server URL: `http://localhost:3000`
   - API Key: (your API key if set)
   - Auto-sync: Enable for automatic synchronization
4. Save settings and test the connection

## Docker Support

Create a `Dockerfile`:

```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY server.js ./
EXPOSE 3000
CMD ["node", "server.js"]
```

Build and run:
```bash
docker build -t tiddlywiki-remote-storage .
docker run -p 3000:3000 -v $(pwd)/tiddlers:/app/tiddlers tiddlywiki-remote-storage
```

## Security Notes

- Always use HTTPS in production
- Use a strong API key
- Consider implementing user authentication for multi-user scenarios
- Add rate limiting to prevent abuse
- Validate and sanitize all input data
- Implement proper backup strategies for your tiddler data