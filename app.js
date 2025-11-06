// Secret Santa Wheel Application
// Core modules: Config, GitHubStore, LocalStore, State, Wheel, Controller

(function() {
    'use strict';

    // ============================================================================
    // Utility Functions
    // ============================================================================

    function base64Encode(str) {
        return btoa(unescape(encodeURIComponent(str)));
    }

    function base64Decode(str) {
        return decodeURIComponent(escape(atob(str)));
    }

    function retry(fn, times = 3) {
        return new Promise((resolve, reject) => {
            let attempt = 0;
            function attemptCall() {
                attempt++;
                fn()
                    .then(resolve)
                    .catch(err => {
                        if (attempt >= times) {
                            reject(err);
                        } else {
                            setTimeout(attemptCall, 1000 * attempt); // exponential backoff
                        }
                    });
            }
            attemptCall();
        });
    }

    function shuffle(array) {
        const arr = [...array];
        for (let i = arr.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [arr[i], arr[j]] = [arr[j], arr[i]];
        }
        return arr;
    }

    function randomChoice(array) {
        return array[Math.floor(Math.random() * array.length)];
    }

    function showToast(message, duration = 3000) {
        const toast = document.getElementById('toast');
        toast.textContent = message;
        toast.style.display = 'block';
        setTimeout(() => {
            toast.style.display = 'none';
        }, duration);
    }

    // Expose globally for admin panel
    window.showToast = showToast;

    // ============================================================================
    // GitHubStore - Wrapper around GitHub Contents API
    // ============================================================================

    class GitHubStore {
        constructor(config) {
            this.config = config;
            this.token = localStorage.getItem('gh_token') || null;
        }

        getApiUrl(path) {
            const { owner, repo, branch, proxyUrl } = this.config;
            const fullPath = encodeURIComponent(path);
            const refParam = branch ? `&ref=${encodeURIComponent(branch)}` : '';

            if (proxyUrl) {
                return `${proxyUrl}?action=get&path=${fullPath}&owner=${encodeURIComponent(owner)}&repo=${encodeURIComponent(repo)}${refParam}`;
            }
            return `https://api.github.com/repos/${owner}/${repo}/contents/${fullPath}${refParam ? '?' + refParam.substring(1) : ''}`;
        }

        async getFile(path) {
            const url = this.getApiUrl(path);
            const headers = {
                'Accept': 'application/vnd.github+json'
            };

            if (!this.config.proxyUrl && this.token) {
                headers['Authorization'] = `Bearer ${this.token}`;
            }

            try {
                const response = await fetch(url, { headers });
                if (!response.ok) {
                    if (response.status === 404) {
                        return { content: null, sha: null };
                    }
                    const error = new Error(`GitHub API error: ${response.status} ${response.statusText}`);
                    error.status = response.status;
                    // Try to get error details from response
                    try {
                        const errorData = await response.json();
                        error.data = errorData;
                        error.message = errorData.message || error.message;
                    } catch (e) {
                        // Ignore JSON parse errors
                    }
                    throw error;
                }

                const data = await response.json();
                let content;
                if (data.content) {
                    // Handle both proxy (already decoded) and direct API (base64) responses
                    if (typeof data.content === 'string') {
                        content = JSON.parse(base64Decode(data.content.replace(/\n/g, '')));
                    } else {
                        // Already decoded (from proxy)
                        content = data.content;
                    }
                } else {
                    content = null;
                }
                return { content, sha: data.sha };
            } catch (error) {
                console.error('GitHub getFile error:', error);
                throw error;
            }
        }

        async putFile(path, json, sha, message) {
            const { owner, repo, branch, proxyUrl } = this.config;
            const content = base64Encode(JSON.stringify(json, null, 2));

            if (proxyUrl) {
                const url = `${proxyUrl}?action=put&path=${encodeURIComponent(path)}&owner=${encodeURIComponent(owner)}&repo=${encodeURIComponent(repo)}`;
                const body = {
                    content: content,
                    sha: sha,
                    message: message,
                    branch: branch || 'main'
                };
                const response = await fetch(url, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(body)
                });
                if (!response.ok) {
                    const errorData = await response.json().catch(() => ({}));
                    const error = new Error(errorData.message || errorData.error || `Proxy error: ${response.status} ${response.statusText}`);
                    error.status = response.status;
                    error.data = errorData;
                    if (response.status === 409) {
                        error.message = 'Conflict: file was modified. Please refresh and try again.';
                    }
                    throw error;
                }
                return await response.json();
            }

            const url = `https://api.github.com/repos/${owner}/${repo}/contents/${encodeURIComponent(path)}`;
            const body = {
                message: message,
                content: content,
                branch: branch || 'main'
            };
            if (sha) {
                body.sha = sha;
            }

            const headers = {
                'Authorization': `Bearer ${this.token}`,
                'Accept': 'application/vnd.github+json',
                'Content-Type': 'application/json'
            };

            const response = await fetch(url, {
                method: 'PUT',
                headers: headers,
                body: JSON.stringify(body)
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                const error = new Error(errorData.message || `GitHub API error: ${response.status} ${response.statusText}`);
                error.status = response.status;
                error.data = errorData;
                if (response.status === 409) {
                    error.message = 'Conflict: file was modified. Please refresh and try again.';
                }
                throw error;
            }

            return await response.json();
        }
    }

    // ============================================================================
    // LocalStore - Fallback using localStorage
    // ============================================================================

    class LocalStore {
        getFile(path) {
            try {
                const key = `secret_santa_${path}`;
                const data = localStorage.getItem(key);
                if (!data) {
                    return { content: null, sha: null };
                }
                const parsed = JSON.parse(data);
                return { content: parsed.content, sha: parsed.sha || 'local' };
            } catch (error) {
                console.error('LocalStore getFile error:', error);
                return { content: null, sha: null };
            }
        }

        putFile(path, json, sha, message) {
            try {
                const key = `secret_santa_${path}`;
                const data = {
                    content: json,
                    sha: 'local',
                    message: message,
                    timestamp: new Date().toISOString()
                };
                localStorage.setItem(key, JSON.stringify(data));
                return { commit: { sha: 'local' } };
            } catch (error) {
                console.error('LocalStore putFile error:', error);
                throw error;
            }
        }
    }

    // ============================================================================
    // State - In-memory model
    // ============================================================================

    class State {
        constructor() {
            this.participants = [];
            this.assignments = {};
            this.assignedRecipients = new Set();
        }

        loadParticipants(data) {
            if (data && Array.isArray(data.participants)) {
                this.participants = data.participants;
            }
        }

        loadState(data) {
            if (data && data.assignments) {
                this.assignments = { ...data.assignments };
                this.updateAssignedRecipients();
            }
        }

        updateAssignedRecipients() {
            this.assignedRecipients.clear();
            Object.values(this.assignments).forEach(recipient => {
                this.assignedRecipients.add(recipient);
            });
        }

        addAssignment(spinner, recipient) {
            this.assignments[spinner] = recipient;
            this.updateAssignedRecipients();
        }

        getEligibleRecipients(spinnerIdentity = null) {
            const eligible = this.participants.filter(p => !this.assignedRecipients.has(p));
            if (spinnerIdentity && spinnerIdentity !== '') {
                return eligible.filter(p => p !== spinnerIdentity);
            }
            return eligible;
        }

        mergeAssignments(remoteAssignments) {
            // Union merge: keep remote if key exists, add local new ones
            Object.keys(remoteAssignments).forEach(key => {
                if (!this.assignments[key]) {
                    this.assignments[key] = remoteAssignments[key];
                }
            });
            this.updateAssignedRecipients();
        }
    }

    // ============================================================================
    // Wheel - Canvas drawing and spin physics
    // ============================================================================

    class Wheel {
        constructor(canvasId) {
            this.canvas = document.getElementById(canvasId);
            this.ctx = this.canvas.getContext('2d');
            this.participants = [];
            this.assignedRecipients = new Set();
            this.currentRotation = 0;
            this.isSpinning = false;
            this.targetAngle = 0;
            this.animationId = null;
            this.resize();
            window.addEventListener('resize', () => this.resize());
        }

        resize() {
            const container = this.canvas.parentElement;
            const size = Math.min(container.clientWidth - 40, 600);
            this.canvas.width = size;
            this.canvas.height = size;
            this.centerX = size / 2;
            this.centerY = size / 2;
            this.radius = size / 2 - 20;
            this.draw();
        }

        setParticipants(participants, assignedRecipients) {
            this.participants = participants;
            this.assignedRecipients = assignedRecipients;
            this.draw();
        }

        draw() {
            const ctx = this.ctx;
            ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

            if (this.participants.length === 0) {
                ctx.fillStyle = '#64748b';
                ctx.font = '16px sans-serif';
                ctx.textAlign = 'center';
                ctx.fillText('No participants', this.centerX, this.centerY);
                return;
            }

            const anglePerSegment = (2 * Math.PI) / this.participants.length;

            // Draw segments - all rendered identically regardless of assignment status
            this.participants.forEach((name, index) => {
                const startAngle = index * anglePerSegment + this.currentRotation;
                const endAngle = (index + 1) * anglePerSegment + this.currentRotation;

                // Draw segment
                ctx.beginPath();
                ctx.moveTo(this.centerX, this.centerY);
                ctx.arc(this.centerX, this.centerY, this.radius, startAngle, endAngle);
                ctx.closePath();

                // Color: purely index-based alternating colors for readability
                // No conditional styling based on assignment status
                const baseFill = index % 2 === 0 ? '#f5f5f7' : '#e9e9ef';
                ctx.fillStyle = baseFill;
                ctx.strokeStyle = '#e2e8f0';
                ctx.fill();
                ctx.stroke();

                // Draw text - identical styling for all names
                const midAngle = (startAngle + endAngle) / 2;
                const textRadius = this.radius * 0.7;
                const x = this.centerX + Math.cos(midAngle) * textRadius;
                const y = this.centerY + Math.sin(midAngle) * textRadius;

                ctx.save();
                ctx.translate(x, y);
                ctx.rotate(midAngle + Math.PI / 2);
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillStyle = '#1e293b';
                ctx.globalAlpha = 1; // Always full opacity
                ctx.font = `600 ${Math.max(12, Math.min(16, this.radius / 20))}px system-ui`;
                ctx.fillText(name, 0, 0); // No prefix, no conditional display
                ctx.restore();
            });

            // Draw center circle
            ctx.beginPath();
            ctx.arc(this.centerX, this.centerY, 30, 0, 2 * Math.PI);
            ctx.fillStyle = '#ffffff';
            ctx.fill();
            ctx.strokeStyle = '#1e293b';
            ctx.lineWidth = 2;
            ctx.stroke();
        }

        spinToTarget(targetName, onComplete) {
            if (this.isSpinning) return;
            if (this.participants.length === 0) return;

            const targetIndex = this.participants.indexOf(targetName);
            if (targetIndex === -1) {
                console.error('Target not found in participants:', targetName);
                return;
            }

            this.isSpinning = true;
            const anglePerSegment = (2 * Math.PI) / this.participants.length;
            // Calculate the center angle of the target segment (0-based, so add 0.5 to get center)
            const targetSegmentCenterAngle = targetIndex * anglePerSegment + (anglePerSegment / 2);
            
            // Normalize current rotation to 0-2π range
            const normalizedRotation = this.currentRotation % (2 * Math.PI);
            const normalizedRotationPositive = normalizedRotation < 0 ? normalizedRotation + 2 * Math.PI : normalizedRotation;
            
            // Calculate rotation: multiple full spins + land on target segment center
            const spins = 5 + Math.random() * 3; // 5-8 full spins
            const fullSpins = spins * 2 * Math.PI;
            
            // Target angle: we want to land with the pointer (at 0/up) pointing to the target segment center
            // The pointer is at angle 0 (top), so we need to rotate so that the target segment center aligns with the pointer
            // Since segments are drawn starting from currentRotation, we need to account for that
            // Final position: targetSegmentCenterAngle should be at angle 0 (pointing up)
            const targetFinalAngle = 2 * Math.PI - targetSegmentCenterAngle;
            this.targetAngle = fullSpins + targetFinalAngle - normalizedRotationPositive;

            const startTime = Date.now();
            const duration = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 1000 : 3000;
            const startRotation = this.currentRotation;

            const animate = () => {
                const elapsed = Date.now() - startTime;
                const progress = Math.min(elapsed / duration, 1);
                
                // Easing: cubic ease-out
                const eased = 1 - Math.pow(1 - progress, 3);
                
                this.currentRotation = startRotation + this.targetAngle * eased;
                this.draw();

                if (progress < 1) {
                    this.animationId = requestAnimationFrame(animate);
                } else {
                    this.isSpinning = false;
                    // Ensure we land exactly on target
                    this.currentRotation = startRotation + this.targetAngle;
                    // Normalize to prevent overflow
                    this.currentRotation = this.currentRotation % (2 * Math.PI);
                    this.draw();
                    if (onComplete) onComplete();
                }
            };

            animate();
        }

        stopSpin() {
            if (this.animationId) {
                cancelAnimationFrame(this.animationId);
                this.animationId = null;
            }
            this.isSpinning = false;
        }
    }

    // ============================================================================
    // Confetti Animation
    // ============================================================================

    function createConfetti() {
        const canvas = document.createElement('canvas');
        canvas.style.position = 'fixed';
        canvas.style.top = '0';
        canvas.style.left = '0';
        canvas.style.width = '100%';
        canvas.style.height = '100%';
        canvas.style.pointerEvents = 'none';
        canvas.style.zIndex = '9999';
        document.body.appendChild(canvas);

        const ctx = canvas.getContext('2d');
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;

        const particles = [];
        const colors = ['#2563eb', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'];

        for (let i = 0; i < 50; i++) {
            particles.push({
                x: canvas.width / 2,
                y: canvas.height / 2,
                vx: (Math.random() - 0.5) * 10,
                vy: (Math.random() - 0.5) * 10 - 5,
                color: colors[Math.floor(Math.random() * colors.length)],
                size: Math.random() * 5 + 2,
                rotation: Math.random() * Math.PI * 2,
                rotationSpeed: (Math.random() - 0.5) * 0.2
            });
        }

        function animate() {
            ctx.clearRect(0, 0, canvas.width, canvas.height);

            for (let i = particles.length - 1; i >= 0; i--) {
                const p = particles[i];
                p.x += p.vx;
                p.y += p.vy;
                p.vy += 0.3; // gravity
                p.rotation += p.rotationSpeed;

                ctx.save();
                ctx.translate(p.x, p.y);
                ctx.rotate(p.rotation);
                ctx.fillStyle = p.color;
                ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size);
                ctx.restore();

                if (p.y > canvas.height || p.x < 0 || p.x > canvas.width) {
                    particles.splice(i, 1);
                }
            }

            if (particles.length > 0) {
                requestAnimationFrame(animate);
            } else {
                document.body.removeChild(canvas);
            }
        }

        animate();
    }

    // ============================================================================
    // Controller - Main app logic
    // ============================================================================

    class Controller {
        constructor() {
            this.config = window.SECRET_SANTA_CONFIG;
            this.githubStore = new GitHubStore(this.config);
            this.localStore = new LocalStore();
            this.state = new State();
            this.wheel = new Wheel('wheel-canvas');
            this.store = null; // Will be set based on token availability
            this.isLoading = false;
            this.init();
        }

        async init() {
            this.setupEventListeners();
            await this.loadData();
            this.updateUI();
            this.checkTokenWarning();
        }

        setupEventListeners() {
            document.getElementById('spin-button').addEventListener('click', () => this.handleSpin());
            document.getElementById('settings-button').addEventListener('click', () => this.openSettings());
            document.getElementById('admin-button').addEventListener('click', () => window.AdminPanel?.open());
            document.getElementById('close-settings').addEventListener('click', () => this.closeSettings());
            document.getElementById('settings-form').addEventListener('submit', (e) => {
                e.preventDefault();
                this.saveSettings();
            });
            document.getElementById('hide-result-button').addEventListener('click', () => this.hideResult());
            document.getElementById('open-settings-from-warning')?.addEventListener('click', () => this.openSettings());

            // Keyboard shortcuts
            document.addEventListener('keydown', (e) => {
                if (e.key === 'Escape') {
                    this.closeSettings();
                    this.hideResult();
                }
            });
        }

        checkTokenWarning() {
            const token = localStorage.getItem('gh_token');
            const warning = document.getElementById('token-warning');
            if (!token) {
                warning.style.display = 'block';
            } else {
                warning.style.display = 'none';
            }
        }

        async loadData() {
            this.isLoading = true;
            this.updateStatusMessage('Loading...');

            try {
                // Determine which store to use
                const hasToken = !!localStorage.getItem('gh_token');
                this.store = hasToken ? this.githubStore : this.localStore;

                // Load participants
                let participantsData = { content: null, sha: null };
                try {
                    participantsData = await this.store.getFile(this.config.participantsPath);
                } catch (error) {
                    console.warn('Failed to load participants from store, trying local:', error);
                    participantsData = this.localStore.getFile(this.config.participantsPath);
                }

                if (!participantsData.content) {
                    // Seed with sample data
                    const sample = { participants: ['Alice', 'Bob', 'Charlie', 'Dani', 'Eli', 'Fran', 'Gus', 'Hana'] };
                    this.state.loadParticipants(sample);
                    // Try to save
                    try {
                        await this.store.putFile(this.config.participantsPath, sample, null, 'Initial participants');
                    } catch (e) {
                        console.warn('Could not save initial participants:', e);
                    }
                } else {
                    this.state.loadParticipants(participantsData.content);
                }

                // Load state
                let stateData = { content: null, sha: null };
                try {
                    stateData = await this.store.getFile(this.config.statePath);
                } catch (error) {
                    console.warn('Failed to load state from store, trying local:', error);
                    stateData = this.localStore.getFile(this.config.statePath);
                }

                if (!stateData.content) {
                    const emptyState = { assignments: {} };
                    this.state.loadState(emptyState);
                    // Try to save
                    try {
                        await this.store.putFile(this.config.statePath, emptyState, null, 'Initial state');
                    } catch (e) {
                        console.warn('Could not save initial state:', e);
                    }
                } else {
                    this.state.loadState(stateData.content);
                }

                // Update spinner identity dropdown
                this.updateSpinnerDropdown();

            } catch (error) {
                console.error('Load error:', error);
                showToast('Failed to load data. Using local storage.', 5000);
                // Fallback to local only
                this.store = this.localStore;
                const localParticipants = this.localStore.getFile(this.config.participantsPath);
                const localState = this.localStore.getFile(this.config.statePath);
                if (localParticipants.content) this.state.loadParticipants(localParticipants.content);
                if (localState.content) this.state.loadState(localState.content);
            } finally {
                this.isLoading = false;
                this.updateStatusMessage('');
            }

            this.wheel.setParticipants(this.state.participants, this.state.assignedRecipients);
        }

        updateSpinnerDropdown() {
            const select = document.getElementById('spinner-identity');
            const currentValue = select.value;
            select.innerHTML = '<option value="">I\'m just spinning</option>';
            this.state.participants.forEach(name => {
                const option = document.createElement('option');
                option.value = name;
                option.textContent = name;
                select.appendChild(option);
            });
            select.value = currentValue;
        }

        updateUI() {
            const eligible = this.state.getEligibleRecipients();
            const assignedCount = this.state.assignedRecipients.size;
            const totalCount = this.state.participants.length;

            // Update status line - show aggregate counts only, no per-name info
            document.getElementById('participants-count').textContent = 
                `${totalCount} total • ${assignedCount} assigned`;

            // Update spin button
            const spinButton = document.getElementById('spin-button');
            if (eligible.length === 0) {
                spinButton.disabled = true;
                this.updateStatusMessage('No more spins available.');
            } else {
                spinButton.disabled = false;
                this.updateStatusMessage('');
            }
        }

        updateStatusMessage(message) {
            document.getElementById('status-message').textContent = message;
        }

        async handleSpin() {
            if (this.isLoading || this.wheel.isSpinning) return;

            const spinnerIdentity = document.getElementById('spinner-identity').value;
            
            // Refresh state before calculating eligibility
            this.state.updateAssignedRecipients();
            const eligible = this.state.getEligibleRecipients(spinnerIdentity);

            if (eligible.length === 0) {
                showToast('No eligible recipients remaining.');
                return;
            }

            // Select random target from eligible ONLY
            const target = randomChoice(eligible);
            
            // Double-check target is still eligible (defensive programming)
            if (!eligible.includes(target) || this.state.assignedRecipients.has(target)) {
                console.error('Selected target is not eligible:', target, 'Eligible:', eligible);
                showToast('Error: Selected recipient is not eligible. Please try again.');
                return;
            }

            // Lock UI
            this.isLoading = true;
            const spinButton = document.getElementById('spin-button');
            spinButton.disabled = true;

            // Animate wheel
            this.wheel.spinToTarget(target, async () => {
                // After animation completes, handle assignment
                await this.commitAssignment(spinnerIdentity || 'anonymous', target);
            });
        }

        async commitAssignment(spinnerName, recipient, isAdjustment = false) {
            const maxRetries = this.config.maxCommitRetries || 3;
            let retryCount = 0;
            let lastStateSha = null;

            while (retryCount < maxRetries) {
                try {
                    // Get current state with sha
                    let stateData;
                    try {
                        stateData = await this.store.getFile(this.config.statePath);
                    } catch (error) {
                        // Fallback to local
                        stateData = this.localStore.getFile(this.config.statePath);
                        this.store = this.localStore;
                    }

                    // Merge remote assignments if they exist
                    if (stateData.content && stateData.content.assignments) {
                        this.state.mergeAssignments(stateData.content.assignments);
                        
                        // Re-check eligibility BEFORE committing
                        this.state.updateAssignedRecipients();
                        const eligible = this.state.getEligibleRecipients(
                            document.getElementById('spinner-identity').value
                        );
                        
                        if (!eligible.includes(recipient) || this.state.assignedRecipients.has(recipient)) {
                            // Recipient no longer available, pick another
                            if (eligible.length === 0) {
                                showToast('No eligible recipients remaining. Please refresh.');
                                this.isLoading = false;
                                document.getElementById('spin-button').disabled = false;
                                this.updateUI();
                                return;
                            }
                            recipient = randomChoice(eligible);
                            // Quick adjustment spin to new target
                            if (!isAdjustment) {
                                // Only do adjustment spin if this is the first attempt
                                this.wheel.spinToTarget(recipient, () => {
                                    // Continue with commit after adjustment spin
                                    this.commitAssignment(spinnerName, recipient, true).catch(err => {
                                        console.error('Failed to commit after adjustment:', err);
                                        this.isLoading = false;
                                        document.getElementById('spin-button').disabled = false;
                                        showToast('Failed to save assignment. Please try again.');
                                    });
                                });
                                showToast('Assignment adjusted due to conflict.');
                                return; // Return early, will commit after adjustment spin completes
                            } else {
                                // If already adjusting, just continue with the new recipient
                                showToast('Adjusting to available recipient...');
                                // Continue with the loop to commit
                            }
                        }
                    }

                    // Final validation: ensure recipient is still eligible
                    this.state.updateAssignedRecipients();
                    if (this.state.assignedRecipients.has(recipient)) {
                        throw new Error(`Recipient ${recipient} is already assigned. Please refresh and try again.`);
                    }

                    // Add assignment
                    this.state.addAssignment(spinnerName, recipient);
                    
                    // Update wheel immediately to reflect new assignment
                    this.wheel.setParticipants(this.state.participants, this.state.assignedRecipients);

                    // Prepare commit
                    const stateJson = {
                        assignments: this.state.assignments
                    };
                    const timestamp = new Date().toISOString();
                    const message = `feat(spin): ${spinnerName} → ${recipient} at ${timestamp}`;

                    // Commit
                    try {
                        await this.store.putFile(this.config.statePath, stateJson, stateData.sha, message);
                        
                        // Success!
                        createConfetti();
                        this.showResult(recipient);
                        this.updateUI();
                        this.isLoading = false;
                        document.getElementById('spin-button').disabled = false;
                        return;
                    } catch (error) {
                        if (error.status === 409) {
                            // Conflict, retry
                            retryCount++;
                            if (retryCount < maxRetries) {
                                showToast(`Conflict detected. Retrying... (${retryCount}/${maxRetries})`);
                                await new Promise(resolve => setTimeout(resolve, 1000));
                                continue;
                            }
                        }
                        throw error;
                    }
                } catch (error) {
                    console.error('Commit error:', error);
                    
                    // Fallback to localStorage
                    if (this.store !== this.localStore) {
                        showToast('GitHub write failed. Saving to local storage.', 5000);
                        this.store = this.localStore;
                        const stateJson = { assignments: this.state.assignments };
                        this.localStore.putFile(this.config.statePath, stateJson, null, 'Local fallback');
                        createConfetti();
                        this.showResult(recipient);
                        this.updateUI();
                        this.isLoading = false;
                        document.getElementById('spin-button').disabled = false;
                        return;
                    } else {
                        showToast('Failed to save assignment.', 5000);
                        this.isLoading = false;
                        this.updateUI();
                        return;
                    }
                }
            }

            // Max retries exceeded
            showToast('Failed after multiple retries. Please refresh and try again.', 5000);
            this.isLoading = false;
            this.updateUI();
        }

        showResult(recipient) {
            const modal = document.getElementById('result-modal');
            document.getElementById('result-recipient').textContent = recipient;
            modal.style.display = 'flex';
            
            // Announce to screen readers
            const announcement = document.createElement('div');
            announcement.setAttribute('aria-live', 'assertive');
            announcement.setAttribute('aria-atomic', 'true');
            announcement.className = 'sr-only';
            announcement.textContent = `You are assigned to ${recipient}`;
            document.body.appendChild(announcement);
            setTimeout(() => document.body.removeChild(announcement), 1000);
        }

        hideResult() {
            document.getElementById('result-modal').style.display = 'none';
            // Clear result text
            document.getElementById('result-recipient').textContent = '';
        }

        openSettings() {
            const modal = document.getElementById('settings-modal');
            const config = this.config;
            
            document.getElementById('gh-token').value = localStorage.getItem('gh_token') || '';
            document.getElementById('repo-owner').value = config.owner;
            document.getElementById('repo-name').value = config.repo;
            document.getElementById('repo-branch').value = config.branch;
            document.getElementById('proxy-url').value = config.proxyUrl || '';
            
            modal.style.display = 'flex';
        }

        closeSettings() {
            document.getElementById('settings-modal').style.display = 'none';
        }

        saveSettings() {
            const token = document.getElementById('gh-token').value.trim();
            const owner = document.getElementById('repo-owner').value.trim();
            const repo = document.getElementById('repo-name').value.trim();
            const branch = document.getElementById('repo-branch').value.trim();
            const proxyUrl = document.getElementById('proxy-url').value.trim() || null;

            if (token) {
                localStorage.setItem('gh_token', token);
            } else {
                localStorage.removeItem('gh_token');
            }

            // Update config
            this.config.owner = owner;
            this.config.repo = repo;
            this.config.branch = branch;
            this.config.proxyUrl = proxyUrl;

            // Save to localStorage
            localStorage.setItem('secret_santa_config', JSON.stringify({
                owner, repo, branch, proxyUrl
            }));

            // Update store
            this.githubStore = new GitHubStore(this.config);

            this.closeSettings();
            this.checkTokenWarning();
            showToast('Settings saved.');
            
            // Reload data
            this.loadData();
        }
    }

    // Initialize app when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            window.SecretSantaApp = new Controller();
        });
    } else {
        window.SecretSantaApp = new Controller();
    }
})();

