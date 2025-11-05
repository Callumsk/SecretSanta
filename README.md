# Secret Santa Wheel

A zero-build, static HTML app for spinning a wheel to assign Secret Santa recipients. State is persisted to a GitHub repository via the GitHub Contents API, with localStorage fallback.

## Features

- 🎄 **Zero-build**: Pure HTML/CSS/vanilla JavaScript. No bundlers, no build step.
- 🔄 **GitHub Persistence**: State saved to GitHub repository with optimistic locking and conflict handling.
- 📱 **Responsive**: Works on desktop and mobile devices.
- ♿ **Accessible**: Keyboard navigation, screen reader support, reduced motion support.
- 🎨 **Modern UI**: Clean, minimal design with smooth animations.
- 🔒 **Admin Panel**: Manage participants, reset assignments, export data.

## Quick Start

### 1. Create GitHub Repository

1. Create a new repository on GitHub (e.g., `secret-santa`).
2. Upload all files from this project to the repository.
3. Enable GitHub Pages:
   - Go to Settings → Pages
   - Select source branch (usually `main`)
   - Save

### 2. Create Personal Access Token

1. Go to GitHub Settings → Developer settings → Personal access tokens → Fine-grained tokens
2. Click "Generate new token"
3. Set:
   - **Token name**: `Secret Santa App`
   - **Repository access**: Only select your repository
   - **Permissions**: 
     - Contents: Read and write
   - **Expiration**: Set as needed
4. Click "Generate token"
5. **Copy the token immediately** (you won't see it again)

### 3. Configure the App

1. Open the app (via GitHub Pages or locally by opening `index.html`)
2. Click **Settings**
3. Fill in:
   - **GitHub Personal Access Token**: Paste your token
   - **Repository Owner**: Your GitHub username
   - **Repository Name**: Your repository name (e.g., `secret-santa`)
   - **Branch**: Usually `main`
4. Click **Save Settings**

The token is stored in your browser's localStorage only—never shared with any server.

### 4. Initial Setup (Optional)

If you want to customize the participant list:

1. Click **Admin** (you'll set a passphrase the first time)
2. Add or remove participants
3. Changes are saved to `participants.json` in your repository

## How It Works

### Wheel Selection Logic

- The wheel always shows **all participants**
- Already-assigned recipients appear **greyed out** and cannot be selected
- If you select your identity before spinning, you won't be assigned to yourself
- Each spin assigns exactly one unique recipient
- When all recipients are assigned, the Spin button is disabled

### State Persistence

- **Primary**: GitHub repository (via Contents API)
- **Fallback**: localStorage (if GitHub write fails)
- **Conflict Handling**: Uses optimistic locking with SHA values. On 409 conflicts, automatically retries with merged state.

### Privacy

- Assignment results are shown in a modal to the current user only
- Assignments are not displayed in the main UI
- State is stored in plain JSON (not encrypted)—repository members can read it
- For extra privacy, consider using a private repository

## File Structure

```
secret-santa/
├── index.html          # Main HTML structure
├── styles.css          # All styling
├── app.js              # Core application logic
├── admin.js            # Admin panel functionality
├── config.js           # Configuration (can be overridden via Settings)
├── participants.json   # Participant list (created/updated via Admin)
├── state.json          # Assignments state (auto-created)
└── README.md           # This file
```

## Configuration

Default configuration is in `config.js`. You can override these via the Settings modal:

- `owner`: GitHub repository owner
- `repo`: Repository name
- `branch`: Branch name (default: `main`)
- `participantsPath`: Path to participants file (default: `participants.json`)
- `statePath`: Path to state file (default: `state.json`)
- `allowSpinnerIdentity`: Enable identity selector (default: `true`)
- `maxCommitRetries`: Max retries on conflict (default: `3`)

## Troubleshooting

### "No GitHub token configured" Warning

- Open Settings and paste your Personal Access Token
- Ensure the token has `Contents: Read and write` permissions

### 401 Unauthorized

- Check that your token is valid and hasn't expired
- Verify the token has the correct permissions

### 403 Forbidden

- Ensure the token has write access to the repository
- Check that the repository owner/name are correct

### 409 Conflict

- This is normal when multiple people spin simultaneously
- The app automatically retries with merged state
- If conflicts persist, refresh the page

### Rate Limiting

- GitHub API has rate limits (5000 requests/hour for authenticated users)
- If you hit limits, wait a bit and try again
- Consider using the proxy option (see below)

### Missing SHA Error

- The app should handle this automatically
- If issues persist, check that the repository files exist

### Local Storage Only

- If GitHub writes fail, the app falls back to localStorage
- You'll see a toast notification
- Data is only available in that browser

## Security Notes

### Token Storage

- Tokens are stored in browser localStorage only
- Never commit tokens to the repository
- Each user needs their own token (for write access)
- For public repositories, consider using the proxy option

### Repository Access

- Anyone with the repository URL can read assignments (if public)
- Use a private repository for true secrecy
- Or deploy via a proxy (see below)

## Optional: Proxy Setup

To avoid exposing Personal Access Tokens to clients, you can use a proxy server. The proxy stores the token server-side and forwards API requests.

### Netlify Functions Example

See `proxy/README_PROXY.md` and `proxy/netlify/functions/github-proxy.js` for a complete example.

1. Deploy the proxy function
2. In the app Settings, set the Proxy URL
3. The app will route all GitHub API calls through the proxy

## Admin Panel

The Admin panel allows you to:

- **Add/Remove Participants**: Manage the participant list
- **Reset Assignments**: Clear all assignments (with confirmation)
- **Reorder Participants**: Drag and drop to reorder
- **Export CSV**: Download assignments as CSV

First-time access requires setting a passphrase (stored locally only).

## Limitations

- Token is client-side (for public repos, use proxy)
- No real-time updates (refresh to see others' assignments)
- Manual conflict resolution may be needed in extreme cases
- State is human-readable (not encrypted)

## Browser Support

- Modern browsers (Chrome, Firefox, Safari, Edge)
- Requires JavaScript enabled
- Canvas API support for wheel rendering

## Development

No build process required. Just:

1. Open `index.html` in a browser
2. Make changes to files
3. Refresh to see updates

For GitHub Pages deployment:

1. Commit and push changes
2. GitHub Pages auto-updates

## License

Use freely for your Secret Santa events!

## Support

If you encounter issues:

1. Check the browser console for errors
2. Verify GitHub token permissions
3. Ensure repository files exist
4. Try the localStorage fallback mode

Enjoy your Secret Santa! 🎄

