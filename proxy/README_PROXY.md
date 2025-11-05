# GitHub API Proxy

This proxy allows you to keep your GitHub Personal Access Token server-side instead of exposing it to clients. This is especially useful for public repositories where you don't want users to need their own tokens.

## Why Use a Proxy?

- **Security**: Token stays on the server, never exposed to clients
- **Convenience**: Users don't need to configure tokens
- **Rate Limits**: Centralized token usage can be better managed
- **Access Control**: You can add additional authentication/authorization

## Supported Platforms

### Netlify Functions

See `netlify/functions/github-proxy.js` for a complete implementation.

### Cloudflare Workers

Similar pattern, adapt the Netlify example for Cloudflare Workers API.

### Other Platforms

Any serverless function platform (Vercel, AWS Lambda, etc.) can host this proxy.

## Setup (Netlify Example)

### 1. Create Netlify Function

1. In your Netlify project, create a directory: `netlify/functions/github-proxy/`
2. Copy `github-proxy.js` into that directory
3. Rename it to `github-proxy.js` (or keep the name, Netlify will use the directory name)

### 2. Set Environment Variables

In Netlify dashboard → Site settings → Environment variables:

- `GITHUB_TOKEN`: Your GitHub Personal Access Token
- `GITHUB_OWNER`: Repository owner (optional, can be passed in request)
- `GITHUB_REPO`: Repository name (optional, can be passed in request)
- `GITHUB_BRANCH`: Branch name (optional, default: `main`)

### 3. Deploy

1. Push to your repository
2. Netlify will auto-deploy
3. The function will be available at: `https://your-site.netlify.app/.netlify/functions/github-proxy`

### 4. Configure App

In the Secret Santa app Settings:
- Set **Proxy URL** to: `https://your-site.netlify.app/.netlify/functions/github-proxy`
- Leave GitHub token blank (not needed with proxy)
- Set repository owner/name/branch

## API Endpoints

The proxy handles two actions:

### GET (Read File)

```
GET /api/github?action=get&path=participants.json&ref=main
```

Response:
```json
{
  "content": { ... },
  "sha": "abc123..."
}
```

### PUT (Write File)

```
POST /api/github?action=put&path=state.json
Content-Type: application/json

{
  "content": "base64...",
  "sha": "abc123...",
  "message": "commit message",
  "branch": "main"
}
```

Response:
```json
{
  "commit": { "sha": "xyz789..." }
}
```

## Security Considerations

### Token Storage

- Store token as environment variable (never in code)
- Use different tokens for different environments
- Rotate tokens periodically

### Access Control (Optional)

You can add authentication to the proxy:

```javascript
// Example: Check API key
const apiKey = event.headers['x-api-key'];
if (apiKey !== process.env.API_KEY) {
    return { statusCode: 401, body: JSON.stringify({ error: 'Unauthorized' }) };
}
```

### CORS

The proxy should allow CORS from your app domain:

```javascript
headers: {
    'Access-Control-Allow-Origin': 'https://your-app-domain.com',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
}
```

## Rate Limiting

GitHub API rate limits:
- **Authenticated**: 5,000 requests/hour
- **Unauthenticated**: 60 requests/hour

Consider implementing rate limiting in the proxy if you expect high traffic.

## Error Handling

The proxy should:
- Return appropriate HTTP status codes
- Include error messages in response body
- Log errors for debugging (but don't expose sensitive info)

## Testing

Test the proxy directly:

```bash
# Test GET
curl "https://your-proxy.netlify.app/.netlify/functions/github-proxy?action=get&path=participants.json"

# Test PUT
curl -X POST "https://your-proxy.netlify.app/.netlify/functions/github-proxy?action=put&path=state.json" \
  -H "Content-Type: application/json" \
  -d '{"content":"...","sha":"...","message":"test","branch":"main"}'
```

## Troubleshooting

### 401 Unauthorized

- Check that `GITHUB_TOKEN` environment variable is set
- Verify token is valid and has correct permissions

### 403 Forbidden

- Token may not have write access
- Repository may be private and token doesn't have access

### 500 Internal Server Error

- Check Netlify function logs
- Verify environment variables are set
- Check that GitHub API is accessible

### CORS Errors

- Ensure proxy includes CORS headers
- Check that app domain matches allowed origin

## Alternative: Cloudflare Workers

```javascript
export default {
  async fetch(request) {
    const url = new URL(request.url);
    const action = url.searchParams.get('action');
    const token = GITHUB_TOKEN; // Set in Cloudflare dashboard

    if (action === 'get') {
      // Handle GET
    } else if (action === 'put') {
      // Handle PUT
    }
  }
}
```

## Cost Considerations

- **Netlify**: Free tier includes 125,000 function invocations/month
- **Cloudflare Workers**: Free tier includes 100,000 requests/day
- Both should be sufficient for typical Secret Santa usage

