/**
 * Netlify Function: GitHub API Proxy
 * 
 * This proxy keeps the GitHub Personal Access Token server-side,
 * avoiding the need for clients to have their own tokens.
 * 
 * Environment Variables Required:
 * - GITHUB_TOKEN: Your GitHub Personal Access Token
 * 
 * Optional:
 * - GITHUB_OWNER: Default repository owner
 * - GITHUB_REPO: Default repository name
 * - GITHUB_BRANCH: Default branch (default: 'main')
 */

exports.handler = async (event, context) => {
    // Handle CORS preflight
    if (event.httpMethod === 'OPTIONS') {
        return {
            statusCode: 200,
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type',
            },
            body: '',
        };
    }

    // Get token from environment
    const token = process.env.GITHUB_TOKEN;
    if (!token) {
        return {
            statusCode: 500,
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ error: 'GITHUB_TOKEN not configured' }),
        };
    }

    try {
        const { action, path, ref } = event.queryStringParameters || {};
        const branch = ref || process.env.GITHUB_BRANCH || 'main';

        if (action === 'get') {
            return await handleGet(event, token, path, branch);
        } else if (action === 'put') {
            return await handlePut(event, token, path, branch);
        } else {
            return {
                statusCode: 400,
                headers: {
                    'Access-Control-Allow-Origin': '*',
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ error: 'Invalid action. Use "get" or "put"' }),
            };
        }
    } catch (error) {
        console.error('Proxy error:', error);
        return {
            statusCode: 500,
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ 
                error: 'Internal server error',
                message: error.message 
            }),
        };
    }
};

async function handleGet(event, token, path, branch) {
    if (!path) {
        return {
            statusCode: 400,
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ error: 'Path parameter required' }),
        };
    }

    // Get owner/repo from query params or env
    const owner = event.queryStringParameters?.owner || process.env.GITHUB_OWNER;
    const repo = event.queryStringParameters?.repo || process.env.GITHUB_REPO;

    if (!owner || !repo) {
        return {
            statusCode: 400,
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ error: 'Owner and repo required' }),
        };
    }

    const url = `https://api.github.com/repos/${owner}/${repo}/contents/${encodeURIComponent(path)}?ref=${encodeURIComponent(branch)}`;
    
    const response = await fetch(url, {
        headers: {
            'Authorization': `Bearer ${token}`,
            'Accept': 'application/vnd.github+json',
        },
    });

    if (!response.ok) {
        if (response.status === 404) {
            return {
                statusCode: 200,
                headers: {
                    'Access-Control-Allow-Origin': '*',
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ content: null, sha: null }),
            };
        }
        const errorText = await response.text();
        return {
            statusCode: response.status,
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ 
                error: `GitHub API error: ${response.status}`,
                details: errorText 
            }),
        };
    }

    const data = await response.json();
    
    // Decode content if present
    let content = null;
    if (data.content) {
        try {
            const decoded = Buffer.from(data.content.replace(/\n/g, ''), 'base64').toString('utf-8');
            content = JSON.parse(decoded);
        } catch (e) {
            console.error('Failed to decode content:', e);
        }
    }

    return {
        statusCode: 200,
        headers: {
            'Access-Control-Allow-Origin': '*',
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            content: content,
            sha: data.sha,
        }),
    };
}

async function handlePut(event, token, path, branch) {
    if (!path) {
        return {
            statusCode: 400,
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ error: 'Path parameter required' }),
        };
    }

    // Parse request body
    let body;
    try {
        body = JSON.parse(event.body);
    } catch (e) {
        return {
            statusCode: 400,
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ error: 'Invalid JSON body' }),
        };
    }

    const { content: base64Content, sha, message } = body;
    const targetBranch = body.branch || branch;

    if (!base64Content || !message) {
        return {
            statusCode: 400,
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ error: 'Content and message required' }),
        };
    }

    // Get owner/repo from query params or env
    const owner = event.queryStringParameters?.owner || process.env.GITHUB_OWNER;
    const repo = event.queryStringParameters?.repo || process.env.GITHUB_REPO;

    if (!owner || !repo) {
        return {
            statusCode: 400,
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ error: 'Owner and repo required' }),
        };
    }

    const url = `https://api.github.com/repos/${owner}/${repo}/contents/${encodeURIComponent(path)}`;
    
    const putBody = {
        message: message,
        content: base64Content,
        branch: targetBranch,
    };

    if (sha) {
        putBody.sha = sha;
    }

    const response = await fetch(url, {
        method: 'PUT',
        headers: {
            'Authorization': `Bearer ${token}`,
            'Accept': 'application/vnd.github+json',
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(putBody),
    });

    if (!response.ok) {
        const errorText = await response.text();
        let errorData;
        try {
            errorData = JSON.parse(errorText);
        } catch (e) {
            errorData = { message: errorText };
        }

        return {
            statusCode: response.status,
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ 
                error: `GitHub API error: ${response.status}`,
                details: errorData 
            }),
        };
    }

    const data = await response.json();

    return {
        statusCode: 200,
        headers: {
            'Access-Control-Allow-Origin': '*',
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
    };
}

