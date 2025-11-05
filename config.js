// Secret Santa Configuration
// This can be overridden via Settings modal (stored in localStorage)

window.SECRET_SANTA_CONFIG = {
    // GitHub persistence settings (editable via Settings modal)
    owner: "YOUR_GITHUB_USERNAME",
    repo: "YOUR_REPO_NAME",
    branch: "main",
    participantsPath: "participants.json",
    statePath: "state.json",

    // UI behavior
    allowSpinnerIdentity: true,     // enable dropdown to avoid self-assignments
    showCountsOnly: true,           // don't reveal who's left, only counts
    maxCommitRetries: 3,

    // Proxy URL (optional, set via Settings)
    proxyUrl: null
};

// Load user overrides from localStorage
(function() {
    try {
        const saved = localStorage.getItem('secret_santa_config');
        if (saved) {
            const parsed = JSON.parse(saved);
            Object.assign(window.SECRET_SANTA_CONFIG, parsed);
        }
    } catch (e) {
        console.warn('Failed to load config from localStorage:', e);
    }
})();

