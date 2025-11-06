// Admin Panel for Secret Santa
// Handles participant management, assignment reset, and exports

(function() {
    'use strict';

    class AdminPanel {
        constructor() {
            this.passphraseKey = 'secret_santa_admin_passphrase';
            this.isUnlocked = false;
            this.init();
        }

        init() {
            this.setupEventListeners();
            this.checkUnlock();
        }

        setupEventListeners() {
            // Use event delegation for buttons that might be in hidden modals
            document.addEventListener('click', (e) => {
                // Handle clicks on buttons or their children
                const target = e.target.closest('button') || e.target;
                const id = target.id;
                
                if (id === 'admin-button') {
                    this.open();
                } else if (id === 'admin-unlock') {
                    this.unlock();
                } else if (id === 'close-admin') {
                    this.close();
                } else if (id === 'add-participant') {
                    e.preventDefault();
                    e.stopPropagation();
                    this.addParticipant();
                } else if (id === 'reset-assignments') {
                    this.resetAssignments();
                } else if (id === 'export-csv') {
                    this.exportCSV();
                } else if (target.classList.contains('participant-remove')) {
                    const name = target.getAttribute('data-name');
                    if (name) {
                        this.removeParticipant(name);
                    }
                }
            });

            // Enter key on passphrase input
            document.addEventListener('keypress', (e) => {
                if (e.target.id === 'admin-passphrase' && e.key === 'Enter') {
                    e.preventDefault();
                    this.unlock();
                } else if (e.target.id === 'new-participant' && e.key === 'Enter') {
                    e.preventDefault();
                    this.addParticipant();
                }
            });
        }

        checkUnlock() {
            const saved = localStorage.getItem(this.passphraseKey);
            if (saved) {
                // Check if user has already unlocked this session
                const sessionUnlocked = sessionStorage.getItem('admin_unlocked');
                if (sessionUnlocked === saved) {
                    this.isUnlocked = true;
                }
            }
        }

        unlock() {
            const input = document.getElementById('admin-passphrase');
            const passphrase = input.value.trim();

            if (!passphrase) {
                alert('Please enter a passphrase.');
                return;
            }

            const saved = localStorage.getItem(this.passphraseKey);
            if (!saved) {
                // First time: save it
                localStorage.setItem(this.passphraseKey, passphrase);
                sessionStorage.setItem('admin_unlocked', passphrase);
                this.showAdminPanel();
            } else if (passphrase === saved) {
                // Correct passphrase
                sessionStorage.setItem('admin_unlocked', passphrase);
                this.showAdminPanel();
            } else {
                alert('Incorrect passphrase.');
                input.value = '';
            }
        }

        showAdminPanel() {
            this.isUnlocked = true;
            document.getElementById('admin-gate').style.display = 'none';
            document.getElementById('admin-panel').style.display = 'block';
            this.loadParticipantsList();
            this.loadAssignmentsDisplay();
        }

        open() {
            if (!this.isUnlocked) {
                document.getElementById('admin-gate').style.display = 'block';
                document.getElementById('admin-panel').style.display = 'none';
                document.getElementById('admin-passphrase').value = '';
            } else {
                this.showAdminPanel();
            }
            document.getElementById('admin-modal').style.display = 'flex';
        }

        close() {
            document.getElementById('admin-modal').style.display = 'none';
        }

        loadParticipantsList() {
            const app = window.SecretSantaApp;
            if (!app) return;

            const list = document.getElementById('admin-participants-list');
            list.innerHTML = '';

            app.state.participants.forEach((name, index) => {
                const item = document.createElement('div');
                item.className = 'participant-item';
                item.innerHTML = `
                    <span class="participant-drag-handle" title="Drag to reorder">☰</span>
                    <span class="participant-name">${this.escapeHtml(name)}</span>
                    <button class="participant-remove" data-name="${this.escapeHtml(name)}">Remove</button>
                `;
                
                // Event delegation handles the click, no need for individual listener
                list.appendChild(item);
            });

            // Simple drag-drop (basic implementation)
            this.setupDragDrop(list);
        }

        setupDragDrop(list) {
            let draggedElement = null;

            Array.from(list.children).forEach(item => {
                const handle = item.querySelector('.participant-drag-handle');
                handle.draggable = true;
                
                handle.addEventListener('dragstart', (e) => {
                    draggedElement = item;
                    e.dataTransfer.effectAllowed = 'move';
                    item.style.opacity = '0.5';
                });

                handle.addEventListener('dragend', () => {
                    item.style.opacity = '1';
                    draggedElement = null;
                });

                handle.addEventListener('dragover', (e) => {
                    e.preventDefault();
                    e.dataTransfer.dropEffect = 'move';
                });

                handle.addEventListener('drop', (e) => {
                    e.preventDefault();
                    if (draggedElement && draggedElement !== item) {
                        const app = window.SecretSantaApp;
                        if (app) {
                            const oldIndex = Array.from(list.children).indexOf(draggedElement);
                            const newIndex = Array.from(list.children).indexOf(item);
                            const participants = [...app.state.participants];
                            const [moved] = participants.splice(oldIndex, 1);
                            participants.splice(newIndex, 0, moved);
                            this.saveParticipants(participants);
                        }
                    }
                });
            });
        }

        async addParticipant() {
            console.log('addParticipant called');
            const input = document.getElementById('new-participant');
            if (!input) {
                console.error('new-participant input not found');
                alert('Input field not found. Please refresh the page.');
                return;
            }
            
            const name = input.value.trim();

            if (!name) {
                alert('Please enter a participant name.');
                return;
            }

            const app = window.SecretSantaApp;
            if (!app) {
                console.error('SecretSantaApp not found');
                alert('App not initialized. Please refresh the page.');
                return;
            }

            if (app.state.participants.includes(name)) {
                alert('Participant already exists.');
                return;
            }

            console.log('Adding participant:', name);
            try {
                const participants = [...app.state.participants, name];
                await this.saveParticipants(participants);
                input.value = '';
                console.log('Participant added successfully');
            } catch (error) {
                console.error('Failed to add participant:', error);
                alert(`Failed to add participant: ${error.message}`);
            }
        }

        async removeParticipant(name) {
            if (!name) {
                console.error('No name provided to removeParticipant');
                return;
            }
            
            if (!confirm(`Remove ${name} from participants?`)) {
                return;
            }

            const app = window.SecretSantaApp;
            if (!app) {
                alert('App not initialized. Please refresh the page.');
                return;
            }

            try {
                const participants = app.state.participants.filter(p => p !== name);
                await this.saveParticipants(participants);
            } catch (error) {
                console.error('Failed to remove participant:', error);
                alert(`Failed to remove participant: ${error.message}`);
            }
        }

        async saveParticipants(participants) {
            const app = window.SecretSantaApp;
            if (!app) {
                alert('App not initialized. Please refresh the page.');
                return;
            }

            const config = app.config;
            
            // Validate config
            if (!config.owner || !config.repo) {
                alert('Repository not configured. Please set owner and repo in Settings.');
                return;
            }
            
            // Ensure store is available, fallback to localStore if needed
            let store = app.store;
            if (!store) {
                store = app.localStore;
                this.showToast('Warning: Using local storage. GitHub token may be missing.');
            }

            const participantsData = { participants };

            try {
                // Get current sha
                let currentData = { sha: null };
                try {
                    currentData = await store.getFile(config.participantsPath);
                } catch (e) {
                    console.warn('Could not get current file, will create new:', e);
                    // If file doesn't exist, sha will be null which is fine
                    if (e.message && !e.message.includes('404')) {
                        throw new Error(`Failed to read participants file: ${e.message}`);
                    }
                }

                try {
                    await store.putFile(
                        config.participantsPath,
                        participantsData,
                        currentData.sha,
                        'Admin: Update participants'
                    );
                } catch (error) {
                    // Handle specific GitHub API errors
                    let errorMessage = 'Failed to save participants.';
                    if (error.status === 401) {
                        errorMessage = 'Authentication failed. Please check your GitHub token in Settings.';
                    } else if (error.status === 403) {
                        errorMessage = 'Permission denied. Check token permissions and repository access.';
                    } else if (error.status === 409) {
                        errorMessage = 'Conflict: File was modified. Please refresh and try again.';
                    } else if (error.message) {
                        errorMessage = `Error: ${error.message}`;
                    }
                    throw new Error(errorMessage);
                }

                app.state.loadParticipants(participantsData);
                app.updateSpinnerDropdown();
                app.wheel.setParticipants(app.state.participants, app.state.assignedRecipients);
                app.updateUI();
                this.loadParticipantsList();

                this.showToast('Participants updated.');
            } catch (error) {
                console.error('Failed to save participants:', error);
                alert(`Failed to save participants:\n\n${error.message}\n\nCheck browser console for details.`);
            }
        }

        loadAssignmentsDisplay() {
            const app = window.SecretSantaApp;
            if (!app) return;

            const display = document.getElementById('assignments-display');
            const assignments = app.state.assignments;

            if (Object.keys(assignments).length === 0) {
                display.innerHTML = '<p style="color: var(--text-muted);">No assignments yet.</p>';
                return;
            }

            display.innerHTML = '<div class="assignments-list"></div>';
            const list = display.querySelector('.assignments-list');

            Object.entries(assignments).forEach(([spinner, recipient]) => {
                const item = document.createElement('div');
                item.className = 'assignment-item';
                item.innerHTML = `
                    <strong>${this.escapeHtml(spinner)}</strong> → ${this.escapeHtml(recipient)}
                `;
                list.appendChild(item);
            });
        }

        async resetAssignments() {
            if (!confirm('Are you sure you want to reset ALL assignments? This cannot be undone.')) {
                return;
            }

            if (!confirm('This will permanently delete all current assignments. Continue?')) {
                return;
            }

            const app = window.SecretSantaApp;
            if (!app) {
                alert('App not initialized. Please refresh the page.');
                return;
            }

            const config = app.config;
            
            // Validate config
            if (!config.owner || !config.repo) {
                alert('Repository not configured. Please set owner and repo in Settings.');
                return;
            }
            
            // Ensure store is available, fallback to localStore if needed
            let store = app.store;
            if (!store) {
                store = app.localStore;
                this.showToast('Warning: Using local storage. GitHub token may be missing.');
            }

            const emptyState = { assignments: {} };

            try {
                // Get current sha
                let currentData = { sha: null };
                try {
                    currentData = await store.getFile(config.statePath);
                } catch (e) {
                    console.warn('Could not get current file, will create new:', e);
                    // If file doesn't exist, sha will be null which is fine
                    if (e.message && !e.message.includes('404')) {
                        throw new Error(`Failed to read state file: ${e.message}`);
                    }
                }

                try {
                    await store.putFile(
                        config.statePath,
                        emptyState,
                        currentData.sha,
                        'Admin: Reset all assignments'
                    );
                } catch (error) {
                    // Handle specific GitHub API errors
                    let errorMessage = 'Failed to reset assignments.';
                    if (error.status === 401) {
                        errorMessage = 'Authentication failed. Please check your GitHub token in Settings.';
                    } else if (error.status === 403) {
                        errorMessage = 'Permission denied. Check token permissions and repository access.';
                    } else if (error.status === 409) {
                        errorMessage = 'Conflict: File was modified. Please refresh and try again.';
                    } else if (error.message) {
                        errorMessage = `Error: ${error.message}`;
                    }
                    throw new Error(errorMessage);
                }

                app.state.loadState(emptyState);
                app.wheel.setParticipants(app.state.participants, app.state.assignedRecipients);
                app.updateUI();
                this.loadAssignmentsDisplay();

                this.showToast('All assignments reset.');
            } catch (error) {
                console.error('Failed to reset assignments:', error);
                alert(`Failed to reset assignments:\n\n${error.message}\n\nCheck browser console for details.`);
            }
        }

        exportCSV() {
            const app = window.SecretSantaApp;
            if (!app) return;

            const assignments = app.state.assignments;
            if (Object.keys(assignments).length === 0) {
                alert('No assignments to export.');
                return;
            }

            let csv = 'Spinner,Recipient\n';
            Object.entries(assignments).forEach(([spinner, recipient]) => {
                csv += `"${spinner}","${recipient}"\n`;
            });

            const blob = new Blob([csv], { type: 'text/csv' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `secret-santa-assignments-${new Date().toISOString().split('T')[0]}.csv`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);

            this.showToast('CSV exported.');
        }

        escapeHtml(text) {
            const div = document.createElement('div');
            div.textContent = text;
            return div.innerHTML;
        }

        showToast(message) {
            if (window.showToast) {
                window.showToast(message);
            } else {
                alert(message);
            }
        }
    }

    // Initialize admin panel
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            window.AdminPanel = new AdminPanel();
        });
    } else {
        window.AdminPanel = new AdminPanel();
    }
})();

