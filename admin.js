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
            const adminButton = document.getElementById('admin-button');
            const adminUnlock = document.getElementById('admin-unlock');
            const closeAdmin = document.getElementById('close-admin');
            const addParticipant = document.getElementById('add-participant');
            const resetAssignments = document.getElementById('reset-assignments');
            const exportCsv = document.getElementById('export-csv');

            adminButton?.addEventListener('click', () => this.open());
            adminUnlock?.addEventListener('click', () => this.unlock());
            closeAdmin?.addEventListener('click', () => this.close());
            addParticipant?.addEventListener('click', () => this.addParticipant());
            resetAssignments?.addEventListener('click', () => this.resetAssignments());
            exportCsv?.addEventListener('click', () => this.exportCSV());

            // Enter key on passphrase input
            document.getElementById('admin-passphrase')?.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    this.unlock();
                }
            });

            // Enter key on new participant input
            document.getElementById('new-participant')?.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
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
                
                const removeBtn = item.querySelector('.participant-remove');
                removeBtn.addEventListener('click', () => this.removeParticipant(name));
                
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
            const input = document.getElementById('new-participant');
            const name = input.value.trim();

            if (!name) {
                alert('Please enter a participant name.');
                return;
            }

            const app = window.SecretSantaApp;
            if (!app) return;

            if (app.state.participants.includes(name)) {
                alert('Participant already exists.');
                return;
            }

            const participants = [...app.state.participants, name];
            await this.saveParticipants(participants);
            input.value = '';
        }

        async removeParticipant(name) {
            if (!confirm(`Remove ${name} from participants?`)) {
                return;
            }

            const app = window.SecretSantaApp;
            if (!app) return;

            const participants = app.state.participants.filter(p => p !== name);
            await this.saveParticipants(participants);
        }

        async saveParticipants(participants) {
            const app = window.SecretSantaApp;
            if (!app) return;

            const config = app.config;
            const store = app.store || app.localStore;
            const participantsData = { participants };

            try {
                // Get current sha
                let currentData;
                try {
                    currentData = await store.getFile(config.participantsPath);
                } catch (e) {
                    currentData = { sha: null };
                }

                await store.putFile(
                    config.participantsPath,
                    participantsData,
                    currentData.sha,
                    'Admin: Update participants'
                );

                app.state.loadParticipants(participantsData);
                app.updateSpinnerDropdown();
                app.wheel.setParticipants(app.state.participants, app.state.assignedRecipients);
                app.updateUI();
                this.loadParticipantsList();

                this.showToast('Participants updated.');
            } catch (error) {
                console.error('Failed to save participants:', error);
                alert('Failed to save participants. Check console for details.');
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
            if (!app) return;

            const config = app.config;
            const store = app.store || app.localStore;
            const emptyState = { assignments: {} };

            try {
                // Get current sha
                let currentData;
                try {
                    currentData = await store.getFile(config.statePath);
                } catch (e) {
                    currentData = { sha: null };
                }

                await store.putFile(
                    config.statePath,
                    emptyState,
                    currentData.sha,
                    'Admin: Reset all assignments'
                );

                app.state.loadState(emptyState);
                app.wheel.setParticipants(app.state.participants, app.state.assignedRecipients);
                app.updateUI();
                this.loadAssignmentsDisplay();

                this.showToast('All assignments reset.');
            } catch (error) {
                console.error('Failed to reset assignments:', error);
                alert('Failed to reset assignments. Check console for details.');
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

