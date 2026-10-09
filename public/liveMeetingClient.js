// ======================== LIVE INTERACTIVE MEETING & DISCUSSION BOARD CLIENT ========================
// Real-time Collaborative Board (Zero Audio / Zero Video - 100% Visual Synchronized Command Center)
// Drawings, Multi-User Laser Pointers, Live Dynamic Calculations, Synchronized Action Checklists, Team Member Assignment, Quick Polls & AI Co-Pilot

(function () {
    let currentRoom = null;
    let isHost = false;
    let hostToken = '';
    let currentUserName = 'Team Member';
    let userColor = '#38bdf8';
    let unsubscribeSnapshot = null;
    let durationTimer = null;
    let sessionStartMs = 0;

    // Canvas State
    let canvas = null;
    let ctx = null;
    let overlayCanvas = null;
    let overlayCtx = null;
    let isDrawing = false;
    let currentTool = 'pen'; // pen, highlighter, eraser, rect, circle, arrow, text, sticky, laser
    let currentColor = '#ef4444';
    let currentLineWidth = 4;
    let currentBgMode = 'grid'; // grid, dots, dark, white
    let startX = 0;
    let startY = 0;
    let drawingPaths = []; // Array of strokes / shapes
    let undoStack = [];
    let redoStack = [];
    let stickyNotes = [];
    let textBlocks = [];

    // Laser & Multi-User Pointers
    let remotePointers = new Map(); // name -> { x, y, color, lastSeen, trail: [] }
    let localLaserTrail = [];
    let lastPointerBroadcastMs = 0;

    // Real-Time WebSocket Streaming Engine
    let liveWs = null;
    let activeRemoteStrokes = new Map(); // strokeId -> { type, tool, color, width, points: [] }
    let currentStrokeId = null;
    let wsReconnectTimer = null;

    // Board Data
    let calculations = [
        { id: 'c1', label: 'Base Unit Cost', value: 1250, unit: 'AED', formula: '', note: 'Initial quotation' },
        { id: 'c2', label: 'Quantity / Weight', value: 10, unit: 'pcs', formula: '', note: 'Batch volume' },
        { id: 'c3', label: 'Target Margin %', value: 18, unit: '%', formula: '', note: 'Profit markup' },
        { id: 'c4', label: 'Total Value', value: 14750, unit: 'AED', formula: '(c1 * c2) * (1 + (c3 / 100))', note: 'Auto calculated' }
    ];

    let checklists = [
        { id: 't1', text: 'Confirm supplier quotation & spot pricing', done: false, priority: 'Urgent', assignee: 'Host' },
        { id: 't2', text: 'Approve final delivery schedule & logistics', done: false, priority: 'High', assignee: 'Team' },
        { id: 't3', text: 'Review margin & contract terms with client', done: false, priority: 'Medium', assignee: 'Sales' }
    ];

    let polls = [];
    let activeMembers = [];
    let assignedMembers = [];
    let isBoardLocked = false;
    let currentDrawerTab = 'calculations';

    // Color Palette Presets
    const PALETTE_COLORS = ['#ffffff', '#ef4444', '#10b981', '#3b82f6', '#f59e0b', '#8b5cf6', '#ec4899', '#06b6d4', '#f97316'];
    const USER_COLORS = ['#38bdf8', '#34d399', '#fbbf24', '#f472b6', '#a78bfa', '#fb923c', '#4ade80', '#22d3ee'];

    // Initialize user profile
    function initUserProfile() {
        const storedName = localStorage.getItem('whatanagent_live_username');
        const authUser = window.firebaseAuth?.currentUser;
        if (storedName) {
            currentUserName = storedName;
        } else if (authUser?.email) {
            currentUserName = authUser.email.split('@')[0];
        } else {
            currentUserName = 'Member_' + Math.floor(100 + Math.random() * 900);
        }
        userColor = USER_COLORS[Math.floor(Math.random() * USER_COLORS.length)];
    }

    // Open Live Meeting Board Page
    window.openLiveMeetingPage = async function (roomIdToJoin = null) {
        initUserProfile();

        // Close conflicting fullscreen views
        try { if (typeof closeWaWebPage === 'function') closeWaWebPage(); } catch (e) { }
        try { if (typeof closeNewsPage === 'function') closeNewsPage(); } catch (e) { }
        try { if (typeof closeGoldPage === 'function') closeGoldPage(); } catch (e) { }

        const sidebar = document.getElementById('sidebar');
        if (sidebar && sidebar.classList.contains('open')) sidebar.classList.remove('open');

        const page = document.getElementById('liveMeetingPage') || document.getElementById('liveWorkspaceContainer');
        if (page) {
            page.style.display = 'flex';
        }

        // Check URL or passed roomId
        const urlParams = new URLSearchParams(window.location.search);
        const targetRoomId = roomIdToJoin || urlParams.get('liveRoom') || urlParams.get('room') || localStorage.getItem('whatanagent_last_room') || 'ROOM-849201';

        await joinRoom(targetRoomId);
        initCanvas();
        startDurationTimer();
        startLaserRenderLoop();
    };

    // Close Live Meeting Page
    window.closeLiveMeetingPage = function () {
        const page = document.getElementById('liveMeetingPage') || document.getElementById('liveWorkspaceContainer');
        if (page) page.style.display = 'none';

        if (unsubscribeSnapshot) {
            unsubscribeSnapshot();
            unsubscribeSnapshot = null;
        }
        if (durationTimer) {
            clearInterval(durationTimer);
            durationTimer = null;
        }
    };

    // Join or Create Room
    async function joinRoom(roomId) {
        currentRoom = roomId;
        localStorage.setItem('whatanagent_last_room', roomId);
        document.getElementById('liveRoomIdDisplay').innerText = roomId;

        try {
            const res = await fetch(`/api/live-meeting/room/${encodeURIComponent(roomId)}`);
            if (res.ok) {
                const data = await res.json();
                if (data.ok && data.room) {
                    applyRoomData(data.room);
                }
            } else {
                // Auto-create room if not found
                await createNewLiveRoom(roomId, 'Interactive Strategy Session');
            }
        } catch (err) {
            console.warn('[LIVE MEETING] Fetch error, creating room fallback:', err);
            await createNewLiveRoom(roomId, 'Interactive Strategy Session');
        }

        // Attach Realtime Firestore Snapshot Listener if available
        listenToRoomRealtime(roomId);

        // Join high-speed WebSocket room channel
        if (!liveWs || liveWs.readyState !== WebSocket.OPEN) {
            connectLiveWebSocket();
        } else {
            sendWsMessage({
                type: 'join_room',
                roomId,
                user: { name: currentUserName, color: userColor }
            });
        }
    }

    // Create New Room
    window.createNewLiveRoom = async function (customId = null, title = null) {
        initUserProfile();
        const roomTitle = title || document.getElementById('newRoomTitleInput')?.value?.trim() || 'Executive Live Strategy Session';
        const hostName = currentUserName;
        const hostEmail = localStorage.getItem('whatanagent_live_email') || window.firebaseAuth?.currentUser?.email || '';
        const hostUid = window.firebaseAuth?.currentUser?.uid || '';
        const hostPin = document.getElementById('newRoomPinInput')?.value?.trim() || '1234';

        try {
            const res = await fetch('/api/live-meeting/create', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    roomId: customId,
                    title: roomTitle,
                    hostName,
                    hostEmail,
                    hostUid,
                    hostPin,
                    initialAssignedMembers: [
                        { name: hostName, email: hostEmail, uid: hostUid, role: 'host', duty: 'Session Leader & Executive Host', status: 'joined', assignedAt: Date.now() }
                    ]
                })
            });
            const data = await res.json();
            if (data.ok && data.room) {
                currentRoom = data.room.roomId;
                isHost = true;
                hostToken = data.room.hostToken;
                localStorage.setItem(`hostToken_${currentRoom}`, hostToken);
                applyRoomData(data.room);
                closeNewRoomModal();
                toastMsg(`🚀 Live Room ${currentRoom} Created!`);
                listenToRoomRealtime(currentRoom);
            }
        } catch (e) {
            console.error('[LIVE MEETING] Create error:', e);
            toastMsg('⚠️ Error creating room');
        }
    };

    function applyRoomData(room) {
        if (!room) return;
        document.getElementById('liveRoomTitleDisplay').innerText = room.title || 'Live Strategy Board';
        document.getElementById('liveHostNameDisplay').innerText = `👑 Host: ${room.hostName || 'Admin'}`;
        document.getElementById('liveRoomIdDisplay').innerText = room.roomId;

        const savedToken = localStorage.getItem(`hostToken_${room.roomId}`);
        if (savedToken && (savedToken === room.hostToken || room.hostName === currentUserName)) {
            isHost = true;
        }

        // Room status badge
        const statusBadge = document.getElementById('liveRoomStatusBadge');
        if (statusBadge) {
            if (room.status === 'finished') {
                statusBadge.innerText = '⏹️ Concluded';
                statusBadge.style.background = '#450a0a';
                statusBadge.style.borderColor = '#ef4444';
                statusBadge.style.color = '#f87171';
            } else {
                statusBadge.innerText = '🟢 Active';
                statusBadge.style.background = '#064e3b';
                statusBadge.style.borderColor = '#059669';
                statusBadge.style.color = '#34d399';
            }
        }

        const finishBtn = document.getElementById('liveFinishRoomBtn');
        if (finishBtn) {
            if (room.status === 'finished') {
                finishBtn.innerHTML = '<span>🏁 Finished</span>';
                finishBtn.style.opacity = '0.6';
            } else {
                finishBtn.innerHTML = '<span>⏹️ Finish Room</span>';
                finishBtn.style.opacity = '1';
            }
        }

        isBoardLocked = !!room.isLocked;
        updateLockUI();

        if (room.assignedMembers && Array.isArray(room.assignedMembers)) {
            assignedMembers = room.assignedMembers;
            renderAssignedMembers();
            populateTaskAssigneeOptions();
        }

        if (room.calculations && Array.isArray(room.calculations)) {
            calculations = room.calculations;
            renderCalculationsTable();
        }

        if (room.checklists && Array.isArray(room.checklists)) {
            checklists = room.checklists;
            renderChecklists();
        }

        if (room.polls && Array.isArray(room.polls)) {
            polls = room.polls;
            renderPolls();
        }

        if (room.activeMembers && Array.isArray(room.activeMembers)) {
            activeMembers = room.activeMembers;
            renderActiveMembers();
        }

        if (room.canvasData) {
            try {
                const parsed = typeof room.canvasData === 'string' ? JSON.parse(room.canvasData) : room.canvasData;
                if (parsed.paths) drawingPaths = parsed.paths;
                if (parsed.stickyNotes) stickyNotes = parsed.stickyNotes;
                if (parsed.textBlocks) textBlocks = parsed.textBlocks;
                redrawCanvas();
                renderStickyNotesDOM();
                renderTextBlocksDOM();
            } catch (e) {
                console.warn('[LIVE MEETING] Canvas parse error:', e);
            }
        }
    }

    // Realtime Firestore Listener
    function listenToRoomRealtime(roomId) {
        if (unsubscribeSnapshot) {
            unsubscribeSnapshot();
            unsubscribeSnapshot = null;
        }

        if (!window.firebaseDb || !window.doc || !window.onSnapshot) return;

        try {
            const roomRef = window.doc(window.firebaseDb, 'liveMeetingRooms', roomId);
            unsubscribeSnapshot = window.onSnapshot(roomRef, (docSnap) => {
                if (docSnap.exists()) {
                    const data = docSnap.data();
                    applyRoomData(data);
                }
            }, (err) => {
                console.warn('[LIVE MEETING] Realtime snapshot error:', err);
            });
        } catch (e) {
            console.warn('[LIVE MEETING] Firestore snapshot setup error:', e);
        }
    }

    // Sync State to Server / Firestore
    async function syncBoardState(partialState = {}) {
        if (!currentRoom) return;
        try {
            const payload = {
                roomId: currentRoom,
                hostToken: isHost ? hostToken : '',
                activeMember: { name: currentUserName, role: isHost ? 'host' : 'editor' },
                ...partialState
            };

            window.__liveBoardIsDirty = true;
            await fetch('/api/live-meeting/save-state', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
        } catch (e) {
            console.warn('[LIVE MEETING] Sync error:', e);
        }
    }

    // Auto-save & Synchronize Canvas
    let syncCanvasDebounceTimer = null;
    function syncCanvas() {
        if (syncCanvasDebounceTimer) clearTimeout(syncCanvasDebounceTimer);
        syncCanvasDebounceTimer = setTimeout(() => {
            const canvasData = JSON.stringify({
                paths: drawingPaths || [],
                stickyNotes: stickyNotes || [],
                textBlocks: textBlocks || []
            });
            syncBoardState({ canvasData });
        }, 120);
    }

    // State Extractor for Discussion Snapshots & Sessions
    window.getLiveBoardFullSnapshot = function () {
        return {
            roomId: currentRoom,
            title: document.getElementById('liveRoomTitleDisplay')?.innerText || 'Live Strategy Board',
            canvasData: JSON.stringify({
                paths: drawingPaths || [],
                stickyNotes: stickyNotes || [],
                textBlocks: textBlocks || []
            }),
            calculations: calculations || [],
            checklists: checklists || [],
            polls: polls || [],
            assignedMembers: assignedMembers || [],
            isLocked: isBoardLocked,
            hostName: document.getElementById('liveHostNameDisplay')?.innerText?.replace('👑 Host:', '').trim() || '',
            isHost
        };
    };

    window.markLiveBoardDirty = function () {
        window.__liveBoardIsDirty = true;
    };

    // ==========================================
    // 👥 ASSIGN TEAM MEMBERS & ROLES
    // ==========================================
    window.openAssignTeamModal = function () {
        const modal = document.getElementById('liveAssignTeamModal');
        if (!modal) return;
        modal.style.display = 'flex';

        // Populate Contact Book Selector
        const select = document.getElementById('liveAssignContactSelect');
        if (select && window.chatContactsCache) {
            select.innerHTML = '<option value="">-- Choose from Contact Book --</option>';
            for (const [phone, c] of Object.entries(window.chatContactsCache)) {
                const name = c.name || phone;
                select.innerHTML += `<option value="${phone}" data-name="${escapeHtml(name)}">${name} (${phone})</option>`;
            }
        }
    };

    window.closeAssignTeamModal = function () {
        const modal = document.getElementById('liveAssignTeamModal');
        if (modal) modal.style.display = 'none';
    };

    window.onAssignContactSelectChange = function () {
        const select = document.getElementById('liveAssignContactSelect');
        const nameInput = document.getElementById('liveAssignNameInput');
        const phoneInput = document.getElementById('liveAssignPhoneInput');

        if (select && select.value) {
            const opt = select.options[select.selectedIndex];
            if (nameInput) nameInput.value = opt.getAttribute('data-name') || '';
            if (phoneInput) phoneInput.value = select.value;
        }
    };

    window.submitAssignTeamMember = async function () {
        const name = document.getElementById('liveAssignNameInput')?.value?.trim();
        const phone = document.getElementById('liveAssignPhoneInput')?.value?.trim();
        const role = document.getElementById('liveAssignRoleSelect')?.value || 'editor';
        const duty = document.getElementById('liveAssignDutyInput')?.value?.trim() || 'Active Collaborator';
        const section = document.getElementById('liveAssignSectionSelect')?.value || 'all';
        const dispatchWhatsApp = document.getElementById('liveAssignSendWaCheckbox')?.checked !== false;

        if (!name && !phone) {
            toastMsg('⚠️ Please provide a name or phone number');
            return;
        }

        try {
            toastMsg('⏳ Assigning team member & dispatching invite...');
            const res = await fetch('/api/live-meeting/assign-members', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    roomId: currentRoom,
                    hostName: currentUserName,
                    roomTitle: document.getElementById('liveRoomTitleDisplay')?.innerText || 'Live Strategy Board',
                    dispatchWhatsApp,
                    newMembers: [
                        {
                            name: name || phone,
                            phone,
                            role,
                            duty,
                            assignedSection: section
                        }
                    ]
                })
            });

            const data = await res.json();
            if (data.ok && data.assignedMembers) {
                assignedMembers = data.assignedMembers;
                renderAssignedMembers();
                populateTaskAssigneeOptions();
                closeAssignTeamModal();
                toastMsg(`✅ ${name || phone} assigned as [${role.toUpperCase()}]!`);
            } else {
                toastMsg(`⚠️ Error assigning: ${data.error || 'Unknown'}`);
            }
        } catch (e) {
            toastMsg('⚠️ Network error while assigning');
        }
    };

    window.removeAssignedMember = async function (identifier) {
        if (!isHost) {
            toastMsg('🔒 Only Host can remove assigned members');
            return;
        }
        if (confirm(`Remove ${identifier} from assigned roster?`)) {
            assignedMembers = assignedMembers.filter(m => (m.phone || m.name) !== identifier);
            renderAssignedMembers();
            populateTaskAssigneeOptions();
            syncBoardState({ assignedMembers });
            toastMsg('🗑️ Member removed from assignment');
        }
    };

    function renderAssignedMembers() {
        const container = document.getElementById('liveAssignedRosterContainer');
        const badge = document.getElementById('liveAssignedCountBadge');
        if (badge) badge.innerText = `👥 ${assignedMembers.length} Assigned`;
        if (!container) return;

        if (assignedMembers.length === 0) {
            container.innerHTML = `<div style="text-align:center; color:#64748b; font-size:12px; padding:12px;">No team members assigned yet. Click "Assign Member" above.</div>`;
            return;
        }

        container.innerHTML = '';
        assignedMembers.forEach(m => {
            const isLive = activeMembers.some(a => a.name === m.name);
            const statusColor = isLive ? '#22c55e' : '#f59e0b';
            const statusText = isLive ? '🟢 LIVE ON BOARD' : '🟡 ASSIGNED (INVITED)';
            const roleBg = m.role === 'host' ? '#f59e0b' : (m.role === 'co-host' ? '#8b5cf6' : (m.role === 'auditor' ? '#06b6d4' : '#3b82f6'));

            const card = document.createElement('div');
            card.style.cssText = 'background:#1e293b; border:1px solid #334155; border-radius:10px; padding:10px 12px; margin-bottom:8px; display:flex; flex-direction:column; gap:4px;';
            card.innerHTML = `
                <div style="display:flex; justify-content:space-between; align-items:center;">
                    <div style="display:flex; align-items:center; gap:8px;">
                        <span style="font-weight:700; font-size:13px; color:#f8fafc;">${escapeHtml(m.name)}</span>
                        <span style="font-size:9.5px; padding:1px 6px; border-radius:8px; background:${roleBg}; color:#fff; font-weight:800;">${escapeHtml(m.role ? m.role.toUpperCase() : 'EDITOR')}</span>
                    </div>
                    <div style="display:flex; align-items:center; gap:6px;">
                        <span style="font-size:10px; font-weight:bold; color:${statusColor};">${statusText}</span>
                        ${isHost && m.role !== 'host' ? `<button onclick="removeAssignedMember('${escapeHtml(m.phone || m.name)}')" style="background:none; border:none; color:#ef4444; cursor:pointer; font-size:13px;" title="Remove Assignment">✕</button>` : ''}
                    </div>
                </div>
                <div style="font-size:11.5px; color:#94a3b8; display:flex; align-items:center; justify-content:space-between;">
                    <span>🎯 <i>${escapeHtml(m.duty || 'General Collaboration')}</i></span>
                    ${m.phone ? `<span style="font-family:monospace; color:#38bdf8;">📞 ${escapeHtml(m.phone)}</span>` : ''}
                </div>
            `;
            container.appendChild(card);
        });
    }

    function populateTaskAssigneeOptions() {
        const select = document.getElementById('newLiveTaskAssigneeSelect');
        if (!select) return;

        const currentVal = select.value;
        select.innerHTML = '<option value="Team">👥 Whole Team</option>';

        assignedMembers.forEach(m => {
            select.innerHTML += `<option value="${escapeHtml(m.name)}">👤 ${escapeHtml(m.name)} (${escapeHtml(m.role || 'Member')})</option>`;
        });

        if (currentVal) select.value = currentVal;
    }

    // ==========================================
    // 🎨 CANVAS DRAWING ENGINE
    // ==========================================
    function initCanvas() {
        canvas = document.getElementById('liveCanvas');
        overlayCanvas = document.getElementById('livePointerOverlay');
        if (!canvas || !overlayCanvas) return;

        ctx = canvas.getContext('2d');
        overlayCtx = overlayCanvas.getContext('2d');

        resizeCanvas();
        window.addEventListener('resize', resizeCanvas);

        // Mouse Events
        canvas.addEventListener('mousedown', onPointerDown);
        canvas.addEventListener('mousemove', onPointerMove);
        window.addEventListener('mouseup', onPointerUp);

        // Touch Events
        canvas.addEventListener('touchstart', onTouchStart, { passive: false });
        canvas.addEventListener('touchmove', onTouchMove, { passive: false });
        window.addEventListener('touchend', onTouchEnd);

        // Grid Click for Sticky or Text
        canvas.addEventListener('dblclick', onCanvasDoubleClick);
    }

    function resizeCanvas() {
        const container = document.getElementById('liveCanvasContainer');
        if (!container || !canvas || !overlayCanvas) return;

        const rect = container.getBoundingClientRect();
        const dpr = window.devicePixelRatio || 1;

        canvas.width = rect.width * dpr;
        canvas.height = rect.height * dpr;
        canvas.style.width = `${rect.width}px`;
        canvas.style.height = `${rect.height}px`;
        ctx.scale(dpr, dpr);

        overlayCanvas.width = rect.width * dpr;
        overlayCanvas.height = rect.height * dpr;
        overlayCanvas.style.width = `${rect.width}px`;
        overlayCanvas.style.height = `${rect.height}px`;
        overlayCtx.scale(dpr, dpr);

        redrawCanvas();
    }

    function getCanvasCoords(e) {
        const rect = canvas.getBoundingClientRect();
        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        const clientY = e.touches ? e.touches[0].clientY : e.clientY;
        return {
            x: clientX - rect.left,
            y: clientY - rect.top
        };
    }

    function onPointerDown(e) {
        if (isBoardLocked && !isHost) {
            toastMsg('🔒 Canvas is locked by Host');
            return;
        }

        const coords = getCanvasCoords(e);
        startX = coords.x;
        startY = coords.y;
        isDrawing = true;

        if (currentTool === 'pen' || currentTool === 'highlighter' || currentTool === 'eraser') {
            currentStrokeId = 'st_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7);
            const pathColor = currentTool === 'eraser' ? '#0a0e17' : currentColor;
            const pathWidth = currentTool === 'highlighter' ? currentLineWidth * 3 : (currentTool === 'eraser' ? currentLineWidth * 4 : currentLineWidth);

            const newPath = {
                id: currentStrokeId,
                type: 'stroke',
                tool: currentTool,
                color: pathColor,
                width: pathWidth,
                points: [{ x: startX, y: startY }],
                isHighlighter: currentTool === 'highlighter'
            };
            drawingPaths.push(newPath);
            undoStack.push(JSON.parse(JSON.stringify(drawingPaths)));
            redoStack = [];

            // Stream stroke start immediately (<5ms)
            sendWsMessage({
                type: 'stroke_start',
                roomId: currentRoom,
                strokeId: currentStrokeId,
                tool: currentTool,
                color: pathColor,
                width: pathWidth,
                isHighlighter: currentTool === 'highlighter',
                point: { x: startX, y: startY }
            });
        } else if (currentTool === 'laser') {
            localLaserTrail.push({ x: startX, y: startY, time: Date.now() });
        }
    }

    function onPointerMove(e) {
        const coords = getCanvasCoords(e);

        // Broadcast live cursor / laser position to teammates (throttled to 20ms / 50fps)
        const now = Date.now();
        if (now - lastPointerBroadcastMs > 20) {
            broadcastPointer(coords.x, coords.y, currentTool === 'laser');
            lastPointerBroadcastMs = now;
        }

        if (!isDrawing) return;

        if (currentTool === 'pen' || currentTool === 'highlighter' || currentTool === 'eraser') {
            const currentPath = drawingPaths[drawingPaths.length - 1];
            if (currentPath && currentPath.points) {
                currentPath.points.push({ x: coords.x, y: coords.y });
                redrawCanvas();

                // Live continuous stroke point stream over WebSocket
                sendWsMessage({
                    type: 'stroke_chunk',
                    roomId: currentRoom,
                    strokeId: currentStrokeId,
                    point: { x: coords.x, y: coords.y }
                });
            }
        } else if (currentTool === 'rect' || currentTool === 'circle' || currentTool === 'arrow') {
            redrawCanvas();
            drawPreviewShape(startX, startY, coords.x, coords.y, currentTool);
        } else if (currentTool === 'laser') {
            localLaserTrail.push({ x: coords.x, y: coords.y, time: Date.now() });
        }
    }

    function onPointerUp(e) {
        if (!isDrawing) return;
        isDrawing = false;

        const coords = getCanvasCoords(e);

        if (currentTool === 'pen' || currentTool === 'highlighter' || currentTool === 'eraser') {
            const currentPath = drawingPaths[drawingPaths.length - 1];
            sendWsMessage({
                type: 'stroke_end',
                roomId: currentRoom,
                strokeId: currentStrokeId,
                path: currentPath
            });
            currentStrokeId = null;
        } else if (currentTool === 'rect' || currentTool === 'circle' || currentTool === 'arrow') {
            const width = coords.x - startX;
            const height = coords.y - startY;
            if (Math.abs(width) > 5 || Math.abs(height) > 5) {
                const shapeItem = {
                    type: 'shape',
                    shape: currentTool,
                    x: startX,
                    y: startY,
                    w: width,
                    h: height,
                    color: currentColor,
                    lineWidth: currentLineWidth
                };
                drawingPaths.push(shapeItem);
                undoStack.push(JSON.parse(JSON.stringify(drawingPaths)));
                redoStack = [];
                redrawCanvas();

                sendWsMessage({
                    type: 'shape_draw',
                    roomId: currentRoom,
                    shapeItem
                });
            }
        }

        // Auto-save canvas state
        syncCanvas();
    }

    function onTouchStart(e) {
        e.preventDefault();
        onPointerDown(e);
    }
    function onTouchMove(e) {
        e.preventDefault();
        onPointerMove(e);
    }
    function onTouchEnd(e) {
        onPointerUp(e);
    }

    function drawPreviewShape(x1, y1, x2, y2, shape) {
        ctx.save();
        ctx.strokeStyle = currentColor;
        ctx.lineWidth = currentLineWidth;
        ctx.setLineDash([6, 6]);

        if (shape === 'rect') {
            ctx.strokeRect(x1, y1, x2 - x1, y2 - y1);
        } else if (shape === 'circle') {
            const radiusX = Math.abs(x2 - x1) / 2;
            const radiusY = Math.abs(y2 - y1) / 2;
            const centerX = Math.min(x1, x2) + radiusX;
            const centerY = Math.min(y1, y2) + radiusY;
            ctx.beginPath();
            ctx.ellipse(centerX, centerY, radiusX, radiusY, 0, 0, Math.PI * 2);
            ctx.stroke();
        } else if (shape === 'arrow') {
            drawArrow(ctx, x1, y1, x2, y2, currentLineWidth);
        }
        ctx.restore();
    }

    function drawArrow(context, fromX, fromY, toX, toY, width) {
        const headlen = 14;
        const angle = Math.atan2(toY - fromY, toX - fromX);
        context.beginPath();
        context.moveTo(fromX, fromY);
        context.lineTo(toX, toY);
        context.lineTo(toX - headlen * Math.cos(angle - Math.PI / 6), toY - headlen * Math.sin(angle - Math.PI / 6));
        context.moveTo(toX, toY);
        context.lineTo(toX - headlen * Math.cos(angle + Math.PI / 6), toY - headlen * Math.sin(angle + Math.PI / 6));
        context.stroke();
    }

    function redrawCanvas() {
        if (!ctx || !canvas) return;

        const rect = canvas.getBoundingClientRect();
        ctx.clearRect(0, 0, rect.width, rect.height);

        // Draw Background Mode
        drawBackgroundGrid(ctx, rect.width, rect.height, currentBgMode);

        // Draw all paths
        for (const item of drawingPaths) {
            if (item.type === 'stroke') {
                ctx.save();
                ctx.beginPath();
                ctx.strokeStyle = item.color;
                ctx.lineWidth = item.width;
                ctx.lineCap = 'round';
                ctx.lineJoin = 'round';

                if (item.isHighlighter) {
                    ctx.globalAlpha = 0.35;
                }

                if (item.points && item.points.length > 0) {
                    ctx.moveTo(item.points[0].x, item.points[0].y);
                    for (let i = 1; i < item.points.length; i++) {
                        ctx.lineTo(item.points[i].x, item.points[i].y);
                    }
                }
                ctx.stroke();
                ctx.restore();
            } else if (item.type === 'shape') {
                ctx.save();
                ctx.strokeStyle = item.color;
                ctx.lineWidth = item.lineWidth || 3;

                if (item.shape === 'rect') {
                    ctx.strokeRect(item.x, item.y, item.w, item.h);
                } else if (item.shape === 'circle') {
                    const radiusX = Math.abs(item.w) / 2;
                    const radiusY = Math.abs(item.h) / 2;
                    const centerX = Math.min(item.x, item.x + item.w) + radiusX;
                    const centerY = Math.min(item.y, item.y + item.h) + radiusY;
                    ctx.beginPath();
                    ctx.ellipse(centerX, centerY, radiusX, radiusY, 0, 0, Math.PI * 2);
                    ctx.stroke();
                } else if (item.shape === 'arrow') {
                    drawArrow(ctx, item.x, item.y, item.x + item.w, item.y + item.h, item.lineWidth || 3);
                }
                ctx.restore();
            }
        }

        // Draw In-Flight Real-Time Remote Streaming Strokes
        for (const [_, item] of activeRemoteStrokes.entries()) {
            if (item && item.points && item.points.length > 0) {
                ctx.save();
                ctx.beginPath();
                ctx.strokeStyle = item.color;
                ctx.lineWidth = item.width;
                ctx.lineCap = 'round';
                ctx.lineJoin = 'round';
                if (item.isHighlighter) ctx.globalAlpha = 0.35;

                ctx.moveTo(item.points[0].x, item.points[0].y);
                for (let i = 1; i < item.points.length; i++) {
                    ctx.lineTo(item.points[i].x, item.points[i].y);
                }
                ctx.stroke();
                ctx.restore();
            }
        }
    }

    function drawBackgroundGrid(context, width, height, mode) {
        context.save();
        if (mode === 'grid') {
            context.strokeStyle = 'rgba(255, 255, 255, 0.05)';
            context.lineWidth = 1;
            const step = 30;
            for (let x = 0; x < width; x += step) {
                context.beginPath();
                context.moveTo(x, 0);
                context.lineTo(x, height);
                context.stroke();
            }
            for (let y = 0; y < height; y += step) {
                context.beginPath();
                context.moveTo(0, y);
                context.lineTo(width, y);
                context.stroke();
            }
        } else if (mode === 'dots') {
            context.fillStyle = 'rgba(255, 255, 255, 0.12)';
            const step = 28;
            for (let x = 14; x < width; x += step) {
                for (let y = 14; y < height; y += step) {
                    context.beginPath();
                    context.arc(x, y, 1.5, 0, Math.PI * 2);
                    context.fill();
                }
            }
        }
        context.restore();
    }

    // Multi-User Laser Pointer Render Loop
    function startLaserRenderLoop() {
        function renderLoop() {
            if (overlayCtx && overlayCanvas) {
                const rect = overlayCanvas.getBoundingClientRect();
                overlayCtx.clearRect(0, 0, rect.width, rect.height);

                const now = Date.now();

                // 1. Render Local Laser
                localLaserTrail = localLaserTrail.filter(p => now - p.time < 1200);
                if (localLaserTrail.length > 1) {
                    overlayCtx.save();
                    overlayCtx.lineCap = 'round';
                    for (let i = 1; i < localLaserTrail.length; i++) {
                        const age = now - localLaserTrail[i].time;
                        const alpha = 1 - (age / 1200);
                        overlayCtx.strokeStyle = `rgba(239, 68, 68, ${alpha})`;
                        overlayCtx.shadowColor = '#ef4444';
                        overlayCtx.shadowBlur = 12;
                        overlayCtx.lineWidth = 6 * alpha;
                        overlayCtx.beginPath();
                        overlayCtx.moveTo(localLaserTrail[i - 1].x, localLaserTrail[i - 1].y);
                        overlayCtx.lineTo(localLaserTrail[i].x, localLaserTrail[i].y);
                        overlayCtx.stroke();
                    }
                    overlayCtx.restore();
                }

                // 2. Render Remote Pointers & Trails
                for (const [name, ptr] of remotePointers.entries()) {
                    if (now - ptr.lastSeen > 4000) {
                        remotePointers.delete(name);
                        continue;
                    }

                    // Draw remote trail
                    ptr.trail = (ptr.trail || []).filter(p => now - p.time < 1200);
                    if (ptr.trail.length > 1) {
                        overlayCtx.save();
                        overlayCtx.lineCap = 'round';
                        for (let i = 1; i < ptr.trail.length; i++) {
                            const age = now - ptr.trail[i].time;
                            const alpha = 1 - (age / 1200);
                            overlayCtx.strokeStyle = ptr.color || '#38bdf8';
                            overlayCtx.shadowColor = ptr.color || '#38bdf8';
                            overlayCtx.shadowBlur = 10;
                            overlayCtx.lineWidth = 5 * alpha;
                            overlayCtx.beginPath();
                            overlayCtx.moveTo(ptr.trail[i - 1].x, ptr.trail[i - 1].y);
                            overlayCtx.lineTo(ptr.trail[i].x, ptr.trail[i].y);
                            overlayCtx.stroke();
                        }
                        overlayCtx.restore();
                    }

                    // Draw cursor circle & name pill
                    overlayCtx.save();
                    overlayCtx.fillStyle = ptr.color || '#38bdf8';
                    overlayCtx.shadowColor = ptr.color || '#38bdf8';
                    overlayCtx.shadowBlur = 8;
                    overlayCtx.beginPath();
                    overlayCtx.arc(ptr.x, ptr.y, 5, 0, Math.PI * 2);
                    overlayCtx.fill();

                    // Name Tag
                    overlayCtx.font = 'bold 11px sans-serif';
                    overlayCtx.fillStyle = '#0f172a';
                    const textWidth = overlayCtx.measureText(name).width;
                    overlayCtx.fillRect(ptr.x + 8, ptr.y - 14, textWidth + 12, 18);
                    overlayCtx.strokeStyle = ptr.color || '#38bdf8';
                    overlayCtx.strokeRect(ptr.x + 8, ptr.y - 14, textWidth + 12, 18);
                    overlayCtx.fillStyle = '#f8fafc';
                    overlayCtx.fillText(name, ptr.x + 14, ptr.y - 1);
                    overlayCtx.restore();
                }
            }
            requestAnimationFrame(renderLoop);
        }
        requestAnimationFrame(renderLoop);
    }

    // ==========================================
    // ⚡ WEBSOCKET REALTIME ENGINE
    // ==========================================
    function connectLiveWebSocket() {
        try {
            if (liveWs && (liveWs.readyState === WebSocket.OPEN || liveWs.readyState === WebSocket.CONNECTING)) return;
            const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
            const wsUrl = `${protocol}//${window.location.host}/ws/live-meeting`;
            liveWs = new WebSocket(wsUrl);

            liveWs.onopen = () => {
                if (currentRoom) {
                    sendWsMessage({
                        type: 'join_room',
                        roomId: currentRoom,
                        user: { name: currentUserName, color: userColor }
                    });
                }
            };

            liveWs.onmessage = (event) => {
                try {
                    const msg = JSON.parse(event.data);
                    if (!msg || !msg.type) return;
                    handleWebSocketMessage(msg);
                } catch (e) { }
            };

            liveWs.onclose = () => {
                if (wsReconnectTimer) clearTimeout(wsReconnectTimer);
                wsReconnectTimer = setTimeout(connectLiveWebSocket, 2000);
            };

            liveWs.onerror = () => {
                try { liveWs.close(); } catch(e) {}
            };
        } catch (e) {
            console.warn('[LIVE WS] Connect error:', e);
        }
    }

    function sendWsMessage(obj) {
        if (liveWs && liveWs.readyState === WebSocket.OPEN) {
            liveWs.send(JSON.stringify(obj));
        }
    }

    function handleWebSocketMessage(msg) {
        switch (msg.type) {
            case 'stroke_start': {
                activeRemoteStrokes.set(msg.strokeId, {
                    type: 'stroke',
                    tool: msg.tool,
                    color: msg.color,
                    width: msg.width,
                    points: [msg.point],
                    isHighlighter: msg.isHighlighter
                });
                redrawCanvas();
                break;
            }
            case 'stroke_chunk': {
                const s = activeRemoteStrokes.get(msg.strokeId);
                if (s && s.points) {
                    s.points.push(msg.point);
                    redrawCanvas();
                }
                break;
            }
            case 'stroke_end': {
                const s = activeRemoteStrokes.get(msg.strokeId);
                if (s || msg.path) {
                    drawingPaths.push(msg.path || s);
                    activeRemoteStrokes.delete(msg.strokeId);
                    redrawCanvas();
                }
                break;
            }
            case 'shape_draw': {
                if (msg.shapeItem) {
                    drawingPaths.push(msg.shapeItem);
                    redrawCanvas();
                }
                break;
            }
            case 'clear_canvas': {
                drawingPaths = [];
                activeRemoteStrokes.clear();
                redrawCanvas();
                break;
            }
            case 'undo_canvas': {
                if (drawingPaths.length > 0) {
                    drawingPaths.pop();
                    redrawCanvas();
                }
                break;
            }
            case 'redo_canvas': {
                if (msg.path) {
                    drawingPaths.push(msg.path);
                    redrawCanvas();
                }
                break;
            }
            case 'cursor_move': {
                const ptr = remotePointers.get(msg.user) || { trail: [] };
                ptr.x = msg.x;
                ptr.y = msg.y;
                ptr.color = msg.color;
                ptr.lastSeen = Date.now();
                if (msg.isLaser) {
                    ptr.trail.push({ x: msg.x, y: msg.y, time: Date.now() });
                }
                remotePointers.set(msg.user, ptr);
                break;
            }
            case 'reaction': {
                showFloatingReaction(msg.emoji, msg.user);
                break;
            }
            case 'calc_change': {
                if (Array.isArray(msg.calculations)) {
                    calculations = msg.calculations;
                    renderCalculationsTable();
                }
                break;
            }
            case 'task_toggle': {
                const t = checklists.find(x => x.id === msg.taskId);
                if (t) {
                    t.done = msg.done;
                    renderChecklists();
                }
                break;
            }
            case 'task_add': {
                if (msg.task && !checklists.some(x => x.id === msg.task.id)) {
                    checklists.push(msg.task);
                    renderChecklists();
                }
                break;
            }
            case 'task_delete': {
                checklists = checklists.filter(x => x.id !== msg.taskId);
                renderChecklists();
                break;
            }
            case 'user_joined': {
                if (msg.user && msg.user.name !== currentUserName) {
                    toastMsg(`👋 ${msg.user.name} joined the live board`);
                }
                break;
            }
        }
    }

    function broadcastPointer(x, y, isLaser) {
        sendWsMessage({
            type: 'cursor_move',
            roomId: currentRoom,
            user: currentUserName,
            color: userColor,
            x,
            y,
            isLaser
        });
        if (window.BroadcastChannel) {
            if (!window.__liveMeetingBC) window.__liveMeetingBC = new BroadcastChannel('whatanagent_live_board');
            window.__liveMeetingBC.postMessage({
                type: 'pointer_move',
                room: currentRoom,
                user: currentUserName,
                color: userColor,
                x,
                y,
                isLaser
            });
        }
    }

    if (window.BroadcastChannel) {
        if (!window.__liveMeetingBC) window.__liveMeetingBC = new BroadcastChannel('whatanagent_live_board');
        window.__liveMeetingBC.onmessage = (msg) => {
            const d = msg.data;
            if (!d || d.room !== currentRoom || d.user === currentUserName) return;

            if (d.type === 'pointer_move') {
                const ptr = remotePointers.get(d.user) || { trail: [] };
                ptr.x = d.x;
                ptr.y = d.y;
                ptr.color = d.color;
                ptr.lastSeen = Date.now();
                if (d.isLaser) {
                    ptr.trail.push({ x: d.x, y: d.y, time: Date.now() });
                }
                remotePointers.set(d.user, ptr);
            } else if (d.type === 'reaction') {
                showFloatingReaction(d.emoji, d.user);
            }
        };
    }

    // Tool Switchers
    window.setLiveTool = function (toolName) {
        currentTool = toolName;
        document.querySelectorAll('.live-tool-btn').forEach(btn => btn.classList.remove('active'));
        const activeBtn = document.getElementById(`liveTool_${toolName}`);
        if (activeBtn) activeBtn.classList.add('active');
    };

    window.setLiveColor = function (colorHex) {
        currentColor = colorHex;
        document.querySelectorAll('.live-color-dot').forEach(dot => dot.style.transform = 'scale(1)');
        const activeDot = document.getElementById(`liveColor_${colorHex.replace('#', '')}`);
        if (activeDot) activeDot.style.transform = 'scale(1.25)';
    };

    window.setLiveLineWidth = function (widthPx) {
        currentLineWidth = parseInt(widthPx, 10);
    };

    window.setLiveBgMode = function (mode) {
        currentBgMode = mode;
        redrawCanvas();
    };

    window.liveCanvasUndo = function () {
        if (drawingPaths.length > 0) {
            const popped = drawingPaths.pop();
            redoStack.push(popped);
            redrawCanvas();
            sendWsMessage({ type: 'undo_canvas', roomId: currentRoom });
            syncCanvas();
        }
    };

    window.liveCanvasRedo = function () {
        if (redoStack.length > 0) {
            const restored = redoStack.pop();
            drawingPaths.push(restored);
            redrawCanvas();
            sendWsMessage({ type: 'redo_canvas', roomId: currentRoom, path: restored });
            syncCanvas();
        }
    };

    window.liveCanvasClear = function () {
        if (confirm('Clear entire whiteboard canvas for everyone?')) {
            drawingPaths = [];
            stickyNotes = [];
            textBlocks = [];
            activeRemoteStrokes.clear();
            redrawCanvas();
            renderStickyNotesDOM();
            renderTextBlocksDOM();
            sendWsMessage({ type: 'clear_canvas', roomId: currentRoom });
            syncCanvas();
            toastMsg('🧹 Board cleared');
        }
    };

    window.exportCanvasPNG = function () {
        if (!canvas) return;
        const link = document.createElement('a');
        link.download = `LiveBoard_${currentRoom}_${Date.now()}.png`;
        link.href = canvas.toDataURL('image/png');
        link.click();
        toastMsg('📸 Board snapshot saved as PNG');
    };

    function syncCanvas() {
        const data = {
            paths: drawingPaths,
            stickyNotes,
            textBlocks
        };
        syncBoardState({ canvasData: JSON.stringify(data) });
    }

    // ==========================================
    // 📝 STICKY NOTES & TEXT BLOCKS
    // ==========================================
    function onCanvasDoubleClick(e) {
        const coords = getCanvasCoords(e);
        if (currentTool === 'sticky') {
            addStickyNote(coords.x, coords.y);
        } else if (currentTool === 'text') {
            addTextBlock(coords.x, coords.y);
        }
    }

    window.addStickyNote = function (x = 100, y = 100) {
        const note = {
            id: 'note_' + Date.now(),
            x: Math.max(20, x),
            y: Math.max(20, y),
            text: 'Double click to edit note...',
            color: '#fef08a',
            author: currentUserName
        };
        stickyNotes.push(note);
        renderStickyNotesDOM();
        syncCanvas();
    };

    function renderStickyNotesDOM() {
        const container = document.getElementById('liveStickyNotesLayer');
        if (!container) return;
        container.innerHTML = '';

        stickyNotes.forEach(note => {
            const el = document.createElement('div');
            el.className = 'live-sticky-card';
            el.style.left = `${note.x}px`;
            el.style.top = `${note.y}px`;
            el.style.background = note.color || '#fef08a';

            el.innerHTML = `
                <div class="sticky-header">
                    <span>📌 ${escapeHtml(note.author || 'Member')}</span>
                    <button onclick="deleteStickyNote('${note.id}')" title="Delete Note">✕</button>
                </div>
                <textarea onchange="updateStickyText('${note.id}', this.value)">${escapeHtml(note.text)}</textarea>
            `;
            makeDraggable(el, (newX, newY) => {
                note.x = newX;
                note.y = newY;
                syncCanvas();
            });
            container.appendChild(el);
        });
    }

    window.updateStickyText = function (id, text) {
        const note = stickyNotes.find(n => n.id === id);
        if (note) {
            note.text = text;
            syncCanvas();
        }
    };

    window.deleteStickyNote = function (id) {
        stickyNotes = stickyNotes.filter(n => n.id !== id);
        renderStickyNotesDOM();
        syncCanvas();
    };

    function addTextBlock(x = 150, y = 150) {
        const text = prompt('Enter text for board:', 'Key Takeaway / Flow Title');
        if (text) {
            textBlocks.push({
                id: 'txt_' + Date.now(),
                x,
                y,
                text,
                color: currentColor,
                fontSize: 16
            });
            renderTextBlocksDOM();
            syncCanvas();
        }
    }

    function renderTextBlocksDOM() {
        const container = document.getElementById('liveTextBlocksLayer');
        if (!container) return;
        container.innerHTML = '';

        textBlocks.forEach(tb => {
            const el = document.createElement('div');
            el.className = 'live-text-block';
            el.style.left = `${tb.x}px`;
            el.style.top = `${tb.y}px`;
            el.style.color = tb.color || '#fff';
            el.innerText = tb.text;
            makeDraggable(el, (newX, newY) => {
                tb.x = newX;
                tb.y = newY;
                syncCanvas();
            });
            container.appendChild(el);
        });
    }

    function makeDraggable(el, onDrop) {
        let isDragging = false;
        let startX = 0, startY = 0;

        el.addEventListener('mousedown', (e) => {
            if (e.target.tagName === 'TEXTAREA' || e.target.tagName === 'BUTTON') return;
            isDragging = true;
            startX = e.clientX - el.offsetLeft;
            startY = e.clientY - el.offsetTop;
        });

        window.addEventListener('mousemove', (e) => {
            if (!isDragging) return;
            const newX = e.clientX - startX;
            const newY = e.clientY - startY;
            el.style.left = `${newX}px`;
            el.style.top = `${newY}px`;
        });

        window.addEventListener('mouseup', () => {
            if (isDragging) {
                isDragging = false;
                if (onDrop) onDrop(parseInt(el.style.left, 10), parseInt(el.style.top, 10));
            }
        });
    }

    // ==========================================
    // 🧮 LIVE CALCULATION GRID & SCRATCHPAD
    // ==========================================
    function renderCalculationsTable() {
        const tbody = document.getElementById('liveCalcTableBody');
        if (!tbody) return;
        tbody.innerHTML = '';

        let calculatedScope = {};
        calculations.forEach(row => {
            calculatedScope[row.id] = parseFloat(row.value) || 0;
        });

        calculations.forEach((row, index) => {
            let displayVal = row.value;
            if (row.formula && row.formula.trim()) {
                try {
                    let sanitized = row.formula;
                    for (const [k, v] of Object.entries(calculatedScope)) {
                        sanitized = sanitized.replace(new RegExp('\\b' + k + '\\b', 'g'), v);
                    }
                    displayVal = Function('"use strict";return (' + sanitized + ')')();
                    if (!isNaN(displayVal)) {
                        displayVal = Number(displayVal.toFixed(2));
                        calculatedScope[row.id] = displayVal;
                    }
                } catch (e) {
                    displayVal = 'Error';
                }
            }

            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td><code style="color:#38bdf8; font-weight:bold;">${row.id}</code></td>
                <td><input type="text" value="${escapeHtml(row.label)}" onchange="updateCalcRow('${row.id}', 'label', this.value)" style="width:100%; background:transparent; border:none; color:#f8fafc; font-weight:600;"></td>
                <td><input type="number" step="any" value="${row.value}" ${row.formula ? 'disabled' : ''} onchange="updateCalcRow('${row.id}', 'value', parseFloat(this.value) || 0)" style="width:75px; background:#1e293b; border:1px solid #334155; color:#34d399; font-weight:bold; padding:4px 6px; border-radius:4px; text-align:right;"></td>
                <td><input type="text" value="${escapeHtml(row.unit || '')}" onchange="updateCalcRow('${row.id}', 'unit', this.value)" style="width:45px; background:transparent; border:none; color:#94a3b8; font-size:11px;"></td>
                <td><input type="text" value="${escapeHtml(row.formula || '')}" placeholder="e.g. c1 * c2" onchange="updateCalcRow('${row.id}', 'formula', this.value)" style="width:110px; background:#0f172a; border:1px solid #334155; color:#fbbf24; font-size:11px; padding:4px 6px; border-radius:4px; font-family:monospace;"></td>
                <td style="font-weight:800; color:#38bdf8; text-align:right;">${displayVal}</td>
                <td style="text-align:center;"><button onclick="deleteCalcRow('${row.id}')" style="background:none; border:none; color:#ef4444; cursor:pointer;" title="Delete Row">✕</button></td>
            `;
            tbody.appendChild(tr);
        });

        updateCalcSummary(calculatedScope);
    }

    function updateCalcSummary(scope) {
        const totalEl = document.getElementById('liveCalcGrandTotal');
        if (!totalEl) return;
        const lastRow = calculations[calculations.length - 1];
        if (lastRow && scope[lastRow.id] !== undefined) {
            totalEl.innerText = `${scope[lastRow.id].toLocaleString()} ${lastRow.unit || 'AED'}`;
        }
    }

    window.updateCalcRow = function (id, field, value) {
        const row = calculations.find(r => r.id === id);
        if (row) {
            row[field] = value;
            renderCalculationsTable();
            sendWsMessage({ type: 'calc_change', roomId: currentRoom, calculations });
            syncBoardState({ calculations });
        }
    };

    window.addCalcRow = function () {
        const nextId = 'c' + (calculations.length + 1);
        calculations.push({
            id: nextId,
            label: 'New Variable ' + nextId,
            value: 100,
            unit: 'AED',
            formula: '',
            note: ''
        });
        renderCalculationsTable();
        sendWsMessage({ type: 'calc_change', roomId: currentRoom, calculations });
        syncBoardState({ calculations });
    };

    window.insertGoldPriceToCalc = async function () {
        try {
            toastMsg('⏳ Fetching live Gold spot...');
            const res = await fetch('/api/gold/spot');
            const data = await res.json();
            const price = data.price || 4220;

            const nextId = 'c' + (calculations.length + 1);
            calculations.push({
                id: nextId,
                label: '🥇 Gold Spot (XAU/USD)',
                value: price,
                unit: 'USD/oz',
                formula: '',
                note: 'Live spot price'
            });
            renderCalculationsTable();
            sendWsMessage({ type: 'calc_change', roomId: currentRoom, calculations });
            syncBoardState({ calculations });
            toastMsg(`✅ Gold price $${price} added to table!`);
        } catch (e) {
            toastMsg('⚠️ Could not fetch spot price');
        }
    };

    window.deleteCalcRow = function (id) {
        calculations = calculations.filter(r => r.id !== id);
        renderCalculationsTable();
        sendWsMessage({ type: 'calc_change', roomId: currentRoom, calculations });
        syncBoardState({ calculations });
    };

    // ==========================================
    // ✅ SYNCHRONIZED ACTION CHECKLIST
    // ==========================================
    function renderChecklists() {
        const container = document.getElementById('liveChecklistContainer');
        if (!container) return;
        container.innerHTML = '';

        if (checklists.length === 0) {
            container.innerHTML = `<div style="text-align:center; color:#64748b; font-size:12px; padding:20px;">No action items yet. Add one below.</div>`;
            return;
        }

        checklists.forEach(task => {
            const card = document.createElement('div');
            card.className = `live-task-item ${task.done ? 'task-done' : ''}`;
            const priorityColor = task.priority === 'Urgent' ? '#ef4444' : (task.priority === 'High' ? '#f59e0b' : '#38bdf8');

            card.innerHTML = `
                <div style="display:flex; align-items:center; gap:10px; flex:1;">
                    <input type="checkbox" ${task.done ? 'checked' : ''} onchange="toggleTaskDone('${task.id}', this.checked)" style="width:16px; height:16px; cursor:pointer; accent-color:#10b981;">
                    <span style="flex:1; font-size:13px; font-weight:500; color:${task.done ? '#94a3b8' : '#f8fafc'}; text-decoration:${task.done ? 'line-through' : 'none'};">${escapeHtml(task.text)}</span>
                </div>
                <div style="display:flex; align-items:center; gap:6px;">
                    <span style="font-size:10px; padding:2px 6px; border-radius:10px; background:${priorityColor}22; color:${priorityColor}; border:1px solid ${priorityColor}; font-weight:bold;">${task.priority || 'Normal'}</span>
                    <span style="font-size:10px; color:#94a3b8; background:#1e293b; padding:2px 6px; border-radius:6px;">👤 ${escapeHtml(task.assignee || 'Team')}</span>
                    <button onclick="deleteTaskItem('${task.id}')" style="background:none; border:none; color:#ef4444; font-size:14px; cursor:pointer;">✕</button>
                </div>
            `;
            container.appendChild(card);
        });
    }

    window.addLiveTask = function () {
        const input = document.getElementById('newLiveTaskInput');
        const priority = document.getElementById('newLiveTaskPriority')?.value || 'High';
        const assigneeSelect = document.getElementById('newLiveTaskAssigneeSelect');
        const assignee = assigneeSelect ? assigneeSelect.value : currentUserName;

        if (!input || !input.value.trim()) return;

        const newTask = {
            id: 't' + Date.now(),
            text: input.value.trim(),
            done: false,
            priority,
            assignee
        };
        checklists.push(newTask);
        input.value = '';
        renderChecklists();
        sendWsMessage({ type: 'task_add', roomId: currentRoom, task: newTask });
        syncBoardState({ checklists });
        toastMsg('✅ Task added to board');
    };

    window.toggleTaskDone = function (id, isDone) {
        const t = checklists.find(item => item.id === id);
        if (t) {
            t.done = isDone;
            renderChecklists();
            sendWsMessage({ type: 'task_toggle', roomId: currentRoom, taskId: id, done: isDone });
            syncBoardState({ checklists });
        }
    };

    window.deleteTaskItem = function (id) {
        checklists = checklists.filter(t => t.id !== id);
        renderChecklists();
        sendWsMessage({ type: 'task_delete', roomId: currentRoom, taskId: id });
        syncBoardState({ checklists });
    };

    // ==========================================
    // 🗳️ LIVE QUICK POLLS & DECISION VOTING
    // ==========================================
    function renderPolls() {
        const container = document.getElementById('livePollsContainer');
        if (!container) return;
        container.innerHTML = '';

        if (polls.length === 0) {
            container.innerHTML = `<div style="text-align:center; color:#64748b; font-size:12px; padding:20px;">No active polls. Host can launch a quick poll below.</div>`;
            return;
        }

        polls.forEach(poll => {
            const card = document.createElement('div');
            card.className = 'live-poll-card';

            const totalVotes = poll.options.reduce((acc, opt) => acc + (opt.votes || 0), 0);

            let optionsHtml = '';
            poll.options.forEach((opt, idx) => {
                const percent = totalVotes > 0 ? Math.round(((opt.votes || 0) / totalVotes) * 100) : 0;
                optionsHtml += `
                    <div style="margin-top:8px;">
                        <div style="display:flex; justify-content:space-between; font-size:12px; margin-bottom:3px;">
                            <span>${escapeHtml(opt.text)}</span>
                            <span style="font-weight:bold; color:#38bdf8;">${percent}% (${opt.votes || 0})</span>
                        </div>
                        <div style="height:8px; background:#1e293b; border-radius:4px; overflow:hidden; display:flex; cursor:pointer;" onclick="castPollVote('${poll.id}', ${idx})">
                            <div style="width:${percent}%; background:linear-gradient(90deg, #38bdf8, #6366f1); transition:width 0.3s ease;"></div>
                        </div>
                        <button onclick="castPollVote('${poll.id}', ${idx})" style="margin-top:4px; padding:4px 8px; font-size:11px; background:#1e293b; border:1px solid #334155; color:#f8fafc; border-radius:4px; cursor:pointer;">Vote: ${escapeHtml(opt.text)}</button>
                    </div>
                `;
            });

            card.innerHTML = `
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
                    <b style="font-size:14px; color:#f8fafc;">📊 ${escapeHtml(poll.question)}</b>
                    <span style="font-size:11px; color:#34d399; font-weight:bold;">${totalVotes} Votes</span>
                </div>
                ${optionsHtml}
            `;
            container.appendChild(card);
        });
    }

    window.launchLivePoll = function () {
        const qInput = document.getElementById('newPollQuestion');
        const opt1 = document.getElementById('newPollOpt1')?.value?.trim() || 'Yes / Approved';
        const opt2 = document.getElementById('newPollOpt2')?.value?.trim() || 'No / Decline';
        const opt3 = document.getElementById('newPollOpt3')?.value?.trim();

        if (!qInput || !qInput.value.trim()) {
            toastMsg('⚠️ Enter a question for the poll');
            return;
        }

        const options = [
            { text: opt1, votes: 0 },
            { text: opt2, votes: 0 }
        ];
        if (opt3) options.push({ text: opt3, votes: 0 });

        polls.unshift({
            id: 'poll_' + Date.now(),
            question: qInput.value.trim(),
            options,
            author: currentUserName,
            createdAt: Date.now()
        });

        qInput.value = '';
        renderPolls();
        syncBoardState({ polls });
        toastMsg('🚀 Poll launched for everyone!');
    };

    window.castPollVote = function (pollId, optionIndex) {
        const p = polls.find(item => item.id === pollId);
        if (p && p.options[optionIndex]) {
            p.options[optionIndex].votes = (p.options[optionIndex].votes || 0) + 1;
            renderPolls();
            syncBoardState({ polls });
            toastMsg('🗳️ Vote recorded!');
        }
    };

    // ==========================================
    // 👥 ACTIVE MEMBERS & PRESENCE
    // ==========================================
    function renderActiveMembers() {
        const container = document.getElementById('liveMembersListContainer');
        const badge = document.getElementById('liveMembersCountBadge');
        if (badge) badge.innerText = `${activeMembers.length || 1} Online`;
        if (!container) return;

        container.innerHTML = '';
        activeMembers.forEach(m => {
            const row = document.createElement('div');
            row.style.cssText = 'display:flex; justify-content:space-between; align-items:center; padding:8px 10px; background:#1e293b; border-radius:8px; margin-bottom:6px;';
            row.innerHTML = `
                <div style="display:flex; align-items:center; gap:8px;">
                    <span style="width:8px; height:8px; border-radius:50%; background:#22c55e;"></span>
                    <b style="font-size:13px; color:#f8fafc;">${escapeHtml(m.name)}</b>
                </div>
                <span style="font-size:10px; padding:2px 8px; border-radius:10px; background:${m.role === 'host' ? '#f59e0b' : '#38bdf8'}; color:#0f172a; font-weight:bold;">${m.role.toUpperCase()}</span>
            `;
            container.appendChild(row);
        });
    }

    // ==========================================
    // 🤖 AI MEETING BOARD CO-PILOT
    // ==========================================
    window.askLiveAiCopilot = async function (type = 'minutes') {
        const resultContainer = document.getElementById('liveAiResponseBox');
        if (!resultContainer) return;

        resultContainer.innerHTML = `<div style="padding:15px; color:#38bdf8; text-align:center;">🤖 AI Co-Pilot analyzing board drawings, calculations & checklists...</div>`;

        try {
            const boardContext = {
                calculations,
                checklists,
                polls,
                assignedMembers,
                stickyNotesCount: stickyNotes.length,
                textNotes: textBlocks.map(t => t.text)
            };

            const userQuestion = document.getElementById('liveAiCustomPrompt')?.value?.trim() || '';

            const res = await fetch('/api/live-meeting/ai-copilot', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    type,
                    roomId: currentRoom,
                    boardContext,
                    userQuestion
                })
            });

            const data = await res.json();
            if (data.ok && data.response) {
                resultContainer.innerHTML = `
                    <div style="background:#0f172a; border:1px solid #334155; border-radius:8px; padding:14px; font-size:13px; line-height:1.6; color:#f8fafc; white-space:pre-wrap;">${escapeHtml(data.response)}</div>
                    <div style="margin-top:10px; display:flex; gap:8px;">
                        <button onclick="navigator.clipboard.writeText(\`${escapeHtml(data.response).replace(/`/g, '\\`')}\`); toastMsg('📋 Copied AI summary!');" style="padding:6px 12px; background:#10b981; color:#fff; border:none; border-radius:6px; font-size:12px; font-weight:bold; cursor:pointer;">📋 Copy Summary</button>
                    </div>
                `;
            } else {
                resultContainer.innerHTML = `<div style="color:#ef4444; padding:10px;">⚠️ ${escapeHtml(data.error || 'AI request failed')}</div>`;
            }
        } catch (e) {
            resultContainer.innerHTML = `<div style="color:#ef4444; padding:10px;">⚠️ Network error: ${e.message}</div>`;
        }
    };

    // ==========================================
    // 📲 INVITATION & WHATSAPP DISPATCH
    // ==========================================
    window.openLiveInviteModal = function () {
        const modal = document.getElementById('liveInviteModal');
        if (!modal) return;
        modal.style.display = 'flex';

        // Populate Contact Book Select if available
        const select = document.getElementById('liveInviteContactSelect');
        if (select && window.chatContactsCache) {
            select.innerHTML = '<option value="">-- Choose from Contact Book --</option>';
            for (const [phone, c] of Object.entries(window.chatContactsCache)) {
                const name = c.name || phone;
                select.innerHTML += `<option value="${phone}">${name} (${phone})</option>`;
            }
        }
    };

    window.closeLiveInviteModal = function () {
        const modal = document.getElementById('liveInviteModal');
        if (modal) modal.style.display = 'none';
    };

    window.onLiveInviteContactChange = function (val) {
        const phoneInput = document.getElementById('liveInvitePhoneInput');
        if (phoneInput && val) {
            phoneInput.value = val;
        }
    };

    window.sendLiveWhatsAppInvite = async function () {
        const phone = document.getElementById('liveInvitePhoneInput')?.value?.trim();
        const note = document.getElementById('liveInviteNoteInput')?.value?.trim();

        if (!phone) {
            toastMsg('⚠️ Enter phone number to invite');
            return;
        }

        try {
            toastMsg('📲 Sending WhatsApp invite...');
            const res = await fetch('/api/live-meeting/invite-whatsapp', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    phone,
                    roomId: currentRoom,
                    roomTitle: document.getElementById('liveRoomTitleDisplay')?.innerText || 'Live Strategy Board',
                    hostName: currentUserName,
                    customNote: note
                })
            });

            const data = await res.json();
            if (data.ok) {
                toastMsg(`✅ WhatsApp invite sent to ${phone}!`);
                closeLiveInviteModal();
            } else {
                toastMsg(`⚠️ Could not send invite: ${data.error}`);
            }
        } catch (e) {
            toastMsg('⚠️ Error sending WhatsApp invite');
        }
    };

    window.copyLiveRoomLink = function () {
        const url = `${window.location.origin}/live?room=${encodeURIComponent(currentRoom)}`;
        try {
            navigator.clipboard.writeText(url);
            toastMsg(`🔗 Live Meeting link copied! (${currentRoom})`);
        } catch(e) {
            prompt('Copy this meeting link:', url);
        }
    };

    // ==========================================
    // 🚪 JOIN BY LINK / ID & FINISH ACTIVE ROOM
    // ==========================================
    function parseLiveRoomId(inputStr) {
        if (!inputStr) return null;
        let s = String(inputStr).trim();
        try {
            if (s.startsWith('http://') || s.startsWith('https://')) {
                const u = new URL(s);
                const r = u.searchParams.get('room') || u.searchParams.get('liveRoom') || u.searchParams.get('roomId');
                if (r) return r.trim();
            }
        } catch (e) { }

        const mRoomParam = s.match(/[?&](?:liveRoom|room|roomId)=([A-Za-z0-9_-]+)/i);
        if (mRoomParam) return mRoomParam[1].trim();

        const mRoom = s.match(/(ROOM-?\d+)/i);
        if (mRoom) {
            let r = mRoom[1].toUpperCase();
            if (!r.includes('-')) r = 'ROOM-' + r.replace('ROOM', '');
            return r;
        }

        if (/^\d{4,8}$/.test(s)) {
            return `ROOM-${s}`;
        }

        return s.replace(/[^a-zA-Z0-9_-]/g, '');
    }

    window.openJoinRoomModal = function () {
        const modal = document.getElementById('liveJoinRoomModal');
        if (modal) {
            modal.style.display = 'flex';
            const input = document.getElementById('liveJoinRoomInput');
            if (input) {
                input.value = '';
                setTimeout(() => input.focus(), 100);
            }
            const finishChk = document.getElementById('liveFinishBeforeJoinCheckbox');
            if (finishChk) {
                finishChk.checked = isHost;
            }
        }
    };

    window.closeJoinRoomModal = function () {
        const modal = document.getElementById('liveJoinRoomModal');
        if (modal) modal.style.display = 'none';
    };

    window.confirmJoinRoomByLink = async function () {
        const inputEl = document.getElementById('liveJoinRoomInput');
        const raw = inputEl ? inputEl.value : '';
        const targetRoomId = parseLiveRoomId(raw);

        if (!targetRoomId) {
            toastMsg('⚠️ Please enter a valid meeting link or Room ID');
            return;
        }

        if (currentRoom && targetRoomId.toUpperCase() === currentRoom.toUpperCase()) {
            toastMsg('ℹ️ You are already inside this room!');
            window.closeJoinRoomModal();
            return;
        }

        const finishBefore = document.getElementById('liveFinishBeforeJoinCheckbox')?.checked;
        if (finishBefore && currentRoom) {
            try {
                await fetch('/api/live-meeting/finish-room', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        roomId: currentRoom,
                        hostToken,
                        closedBy: currentUserName
                    })
                });
                toastMsg(`⏹️ Active room ${currentRoom} finished.`);
            } catch (err) {
                console.warn('[LIVE MEETING] Finish room error before join:', err);
            }
        }

        window.closeJoinRoomModal();
        if (inputEl) inputEl.value = '';
        await window.switchLiveRoom(targetRoomId);
    };

    window.switchLiveRoom = async function (targetRoomId) {
        if (!targetRoomId) return;

        // 1. Unsubscribe from current room snapshot listener
        if (unsubscribeSnapshot) {
            unsubscribeSnapshot();
            unsubscribeSnapshot = null;
        }

        // 2. Clear local drawings, undo/redo, stickers
        drawingPaths = [];
        undoStack = [];
        redoStack = [];
        stickyNotes = [];
        textBlocks = [];
        remotePointers.clear();
        localLaserTrail = [];

        const notesLayer = document.getElementById('liveStickyNotesLayer');
        if (notesLayer) notesLayer.innerHTML = '';
        const textLayer = document.getElementById('liveTextBlocksLayer');
        if (textLayer) textLayer.innerHTML = '';

        if (ctx && canvas) {
            redrawAll();
        }

        // 3. Reset host flag
        isHost = false;

        // 4. Update browser URL without reloading
        try {
            const currentUrl = new URL(window.location.href);
            if (currentUrl.pathname.includes('live')) {
                currentUrl.searchParams.set('room', targetRoomId);
            } else {
                currentUrl.searchParams.set('liveRoom', targetRoomId);
            }
            window.history.replaceState({}, '', currentUrl.toString());
        } catch (e) { }

        // 5. Join new room
        toastMsg(`🔄 Connecting to room ${targetRoomId}...`);
        await joinRoom(targetRoomId);
        startDurationTimer();
        toastMsg(`🟢 Joined Live Room: ${targetRoomId}`);
    };

    window.finishCurrentLiveRoom = async function () {
        if (!currentRoom) return;

        const confirmMsg = isHost
            ? `Are you sure you want to finish and conclude Live Board "${currentRoom}" for all attendees?`
            : `Are you sure you want to conclude and archive your session in Live Board "${currentRoom}"?`;

        if (!confirm(confirmMsg)) return;

        try {
            const res = await fetch('/api/live-meeting/finish-room', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    roomId: currentRoom,
                    hostToken,
                    closedBy: currentUserName
                })
            });
            const data = await res.json();
            if (data.ok) {
                toastMsg(`🏁 Live Room ${currentRoom} has been finished and archived!`);
                const statusBadge = document.getElementById('liveRoomStatusBadge');
                if (statusBadge) {
                    statusBadge.innerText = '⏹️ Concluded';
                    statusBadge.style.background = '#450a0a';
                    statusBadge.style.borderColor = '#ef4444';
                    statusBadge.style.color = '#f87171';
                }
                const finishBtn = document.getElementById('liveFinishRoomBtn');
                if (finishBtn) {
                    finishBtn.innerHTML = '<span>🏁 Finished</span>';
                    finishBtn.style.opacity = '0.6';
                }

                setTimeout(() => {
                    if (confirm('Room concluded! Would you like to join another room by link now?')) {
                        window.openJoinRoomModal();
                    }
                }, 600);
            } else {
                toastMsg(`⚠️ Could not finish room: ${data.error}`);
            }
        } catch (e) {
            toastMsg('⚠️ Error finishing room');
        }
    };

    // ==========================================
    // 🎭 SOUNDLESS EMOTION / REACTION TICKER
    // ==========================================
    window.sendLiveReaction = function (emoji) {
        showFloatingReaction(emoji, currentUserName);
        if (window.__liveMeetingBC) {
            window.__liveMeetingBC.postMessage({
                type: 'reaction',
                room: currentRoom,
                user: currentUserName,
                emoji
            });
        }
    };

    function showFloatingReaction(emoji, user) {
        const container = document.getElementById('liveReactionFloatingLayer');
        if (!container) return;

        const bubble = document.createElement('div');
        bubble.className = 'live-reaction-bubble';
        bubble.style.left = `${Math.floor(20 + Math.random() * 60)}%`;
        bubble.innerHTML = `<span style="font-size:28px;">${emoji}</span> <b style="font-size:11px; color:#38bdf8;">${escapeHtml(user)}</b>`;
        container.appendChild(bubble);

        setTimeout(() => {
            if (bubble.parentNode) bubble.parentNode.removeChild(bubble);
        }, 2200);
    }

    // ==========================================
    // 🔒 HOST CONTROLS & LOCKING
    // ==========================================
    window.toggleHostLock = function () {
        if (!isHost) {
            toastMsg('🔒 Only the Host can lock/unlock the board');
            return;
        }
        isBoardLocked = !isBoardLocked;
        syncBoardState({ isLocked: isBoardLocked });
        updateLockUI();
        toastMsg(isBoardLocked ? '🔒 Board locked for attendees' : '🔓 Board unlocked');
    };

    function updateLockUI() {
        const btn = document.getElementById('liveHostLockBtn');
        if (btn) {
            btn.innerHTML = isBoardLocked ? '🔒 Board Locked' : '🔓 Board Active';
            btn.style.background = isBoardLocked ? '#dc2626' : '#1e293b';
        }
    }

    // Modal helpers
    window.openNewRoomModal = function () {
        const modal = document.getElementById('liveNewRoomModal');
        if (modal) modal.style.display = 'flex';
    };
    window.closeNewRoomModal = function () {
        const modal = document.getElementById('liveNewRoomModal');
        if (modal) modal.style.display = 'none';
    };

    // Drawer Tabs
    window.switchLiveDrawerTab = function (tabName) {
        currentDrawerTab = tabName;
        document.querySelectorAll('.live-drawer-tab-btn').forEach(btn => btn.classList.remove('active'));
        document.querySelectorAll('.live-drawer-panel').forEach(p => p.style.display = 'none');

        const activeBtn = document.getElementById(`liveDrawerTab_${tabName}`);
        const activePanel = document.getElementById(`liveDrawerPanel_${tabName}`);
        if (activeBtn) activeBtn.classList.add('active');
        if (activePanel) activePanel.style.display = 'block';
    };

    function startDurationTimer() {
        if (durationTimer) clearInterval(durationTimer);
        sessionStartMs = Date.now();
        durationTimer = setInterval(() => {
            const elapsedSec = Math.floor((Date.now() - sessionStartMs) / 1000);
            const mins = String(Math.floor(elapsedSec / 60)).padStart(2, '0');
            const secs = String(elapsedSec % 60).padStart(2, '0');
            const timerEl = document.getElementById('liveMeetingDuration');
            if (timerEl) timerEl.innerText = `⏱️ ${mins}:${secs}`;
        }, 1000);
    }

    function escapeHtml(str) {
        return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    function toastMsg(msg) {
        const n = document.getElementById('notification');
        if (n) {
            n.innerText = msg;
            n.classList.add('show');
            setTimeout(() => n.classList.remove('show'), 3000);
        }
    }
})();
