// ======================== LIVE INTERACTIVE MEETING SESSIONS CLIENT ========================
// Phase 1: Discussion Snapshots, Named Checkpoints, Chunked Cloud Sync, Auto-Save & Resume
// Client module for WhatAnAgent Live Discussions

(function () {
    let autosaveTimer = null;
    let activeSessionId = null;

    // Helper: Get active caller identity
    function getCallerIdentity() {
        const authUser = window.firebaseAuth?.currentUser;
        const storedName = localStorage.getItem('whatanagent_live_username');
        const storedEmail = localStorage.getItem('whatanagent_live_email');

        const uid = authUser?.uid || '';
        const email = authUser?.email || storedEmail || '';
        const name = storedName || (email ? email.split('@')[0] : 'Team Member');

        return { uid, email, name };
    }

    // 1. SAVE DISCUSSION SNAPSHOT
    window.saveLiveSessionSnapshot = async function ({ isCheckpoint = false, checkpointNote = '', silent = false } = {}) {
        if (typeof window.getLiveBoardFullSnapshot !== 'function') return;

        const snapshot = window.getLiveBoardFullSnapshot();
        if (!snapshot || !snapshot.roomId) return;

        const caller = getCallerIdentity();
        if (!caller.uid && !caller.email) {
            if (!silent) toastMsg('⚠️ Please sign in to save discussions');
            return;
        }

        const payload = {
            sessionId: activeSessionId || localStorage.getItem(`session_${snapshot.roomId}`),
            sourceRoomId: snapshot.roomId,
            title: snapshot.title,
            canvasData: snapshot.canvasData,
            calculations: snapshot.calculations,
            checklists: snapshot.checklists,
            polls: snapshot.polls,
            assignedMembers: snapshot.assignedMembers,
            isLocked: snapshot.isLocked,
            isCheckpoint: !!isCheckpoint,
            checkpointNote: checkpointNote || '',
            caller
        };

        try {
            if (!silent) toastMsg('⏳ Saving discussion snapshot...');
            const res = await fetch('/api/live-meeting/session/save', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            const data = await res.json();
            if (data.ok) {
                activeSessionId = data.sessionId;
                localStorage.setItem(`session_${snapshot.roomId}`, activeSessionId);
                window.__liveBoardIsDirty = false;

                const sizeKb = Math.round((data.canvasByteSize || 0) / 1024);
                if (!silent) {
                    toastMsg(`💾 Discussion Saved! (${data.totalChunks} chunks · ${sizeKb} KB)`);
                    window.closeSaveCheckpointModal();
                }

                // Update save badge if present
                const saveBadge = document.getElementById('liveLastSavedBadge');
                if (saveBadge) {
                    saveBadge.innerText = `💾 Saved ${data.savedStamp?.split('T')[1] || ''}`;
                    saveBadge.style.display = 'inline-block';
                }
            } else {
                if (!silent) toastMsg(`⚠️ Save failed: ${data.error}`);
            }
        } catch (e) {
            console.warn('[LIVE SESSIONS] Save error:', e);
            if (!silent) toastMsg('⚠️ Network error saving discussion');
        }
    };

    // 2. CHECKPOINT MODAL CONTROLS
    window.openSaveCheckpointModal = function () {
        const modal = document.getElementById('liveSaveCheckpointModal');
        if (modal) {
            modal.style.display = 'flex';
            const noteInput = document.getElementById('liveCheckpointNoteInput');
            if (noteInput) {
                noteInput.value = '';
                setTimeout(() => noteInput.focus(), 100);
            }
        }
    };

    window.closeSaveCheckpointModal = function () {
        const modal = document.getElementById('liveSaveCheckpointModal');
        if (modal) modal.style.display = 'none';
    };

    window.confirmSaveCheckpoint = async function () {
        const noteInput = document.getElementById('liveCheckpointNoteInput');
        const note = noteInput ? noteInput.value.trim() : '';
        await window.saveLiveSessionSnapshot({ isCheckpoint: true, checkpointNote: note, silent: false });
    };

    window.saveAndExitDiscussion = async function () {
        await window.saveLiveSessionSnapshot({ isCheckpoint: true, checkpointNote: 'Saved upon exit', silent: false });
        if (typeof window.exitLiveBoardToLobby === 'function') {
            window.exitLiveBoardToLobby();
        } else if (typeof window.closeLiveMeetingPage === 'function') {
            window.closeLiveMeetingPage();
        }
    };

    // 3. AUTOSAVE ENGINE (Debounced ~30 seconds, only if board is dirty)
    function startAutosaveEngine() {
        if (autosaveTimer) clearInterval(autosaveTimer);
        autosaveTimer = setInterval(() => {
            if (window.__liveBoardIsDirty) {
                window.saveLiveSessionSnapshot({ isCheckpoint: false, silent: true });
            }
        }, 30000);
    }

    // 4. LOAD SAVED DISCUSSIONS (In Lobby)
    window.loadSavedDiscussions = async function () {
        const caller = getCallerIdentity();
        const grid = document.getElementById('lobbySavedSessionsGrid');
        if (!grid || (!caller.email && !caller.uid)) return;

        try {
            grid.innerHTML = `
                <div style="grid-column:1/-1; text-align:center; color:var(--text-muted); padding:20px;">
                    ⏳ Loading saved discussions...
                </div>
            `;

            const res = await fetch(`/api/live-meeting/session/list?email=${encodeURIComponent(caller.email)}&uid=${encodeURIComponent(caller.uid)}`);
            const data = await res.json();

            if (data.ok && Array.isArray(data.sessions)) {
                if (data.sessions.length === 0) {
                    grid.innerHTML = `
                        <div style="grid-column:1/-1; text-align:center; color:var(--text-muted); padding:30px; background:var(--card-dark); border-radius:12px; border:1px solid var(--border-dark);">
                            No saved discussions found yet. Use "💾 Save Discussion" during a live meeting to create checkpoints.
                        </div>
                    `;
                    return;
                }

                grid.innerHTML = '';
                data.sessions.forEach(s => {
                    const card = document.createElement('div');
                    card.className = 'lobby-card';
                    card.style.cssText = 'border-top:3px solid #6366f1; display:flex; flex-direction:column; justify-content:space-between; gap:12px;';

                    const sizeKb = Math.round((s.canvasByteSize || 0) / 1024);
                    const timeStr = s.savedStamp ? s.savedStamp.replace('T', ' ') : new Date(s.savedAt).toLocaleString();
                    const isOwner = s.isOwner;

                    card.innerHTML = `
                        <div>
                            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
                                <code style="color:var(--cyan); font-weight:bold; font-size:11.5px;">${s.sessionId}</code>
                                <span style="font-size:10px; background:${isOwner ? '#1e1b4b' : '#064e3b'}; color:${isOwner ? '#a78bfa' : '#34d399'}; padding:2px 8px; border-radius:10px; font-weight:bold; text-transform:uppercase;">
                                    ${isOwner ? '👑 My Saved Session' : '👥 Shared (' + s.myRole + ')'}
                                </span>
                            </div>

                            <h4 style="font-size:16px; font-weight:800; margin-bottom:6px; color:#f8fafc;">${escapeHtml(s.title || 'Discussion Snapshot')}</h4>
                            
                            ${s.checkpointNote ? `<div style="font-size:11.5px; color:#cbd5e1; background:rgba(30,41,59,0.7); padding:6px 10px; border-radius:6px; margin-bottom:10px; border-left:3px solid #38bdf8;">📝 ${escapeHtml(s.checkpointNote)}</div>` : ''}

                            <div style="display:flex; gap:12px; font-size:11.5px; color:var(--text-muted); flex-wrap:wrap; margin-bottom:6px;">
                                <span>📅 ${timeStr}</span>
                                <span>📦 ${sizeKb} KB</span>
                                <span>✅ ${s.tasksCount} Tasks</span>
                                <span>🧮 ${s.calculationsCount} Calcs</span>
                            </div>
                        </div>

                        <div style="display:flex; gap:8px; flex-wrap:wrap; border-top:1px solid #1e293b; padding-top:12px;">
                            <button onclick="promptResumeSession('${s.sessionId}')" style="flex:1; padding:8px 12px; background:linear-gradient(135deg, #6366f1, #4f46e5); border:none; color:#fff; border-radius:8px; font-weight:bold; font-size:12px; cursor:pointer;">
                                👉 Resume
                            </button>
                            <button onclick="resumeSessionAsFork('${s.sessionId}')" style="padding:8px 12px; background:#1e293b; border:1px solid #334155; color:#cbd5e1; border-radius:8px; font-weight:bold; font-size:12px; cursor:pointer;" title="Duplicate & Resume as Copy">
                                📋 Fork
                            </button>
                            ${isOwner ? `
                                <button onclick="openShareSessionModal('${s.sessionId}', '${escapeHtml(s.title)}')" style="padding:8px 12px; background:#1e293b; border:1px solid #38bdf8; color:#38bdf8; border-radius:8px; font-weight:bold; font-size:12px; cursor:pointer;" title="Share Discussion Access">
                                    👥 Share
                                </button>
                                <button onclick="deleteSavedSession('${s.sessionId}')" style="padding:8px 10px; background:#2d1515; border:1px solid #ef4444; color:#ef4444; border-radius:8px; font-weight:bold; font-size:12px; cursor:pointer;" title="Delete Session">
                                    🗑️
                                </button>
                            ` : ''}
                        </div>
                    `;

                    grid.appendChild(card);
                });
            }
        } catch (e) {
            console.warn('[LIVE SESSIONS] Load error:', e);
            if (grid) grid.innerHTML = '<div style="color:var(--rose); padding:20px;">Failed to load saved discussions.</div>';
        }
    };

    // 5. RESUME ACTIONS
    window.promptResumeSession = function (sessionId) {
        const choice = confirm(`Resume Discussion [${sessionId}]:\n\nClick OK to resume in-place (re-opens original room state).\nClick CANCEL to duplicate and open as a new room copy.`);
        if (choice) {
            executeResumeSession(sessionId, 'inplace');
        } else {
            executeResumeSession(sessionId, 'fork');
        }
    };

    window.resumeSessionAsFork = function (sessionId) {
        executeResumeSession(sessionId, 'fork');
    };

    async function executeResumeSession(sessionId, mode) {
        const caller = getCallerIdentity();
        try {
            toastMsg('⏳ Resuming discussion snapshot...');
            const res = await fetch('/api/live-meeting/session/resume', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ sessionId, mode, caller })
            });

            const data = await res.json();
            if (data.ok && data.roomId) {
                toastMsg(`🚀 ${data.message}`);
                activeSessionId = sessionId;

                // Switch UI from Lobby to Board
                const lobby = document.getElementById('liveLobbyContainer');
                const workspace = document.getElementById('liveWorkspaceContainer');
                const meetingPage = document.getElementById('liveMeetingPage');
                if (lobby) lobby.style.display = 'none';
                if (workspace) workspace.style.display = 'flex';
                if (meetingPage) meetingPage.style.display = 'flex';

                // Enter room
                if (typeof window.openLiveMeetingPage === 'function') {
                    await window.openLiveMeetingPage(data.roomId);
                } else if (typeof window.switchLiveRoom === 'function') {
                    await window.switchLiveRoom(data.roomId);
                }
            } else {
                toastMsg(`⚠️ Resume failed: ${data.error}`);
            }
        } catch (e) {
            toastMsg('⚠️ Error resuming discussion');
        }
    }

    // 6. SHARE DISCUSSION MODAL CONTROLS
    let sessionToShare = null;
    window.openShareSessionModal = function (sessionId, title) {
        sessionToShare = sessionId;
        const modal = document.getElementById('liveShareSessionModal');
        if (!modal) return;

        modal.style.display = 'flex';
        const titleEl = document.getElementById('liveShareSessionTitleDisplay');
        if (titleEl) titleEl.innerText = title || sessionId;

        // Populate registered users in select
        const sel = document.getElementById('liveShareUserSelect');
        if (sel) {
            sel.innerHTML = '<option value="">-- Choose Registered Teammate --</option>';
            fetch('/api/live-meeting/registered-users')
                .then(r => r.json())
                .then(d => {
                    if (d.ok && Array.isArray(d.users)) {
                        d.users.forEach(u => {
                            sel.innerHTML += `<option value="${escapeHtml(u.email || u.phone)}" data-name="${escapeHtml(u.name)}" data-phone="${escapeHtml(u.phone || '')}" data-uid="${escapeHtml(u.uid || '')}">${escapeHtml(u.name)} (${escapeHtml(u.email || u.phone)})</option>`;
                        });
                    }
                }).catch(() => { });
        }
    };

    window.closeShareSessionModal = function () {
        const modal = document.getElementById('liveShareSessionModal');
        if (modal) modal.style.display = 'none';
        sessionToShare = null;
    };

    window.confirmShareSession = async function () {
        if (!sessionToShare) return;

        const sel = document.getElementById('liveShareUserSelect');
        const manualInput = document.getElementById('liveShareManualEmailInput')?.value?.trim();
        const role = document.getElementById('liveShareRoleSelect')?.value || 'editor';
        const dispatchWa = document.getElementById('liveShareSendWaCheckbox')?.checked !== false;

        let targetUser = null;
        if (sel && sel.value) {
            const opt = sel.options[sel.selectedIndex];
            targetUser = {
                email: sel.value.includes('@') ? sel.value : '',
                phone: opt.getAttribute('data-phone') || (!sel.value.includes('@') ? sel.value : ''),
                name: opt.getAttribute('data-name') || '',
                uid: opt.getAttribute('data-uid') || ''
            };
        } else if (manualInput) {
            targetUser = {
                email: manualInput.includes('@') ? manualInput : '',
                phone: !manualInput.includes('@') ? manualInput : '',
                name: manualInput.split('@')[0]
            };
        }

        if (!targetUser || (!targetUser.email && !targetUser.phone)) {
            toastMsg('⚠️ Please pick a teammate or enter an email/phone');
            return;
        }

        const caller = getCallerIdentity();

        try {
            toastMsg('⏳ Granting discussion access...');
            const res = await fetch('/api/live-meeting/session/share', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    sessionId: sessionToShare,
                    targetUser,
                    role,
                    caller,
                    dispatchWhatsApp: dispatchWa
                })
            });

            const data = await res.json();
            if (data.ok) {
                toastMsg(`✅ Access granted to ${targetUser.name || targetUser.email} (${role.toUpperCase()})`);
                window.closeShareSessionModal();
                window.loadSavedDiscussions();
            } else {
                toastMsg(`⚠️ Could not share: ${data.error}`);
            }
        } catch (e) {
            toastMsg('⚠️ Network error granting access');
        }
    };

    // 7. DELETE SESSION
    window.deleteSavedSession = async function (sessionId) {
        if (!confirm(`Are you sure you want to permanently delete saved discussion [${sessionId}]?\nAll snapshot chunks will be deleted.`)) return;

        const caller = getCallerIdentity();
        try {
            toastMsg('⏳ Deleting saved session...');
            const res = await fetch('/api/live-meeting/session/delete', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ sessionId, caller })
            });

            const data = await res.json();
            if (data.ok) {
                toastMsg('🗑️ Saved discussion deleted');
                window.loadSavedDiscussions();
            } else {
                toastMsg(`⚠️ Could not delete: ${data.error}`);
            }
        } catch (e) {
            toastMsg('⚠️ Error deleting session');
        }
    };

    function escapeHtml(str) {
        return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    function toastMsg(msg) {
        const n = document.getElementById('notification');
        if (n) {
            n.innerText = msg;
            n.classList.add('show');
            setTimeout(() => n.classList.remove('show'), 3200);
        }
    }

    // Initialize autosave loop on page load
    startAutosaveEngine();
    console.log('💾 [LIVE SESSIONS] Discussion Sessions Engine (Save & Resume) Ready');
})();
