/* ============================================================================
   🪐 ANTIGRAVITY STUDIO — Lightweight Cloud AI Coding Workspace & Agent Hub
   Native, fast Antigravity UI running on Tencent Cloud VPS (43.156.245.176)
   Multi-Model Selector with Auto Cheapest Option & Antigravity CLI v1.5.17
   ============================================================================ */

(function () {
  'use strict';

  var isLoaded = false;
  var activeTab = 'studio'; // Default to lightweight native Antigravity Studio!
  var pollInterval = null;
  var chatHistory = [];
  var selectedRepo = 'whatanagent';
  var selectedModel = 'auto';
  try {
    selectedModel = localStorage.getItem('agSelectedModel') || 'auto';
  } catch (e) {
    selectedModel = 'auto';
  }

  var MODEL_CONFIGS = [
    { id: 'auto', name: '⚡ Auto (Cheapest · Gemini 3.8 Flash Low)', short: 'Auto (Cheapest Flash Low)', cliModel: 'gemini-3.8-flash-low' },
    { id: 'gemini-3.8-flash-low', name: '🟢 Gemini 3.8 Flash Low (Lowest Credits · Fast)', short: 'Flash Low (Cheapest)', cliModel: 'gemini-3.8-flash-low' },
    { id: 'gemini-3.8-flash-medium', name: '🟢 Gemini 3.8 Flash Medium', short: 'Flash Medium', cliModel: 'gemini-3.8-flash-medium' },
    { id: 'gemini-3.8-flash-high', name: '🟢 Gemini 3.8 Flash High', short: 'Flash High', cliModel: 'gemini-3.8-flash-high' },
    { id: 'gemini-4-hydrogen-low', name: '🧪 Gemini 4 Hydrogen Low (Budget)', short: 'Hydrogen Low', cliModel: 'gemini-4-hydrogen-low' },
    { id: 'gemini-4-carbon-medium', name: '💎 Gemini 4 Carbon Medium (Balanced)', short: 'Carbon Medium', cliModel: 'gemini-4-carbon-medium' },
    { id: 'gemini-4-argon-medium', name: '🚀 Gemini 4 Argon Medium (Smart)', short: 'Argon Medium', cliModel: 'gemini-4-argon-medium' },
    { id: 'gemini-4-neon-high', name: '🧠 Gemini 4 Neon High (Deep Reasoning · Max Credits)', short: 'Neon High', cliModel: 'gemini-4-neon-high' },
    { id: 'claude-sonnet-5-5-medium', name: '🎭 Claude Sonnet 5.5 (Medium Credits)', short: 'Sonnet 5.5', cliModel: 'claude-sonnet-5-5-medium' },
    { id: 'claude-opus-5-5-high', name: '🏛️ Claude Opus 5.5 (High Credits)', short: 'Opus 5.5', cliModel: 'claude-opus-5-5-high' },
    { id: 'gpt-oss-120b-medium', name: '🌐 GPT-OSS 120B (Medium)', short: 'GPT-OSS 120B', cliModel: 'gpt-oss-120b-medium' }
  ];

  function getModelInfo(id) {
    var found = MODEL_CONFIGS.find(function (m) { return m.id === id; });
    return found || { id: id, name: id, short: id, cliModel: id };
  }

  var REPOS = [
    { id: 'whatanagent', name: '🤖 WhatAnAgent Core', path: '/opt/whatanagent', branch: 'master' },
    { id: 'aligntasks', name: '📋 AlignTasks PWA', path: '/opt/whatanagent/public/aligntasks', branch: 'master' },
    { id: 'accountspro', name: '📊 AccountsPro', path: '/opt/accountspro', branch: 'main' },
    { id: 'invent', name: '📦 Invent App', path: '/opt/invent', branch: 'master' }
  ];

  window.loadAntigravitySection = function () {
    var container = document.getElementById('antigravitySection');
    if (!container) return;
    if (!isLoaded) {
      renderSection(container);
      initAgResizers();
      isLoaded = true;
    }
    fetchEngineStatus();
    fetchRecentTasks();

    // Sync selected model
    setTimeout(function () {
      if (window.agChangeModel) window.agChangeModel(selectedModel);
    }, 60);

    if (!pollInterval) {
      pollInterval = setInterval(fetchRecentTasks, 6000);
    }
  };

  window.agToggleFullscreen = function () {
    var wrap = document.getElementById('agWrap');
    if (!wrap) return;
    var isFull = wrap.classList.toggle('ag-fullscreen');
    var icon = document.getElementById('agFullscreenIcon');
    var text = document.getElementById('agFullscreenText');
    if (isFull) {
      if (icon) icon.textContent = '🗗';
      if (text) text.textContent = 'Exit Fullscreen';
    } else {
      if (icon) icon.textContent = '⛶';
      if (text) text.textContent = 'Fullscreen';
    }
  };

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') {
      var wrap = document.getElementById('agWrap');
      if (wrap && wrap.classList.contains('ag-fullscreen')) {
        window.agToggleFullscreen();
      }
    }
  });

  window.agToggleSidebarCollapse = function () {
    var sidebar = document.getElementById('agSidebar');
    var resizer = document.getElementById('agResizerX');
    var expandBtn = document.getElementById('agSidebarExpandBtn');
    if (!sidebar) return;
    var isCollapsed = sidebar.classList.toggle('ag-collapsed');
    if (resizer) resizer.style.display = isCollapsed ? 'none' : 'flex';
    if (expandBtn) expandBtn.style.display = isCollapsed ? 'inline-block' : 'none';
  };

  function initAgResizers() {
    var studioFlex = document.getElementById('agStudioFlex');
    var resizerX = document.getElementById('agResizerX');
    var sidebar = document.getElementById('agSidebar');
    var resizerY = document.getElementById('agResizerY');
    var terminal = document.getElementById('agTerminalOutput');
    if (!studioFlex || !resizerX || !sidebar || !resizerY || !terminal) return;

    // Restore saved dimensions from localStorage
    try {
      var savedW = localStorage.getItem('ag_sidebar_w');
      if (savedW && parseInt(savedW, 10) >= 160 && parseInt(savedW, 10) <= 650) {
        studioFlex.style.setProperty('--ag-sidebar-w', savedW + 'px');
        sidebar.style.width = savedW + 'px';
      }
      var savedH = localStorage.getItem('ag_terminal_h');
      if (savedH && parseInt(savedH, 10) >= 48 && parseInt(savedH, 10) <= 500) {
        studioFlex.style.setProperty('--ag-terminal-h', savedH + 'px');
        terminal.style.height = savedH + 'px';
      }
    } catch (e) {}

    // Double-click reset to defaults
    resizerX.addEventListener('dblclick', function () {
      studioFlex.style.setProperty('--ag-sidebar-w', '280px');
      sidebar.style.width = '280px';
      try { localStorage.setItem('ag_sidebar_w', '280'); } catch (e) {}
    });

    resizerY.addEventListener('dblclick', function () {
      studioFlex.style.setProperty('--ag-terminal-h', '180px');
      terminal.style.height = '180px';
      try { localStorage.setItem('ag_terminal_h', '180'); } catch (e) {}
    });

    // Horizontal resizer (Sidebar width)
    var isDraggingX = false;
    var startX = 0;
    var startWidth = 0;

    function onPointerDownX(e) {
      isDraggingX = true;
      startX = e.clientX || (e.touches && e.touches[0] ? e.touches[0].clientX : 0);
      startWidth = sidebar.getBoundingClientRect().width;
      resizerX.classList.add('is-dragging');
      document.body.style.userSelect = 'none';
      document.body.style.cursor = 'col-resize';
      if (e.preventDefault) e.preventDefault();
    }

    function onPointerMoveX(e) {
      if (!isDraggingX) return;
      var currentX = e.clientX || (e.touches && e.touches[0] ? e.touches[0].clientX : 0);
      var deltaX = currentX - startX;
      var newW = Math.max(160, Math.min(650, Math.round(startWidth + deltaX)));
      studioFlex.style.setProperty('--ag-sidebar-w', newW + 'px');
      sidebar.style.width = newW + 'px';
    }

    function onPointerUpX() {
      if (!isDraggingX) return;
      isDraggingX = false;
      resizerX.classList.remove('is-dragging');
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
      try {
        var finalW = Math.round(sidebar.getBoundingClientRect().width);
        localStorage.setItem('ag_sidebar_w', String(finalW));
      } catch (e) {}
    }

    resizerX.addEventListener('mousedown', onPointerDownX);
    resizerX.addEventListener('touchstart', onPointerDownX, { passive: false });

    // Vertical resizer (Terminal height)
    var isDraggingY = false;
    var startY = 0;
    var startHeight = 0;

    function onPointerDownY(e) {
      isDraggingY = true;
      startY = e.clientY || (e.touches && e.touches[0] ? e.touches[0].clientY : 0);
      startHeight = terminal.getBoundingClientRect().height;
      resizerY.classList.add('is-dragging');
      document.body.style.userSelect = 'none';
      document.body.style.cursor = 'row-resize';
      if (e.preventDefault) e.preventDefault();
    }

    function onPointerMoveY(e) {
      if (!isDraggingY) return;
      var currentY = e.clientY || (e.touches && e.touches[0] ? e.touches[0].clientY : 0);
      var deltaY = currentY - startY;
      var newH = Math.max(48, Math.min(500, Math.round(startHeight - deltaY)));
      studioFlex.style.setProperty('--ag-terminal-h', newH + 'px');
      terminal.style.height = newH + 'px';
    }

    function onPointerUpY() {
      if (!isDraggingY) return;
      isDraggingY = false;
      resizerY.classList.remove('is-dragging');
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
      try {
        var finalH = Math.round(terminal.getBoundingClientRect().height);
        localStorage.setItem('ag_terminal_h', String(finalH));
      } catch (e) {}
    }

    resizerY.addEventListener('mousedown', onPointerDownY);
    resizerY.addEventListener('touchstart', onPointerDownY, { passive: false });

    // Global drag handlers
    document.addEventListener('mousemove', function (e) {
      if (isDraggingX) onPointerMoveX(e);
      if (isDraggingY) onPointerMoveY(e);
    });
    document.addEventListener('touchmove', function (e) {
      if (isDraggingX) onPointerMoveX(e);
      if (isDraggingY) onPointerMoveY(e);
    }, { passive: false });

    document.addEventListener('mouseup', function () {
      if (isDraggingX) onPointerUpX();
      if (isDraggingY) onPointerUpY();
    });
    document.addEventListener('touchend', function () {
      if (isDraggingX) onPointerUpX();
      if (isDraggingY) onPointerUpY();
    });
  }

  function renderSection(el) {
    el.innerHTML = `
      <style>
        .ag-wrap {
          width: 100%;
          max-width: 100%;
          margin: 0;
          padding: 4px 6px 16px;
          box-sizing: border-box;
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", sans-serif;
          color: #f1f5f9;
          display: flex;
          flex-direction: column;
          min-height: calc(100vh - 120px);
        }

        /* Fullscreen Bleeding View Mode */
        .ag-wrap.ag-fullscreen {
          position: fixed !important;
          top: 0 !important;
          left: 0 !important;
          right: 0 !important;
          bottom: 0 !important;
          width: 100vw !important;
          height: 100vh !important;
          max-width: 100vw !important;
          z-index: 999999 !important;
          background: #090d16 !important;
          padding: 8px 12px !important;
          margin: 0 !important;
          overflow: hidden !important;
          border-radius: 0 !important;
        }
        .ag-wrap.ag-fullscreen .ag-studio-bar {
          margin-bottom: 8px;
          padding: 10px 16px;
          border-radius: 8px;
        }
        .ag-wrap.ag-fullscreen .ag-tabs {
          margin-bottom: 8px;
        }

        /* Top Antigravity Studio Bar */
        .ag-studio-bar {
          background: #090d16;
          border: 1px solid #1e293b;
          border-radius: 14px;
          padding: 14px 20px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          flex-wrap: wrap;
          gap: 12px;
          margin-bottom: 12px;
          box-shadow: 0 4px 20px rgba(0,0,0,0.3);
        }
        .ag-studio-title {
          display: flex;
          align-items: center;
          gap: 12px;
        }
        .ag-studio-title h2 {
          margin: 0;
          font-size: 18px;
          font-weight: 700;
          color: #ffffff;
          display: flex;
          align-items: center;
          gap: 8px;
          letter-spacing: -0.3px;
        }
        .ag-pill {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          font-size: 11px;
          font-weight: 600;
          padding: 4px 10px;
          border-radius: 20px;
          background: #1e293b;
          color: #cbd5e1;
        }
        .ag-pill.live {
          background: rgba(16, 185, 129, 0.15);
          color: #34d399;
          border: 1px solid rgba(52, 211, 153, 0.3);
        }
        .ag-pill.model {
          background: rgba(99, 102, 241, 0.2);
          color: #a5b4fc;
          border: 1px solid rgba(165, 180, 252, 0.3);
        }
        .ag-dot {
          width: 7px;
          height: 7px;
          border-radius: 50%;
          background: #10b981;
          box-shadow: 0 0 8px #10b981;
        }

        /* Navigation Tabs */
        .ag-tabs {
          display: flex;
          gap: 8px;
          margin-bottom: 12px;
          overflow-x: auto;
          padding-bottom: 4px;
        }
        .ag-tab-btn {
          background: #0f172a;
          border: 1px solid #1e293b;
          border-radius: 9px;
          padding: 8px 16px;
          font-size: 12.5px;
          font-weight: 600;
          color: #94a3b8;
          cursor: pointer;
          display: inline-flex;
          align-items: center;
          gap: 8px;
          transition: all 0.15s;
          white-space: nowrap;
        }
        .ag-tab-btn:hover {
          background: #1e293b;
          color: #f8fafc;
        }
        .ag-tab-btn.active {
          background: #6366f1;
          color: #ffffff;
          border-color: #4f46e5;
          box-shadow: 0 2px 10px rgba(99, 102, 241, 0.35);
        }
        .ag-tab-pane {
          display: none;
        }
        .ag-tab-pane.active {
          display: block;
        }

        /* Studio Main Flex Container */
        .ag-studio-flex {
          display: flex;
          flex-direction: row;
          flex: 1;
          min-height: 600px;
          height: calc(100vh - 210px);
          width: 100%;
          gap: 0;
          position: relative;
          overflow: hidden;
          border-radius: 12px;
          background: #090d16;
          border: 1px solid #1e293b;
        }
        .ag-wrap.ag-fullscreen .ag-studio-flex {
          height: calc(100vh - 120px) !important;
          min-height: 0 !important;
        }
        @media (max-width: 768px) {
          .ag-studio-flex {
            flex-direction: column;
            height: auto;
          }
          .ag-resizer-x {
            display: none !important;
          }
        }

        /* Left Sidebar: Projects & Folders */
        .ag-sidebar {
          width: var(--ag-sidebar-w, 280px);
          min-width: 160px;
          max-width: 650px;
          flex-shrink: 0;
          background: #090d16;
          padding: 14px;
          display: flex;
          flex-direction: column;
          gap: 14px;
          overflow-y: auto;
          box-sizing: border-box;
          border-right: none;
        }
        .ag-sidebar.ag-collapsed {
          display: none !important;
        }
        .ag-side-header {
          font-size: 11px;
          font-weight: 700;
          color: #64748b;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          margin-bottom: 8px;
          display: flex;
          align-items: center;
          justify-content: space-between;
        }
        .ag-repo-item {
          background: #0f172a;
          border: 1px solid #1e293b;
          border-radius: 8px;
          padding: 8px 12px;
          font-size: 12px;
          color: #cbd5e1;
          cursor: pointer;
          transition: all 0.15s;
          margin-bottom: 6px;
          display: flex;
          align-items: center;
          justify-content: space-between;
        }
        .ag-repo-item:hover {
          background: #1e293b;
          color: #fff;
        }
        .ag-repo-item.selected {
          border-color: #6366f1;
          background: rgba(99, 102, 241, 0.15);
          color: #c7d2fe;
          font-weight: 600;
        }

        /* Horizontal Resizer between Sidebar & Canvas */
        .ag-resizer-x {
          width: 8px;
          cursor: col-resize;
          background: #0b1120;
          border-left: 1px solid #1e293b;
          border-right: 1px solid #1e293b;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
          user-select: none;
          transition: background 0.15s, border-color 0.15s;
          z-index: 10;
        }
        .ag-resizer-x:hover,
        .ag-resizer-x.is-dragging {
          background: #4f46e5 !important;
          border-color: #6366f1 !important;
        }
        .ag-resizer-handle-x {
          width: 2px;
          height: 36px;
          border-radius: 2px;
          background: #475569;
          transition: background 0.15s;
        }
        .ag-resizer-x:hover .ag-resizer-handle-x,
        .ag-resizer-x.is-dragging .ag-resizer-handle-x {
          background: #ffffff;
        }

        /* Center Canvas: Chat & Execution Workspace */
        .ag-canvas {
          flex: 1;
          min-width: 320px;
          background: #090d16;
          display: flex;
          flex-direction: column;
          overflow: hidden;
          height: 100%;
          border-radius: 0;
          border: none;
        }
        .ag-canvas-header {
          background: #0f172a;
          border-bottom: 1px solid #1e293b;
          padding: 10px 16px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          font-size: 12px;
          color: #cbd5e1;
          flex-shrink: 0;
        }
        .ag-chat-stream {
          flex: 1;
          min-height: 120px;
          padding: 16px;
          overflow-y: auto;
          display: flex;
          flex-direction: column;
          gap: 12px;
        }
        .ag-msg {
          padding: 12px 14px;
          border-radius: 10px;
          font-size: 13px;
          line-height: 1.5;
          max-width: 90%;
        }
        .ag-msg.user {
          background: #1e293b;
          color: #f8fafc;
          align-self: flex-end;
          border: 1px solid #334155;
        }
        .ag-msg.agent {
          background: #0f172a;
          color: #e2e8f0;
          align-self: flex-start;
          border: 1px solid #1e293b;
          border-left: 3px solid #6366f1;
        }
        .ag-thought-pill {
          background: rgba(99, 102, 241, 0.1);
          color: #818cf8;
          border: 1px dashed rgba(99, 102, 241, 0.4);
          border-radius: 6px;
          padding: 6px 10px;
          font-size: 11px;
          margin-bottom: 8px;
        }

        /* Vertical Resizer between Chat Stream and Terminal */
        .ag-resizer-y {
          height: 8px;
          cursor: row-resize;
          background: #0b1120;
          border-top: 1px solid #1e293b;
          border-bottom: 1px solid #1e293b;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
          user-select: none;
          transition: background 0.15s, border-color 0.15s;
          z-index: 10;
        }
        .ag-resizer-y:hover,
        .ag-resizer-y.is-dragging {
          background: #4f46e5 !important;
          border-color: #6366f1 !important;
        }
        .ag-resizer-handle-y {
          width: 36px;
          height: 2px;
          border-radius: 2px;
          background: #475569;
          transition: background 0.15s;
        }
        .ag-resizer-y:hover .ag-resizer-handle-y,
        .ag-resizer-y.is-dragging .ag-resizer-handle-y {
          background: #ffffff;
        }

        .ag-terminal-view {
          height: var(--ag-terminal-h, 180px);
          min-height: 48px;
          max-height: 450px;
          background: #030712;
          padding: 10px 16px;
          font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
          font-size: 11.5px;
          color: #38bdf8;
          overflow-y: auto;
          white-space: pre-wrap;
          line-height: 1.6;
          flex-shrink: 0;
          border: none;
        }

        /* Prompt Input Box */
        .ag-input-box {
          background: #0f172a;
          border-top: 1px solid #1e293b;
          padding: 12px 16px;
          flex-shrink: 0;
        }
        .ag-textarea {
          width: 100%;
          box-sizing: border-box;
          background: #090d16;
          border: 1px solid #1e293b;
          border-radius: 10px;
          padding: 12px;
          color: #f8fafc;
          font-size: 13px;
          font-family: inherit;
          resize: vertical;
          min-height: 70px;
          margin-bottom: 10px;
        }
        .ag-textarea:focus {
          outline: none;
          border-color: #6366f1;
          box-shadow: 0 0 0 2px rgba(99, 102, 241, 0.25);
        }
        .ag-input-actions {
          display: flex;
          align-items: center;
          justify-content: space-between;
          flex-wrap: wrap;
          gap: 8px;
        }
        .ag-btn-run {
          background: #4f46e5;
          color: #fff;
          border: none;
          border-radius: 8px;
          padding: 9px 18px;
          font-size: 12.5px;
          font-weight: 600;
          cursor: pointer;
          display: inline-flex;
          align-items: center;
          gap: 6px;
          transition: background 0.15s, transform 0.05s;
        }
        .ag-btn-run:hover { background: #4338ca; }
        .ag-btn-run:active { transform: scale(0.98); }
        .ag-chips {
          display: flex;
          flex-wrap: wrap;
          gap: 6px;
          margin-bottom: 10px;
        }
        .ag-chip {
          background: #1e293b;
          color: #94a3b8;
          border: 1px solid #334155;
          border-radius: 16px;
          padding: 4px 10px;
          font-size: 11px;
          cursor: pointer;
          transition: all 0.15s;
        }
        .ag-chip:hover {
          background: rgba(99, 102, 241, 0.2);
          border-color: #6366f1;
          color: #c7d2fe;
        }

        /* Task Cards */
        .ag-task-card {
          background: #090d16;
          border: 1px solid #1e293b;
          border-radius: 10px;
          padding: 12px 14px;
          margin-bottom: 8px;
          display: flex;
          flex-direction: column;
          gap: 6px;
        }
        .ag-task-top {
          display: flex;
          align-items: center;
          justify-content: space-between;
        }
        .ag-status-pill {
          padding: 3px 8px;
          border-radius: 10px;
          font-size: 10px;
          font-weight: 700;
          text-transform: uppercase;
        }
        .ag-status-queued { background: #78350f; color: #fef3c7; }
        .ag-status-running { background: #312e81; color: #c7d2fe; }
        .ag-status-completed { background: #064e3b; color: #a7f3d0; }
        .ag-status-error { background: #7f1d1d; color: #fecaca; }
      </style>

      <div class="ag-wrap" id="agWrap">
        <!-- Top Studio Bar -->
        <div class="ag-studio-bar">
          <div class="ag-studio-title">
            <h2>🪐 Antigravity Studio</h2>
            <span class="ag-pill live"><span class="ag-dot"></span> VPS: 43.156.245.176 (Online)</span>
            
            <!-- AI Model Selector Pill with Auto Cheapest Default -->
            <div style="display:inline-flex; align-items:center; gap:6px; background:#0b1120; border:1px solid #3b82f6; border-radius:10px; padding:3px 8px;">
              <span style="font-size:11.5px; color:#93c5fd; font-weight:700;">⚡ Model:</span>
              <select id="agModelSelect" class="ag-model-selector" onchange="window.agChangeModel(this.value)" style="background:#1e293b; color:#ffffff; border:1px solid #475569; border-radius:6px; padding:3px 8px; font-size:11.5px; font-weight:600; cursor:pointer;">
                <option value="auto" selected>⚡ Auto (Cheapest · Gemini 3.8 Flash Low)</option>
                <option value="gemini-3.8-flash-low">🟢 Gemini 3.8 Flash Low (Lowest Credits · Fast)</option>
                <option value="gemini-3.8-flash-medium">🟢 Gemini 3.8 Flash Medium</option>
                <option value="gemini-3.8-flash-high">🟢 Gemini 3.8 Flash High</option>
                <option value="gemini-4-hydrogen-low">🧪 Gemini 4 Hydrogen Low (Budget)</option>
                <option value="gemini-4-carbon-medium">💎 Gemini 4 Carbon Medium (Balanced)</option>
                <option value="gemini-4-argon-medium">🚀 Gemini 4 Argon Medium (Smart)</option>
                <option value="gemini-4-neon-high">🧠 Gemini 4 Neon High (Deep Reasoning · Max Credits)</option>
                <option value="claude-sonnet-5-5-medium">🎭 Claude Sonnet 5.5 (Medium Credits)</option>
                <option value="claude-opus-5-5-high">🏛️ Claude Opus 5.5 (High Credits)</option>
                <option value="gpt-oss-120b-medium">🌐 GPT-OSS 120B (Medium)</option>
              </select>
            </div>

            <span class="ag-pill">🐙 GitHub: nadeemalsaham</span>
          </div>
          <div style="display:flex; align-items:center; gap:8px;">
            <span style="font-size:11px; color:#64748b;">CLI v1.5.17</span>
            <button onclick="window.agRefreshTasks()" style="background:#1e293b; border:1px solid #334155; color:#cbd5e1; border-radius:6px; padding:4px 10px; font-size:11px; cursor:pointer;">
              🔄 Refresh
            </button>
            <button id="agFullscreenBtn" onclick="window.agToggleFullscreen()" style="background:#1e293b; border:1px solid #334155; color:#cbd5e1; border-radius:6px; padding:4px 10px; font-size:11px; cursor:pointer; display:inline-flex; align-items:center; gap:5px;" title="Toggle Fullscreen bleeding view (Esc to exit)">
              <span id="agFullscreenIcon">⛶</span> <span id="agFullscreenText">Fullscreen</span>
            </button>
          </div>
        </div>

        <!-- Navigation Tabs -->
        <div class="ag-tabs">
          <button class="ag-tab-btn active" onclick="window.agSwitchTab('studio', this)">
            🪐 Antigravity Studio (Lightweight Native)
          </button>
          <button class="ag-tab-btn" onclick="window.agSwitchTab('tasks', this)">
            📜 Tasks Queue & Logs <span id="agQueueBadge" style="background:#f59e0b; color:#fff; border-radius:10px; padding:1px 6px; font-size:10px; display:none;">0</span>
          </button>
        </div>

        <!-- TAB 1: NATIVE ANTIGRAVITY STUDIO -->
        <div id="agTab_studio" class="ag-tab-pane active" style="flex:1; display:flex; flex-direction:column; min-height:0;">
          <div class="ag-studio-flex" id="agStudioFlex">
            <!-- Left Sidebar: Projects, Folders & Quick Actions -->
            <div class="ag-sidebar" id="agSidebar">
              <div>
                <div class="ag-side-header">
                  <span>📁 Target Repository</span>
                  <button id="agSidebarCollapseBtn" onclick="window.agToggleSidebarCollapse()" style="background:none; border:none; color:#64748b; font-size:11px; cursor:pointer; padding:0;" title="Hide Folders Sidebar">
                    ◀ Collapse
                  </button>
                </div>
                <div id="agRepoList">
                  <div class="ag-repo-item selected" onclick="window.agSelectRepo('whatanagent', this)">
                    <span>🤖 WhatAnAgent Core</span>
                    <span style="font-size:10px; color:#6366f1;">/opt/...</span>
                  </div>
                  <div class="ag-repo-item" onclick="window.agSelectRepo('aligntasks', this)">
                    <span>📋 AlignTasks PWA</span>
                    <span style="font-size:10px; color:#64748b;">/public/...</span>
                  </div>
                  <div class="ag-repo-item" onclick="window.agSelectRepo('accountspro', this)">
                    <span>📊 AccountsPro</span>
                    <span style="font-size:10px; color:#64748b;">/opt/...</span>
                  </div>
                  <div class="ag-repo-item" onclick="window.agSelectRepo('invent', this)">
                    <span>📦 Invent App</span>
                    <span style="font-size:10px; color:#64748b;">/opt/...</span>
                  </div>
                </div>
              </div>

              <!-- WhatsApp Boss Bridge Status -->
              <div style="background:#0f172a; border:1px solid #1e293b; border-radius:8px; padding:10px;">
                <div class="ag-side-header" style="margin-bottom:4px;">
                  <span>📱 WhatsApp Boss Bridge</span>
                  <span style="color:#10b981; font-size:10px;">CONNECTED</span>
                </div>
                <div style="font-size:11px; color:#94a3b8; line-height:1.4;">
                  Boss WhatsApp: <code>+971529244592</code><br>
                  Voice & text orders auto-dispatched to VPS Antigravity.
                </div>
              </div>

              <!-- Quick Status -->
              <div style="font-size:11px; color:#64748b; line-height:1.6;">
                <div>• Zero laptop battery drain</div>
                <div>• Push-pull resizable panels</div>
                <div>• Auto-commit & push to GitHub</div>
                <div>• Multi-turn agent memory</div>
              </div>
            </div>

            <!-- Horizontal Resizer (Push/Pull X) -->
            <div class="ag-resizer-x" id="agResizerX" title="Drag to resize folders sidebar width (Double click to reset)">
              <div class="ag-resizer-handle-x"></div>
            </div>

            <!-- Center Canvas -->
            <div class="ag-canvas" id="agCanvas">
              <div class="ag-canvas-header">
                <div style="display:flex; align-items:center; gap:8px;">
                  <button id="agSidebarExpandBtn" onclick="window.agToggleSidebarCollapse()" style="background:#1e293b; border:1px solid #334155; color:#94a3b8; border-radius:6px; padding:2px 8px; font-size:11px; cursor:pointer; display:none;" title="Show Folders / Repos Sidebar">
                    📁 Repos
                  </button>
                  <span style="font-weight:700; color:#fff;" id="agCanvasRepoTitle">🤖 WhatAnAgent Core</span>
                  <span style="color:#64748b; margin-left:4px;" id="agCanvasRepoPath">/opt/whatanagent</span>
                </div>
                <div style="display:flex; align-items:center; gap:8px;">
                  <span id="agActiveModelBadge" style="background:rgba(56,189,248,0.15); color:#38bdf8; border:1px solid rgba(56,189,248,0.3); border-radius:12px; padding:2px 8px; font-size:11px; font-weight:600;">⚡ Auto: Flash Low (Cheapest)</span>
                  <span style="color:#10b981; font-size:11px;">● Ready for Prompts</span>
                </div>
              </div>

              <!-- Chat Stream -->
              <div id="agChatStream" class="ag-chat-stream">
                <div class="ag-msg agent">
                  <div class="ag-thought-pill" id="agChatWelcomePill">💡 Antigravity VPS Engine Ready · Model: Auto (Cheapest Flash Low)</div>
                  Hey Nadeem! I'm running live on your Tencent VPS. What would you like to build or modify in <strong>WhatAnAgent</strong> or <strong>AlignTasks</strong>?
                </div>
              </div>

              <!-- Vertical Resizer (Push/Pull Y between Chat & Terminal) -->
              <div class="ag-resizer-y" id="agResizerY" title="Drag to resize terminal height (Double click to reset)">
                <div class="ag-resizer-handle-y"></div>
              </div>

              <!-- Live Execution Terminal -->
              <div id="agTerminalOutput" class="ag-terminal-view">⚡ Antigravity Runner Standby. Dispatched tasks stream real-time logs here.</div>

              <!-- Prompt Input Box -->
              <div class="ag-input-box">
                <div class="ag-chips">
                  <span class="ag-chip" onclick="window.agSetPrompt('Fix the WhatsApp Web assistant so it continues a conversation across multiple turns with memory')">🤖 Multi-Turn WhatsApp Memory</span>
                  <span class="ag-chip" onclick="window.agSetPrompt('add filter icon on top of aligntask all pages of task')">✨ Add Filter Icon on AlignTasks</span>
                  <span class="ag-chip" onclick="window.agSetPrompt('git pull origin master and inspect git status')">🔄 Git Pull & Status</span>
                  <span class="ag-chip" onclick="window.agSetPrompt('inspect latest error logs on VPS')">🩺 Inspect VPS Logs</span>
                </div>

                <textarea id="agPromptInput" class="ag-textarea" placeholder="Type instructions for Antigravity on your VPS (e.g. 'Add filter icon on task lists')..."></textarea>

                <div class="ag-input-actions">
                  <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
                    <button class="ag-btn-run" onclick="window.agDispatchPrompt()">
                      <span>⚡ Dispatch to Antigravity</span>
                    </button>
                    <button style="background:#1e293b; border:1px solid #334155; color:#cbd5e1; border-radius:8px; padding:8px 12px; font-size:12px; cursor:pointer;" onclick="window.agVoiceInput()" title="Voice dictation">
                      🎙️ Voice
                    </button>
                  </div>
                  <div style="display:flex; align-items:center; gap:6px; font-size:11.5px; color:#94a3b8;">
                    <span>Active Model:</span>
                    <strong id="agActiveModelLabel" style="color:#38bdf8;">Auto (Cheapest Flash Low)</strong>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- TAB 2: TASKS QUEUE & AUDIT -->
        <div id="agTab_tasks" class="ag-tab-pane">
          <div style="background:#090d16; border:1px solid #1e293b; border-radius:12px; padding:18px;">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:14px;">
              <div>
                <h3 style="margin:0; font-size:16px; color:#fff;">📜 Recent Dispatched Tasks & Queue Worker</h3>
                <div style="font-size:11.5px; color:#64748b; margin-top:2px;">Background worker executes tasks autonomously with auto-commit to GitHub</div>
              </div>
              <button onclick="window.agRefreshTasks()" style="background:#1e293b; border:1px solid #334155; color:#cbd5e1; border-radius:6px; padding:5px 12px; font-size:11.5px; cursor:pointer;">
                🔄 Refresh Queue
              </button>
            </div>
            <div id="agTasksList" style="min-height:100px;">
              <div style="text-align:center; padding:20px; color:#64748b; font-size:12px;">Loading tasks history...</div>
            </div>
          </div>
        </div>

      </div>
    `;
  }

  var selectedRepo = 'whatanagent';

  window.agSwitchTab = function (tabName, btn) {
    activeTab = tabName;
    document.querySelectorAll('.ag-tab-btn').forEach(function (b) { b.classList.remove('active'); });
    document.querySelectorAll('.ag-tab-pane').forEach(function (p) { p.classList.remove('active'); });
    if (btn) btn.classList.add('active');
    var target = document.getElementById('agTab_' + tabName);
    if (target) target.classList.add('active');
  };

  window.agSelectRepo = function (repoId, el) {
    selectedRepo = repoId;
    document.querySelectorAll('.ag-repo-item').forEach(function (r) { r.classList.remove('selected'); });
    if (el) el.classList.add('selected');

    var repo = REPOS.find(function (r) { return r.id === repoId; }) || REPOS[0];
    var titleEl = document.getElementById('agCanvasRepoTitle');
    var pathEl = document.getElementById('agCanvasRepoPath');
    if (titleEl) titleEl.textContent = repo.name;
    if (pathEl) pathEl.textContent = repo.path;
  };

  window.agSetPrompt = function (text) {
    var p = document.getElementById('agPromptInput');
    if (p) p.value = text;
  };

  window.agCopyText = function (text, btn) {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(text).then(function () {
        var old = btn.textContent;
        btn.textContent = 'Copied!';
        setTimeout(function () { btn.textContent = old; }, 1800);
      });
    }
  };

  window.agVoiceInput = function () {
    var SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert('Speech Recognition is not supported on this browser. Please type your instruction.');
      return;
    }
    var rec = new SpeechRecognition();
    rec.lang = 'en-US';
    rec.start();
    var term = document.getElementById('agTerminalOutput');
    if (term) term.textContent = '🎙️ Listening... Please speak your instruction.';
    rec.onresult = function (event) {
      var speechResult = event.results[0][0].transcript;
      var p = document.getElementById('agPromptInput');
      if (p) p.value = speechResult;
      if (term) term.textContent = '🎙️ Heard: "' + speechResult + '"\nReady to dispatch.';
    };
    rec.onerror = function (e) {
      if (term) term.textContent = '⚠️ Voice error: ' + (e.error || 'could not capture speech');
    };
  };

  window.agChangeModel = function (val) {
    selectedModel = val || 'auto';
    try { localStorage.setItem('agSelectedModel', selectedModel); } catch (e) {}

    var selects = document.querySelectorAll('.ag-model-selector');
    selects.forEach(function (s) { s.value = selectedModel; });

    var info = getModelInfo(selectedModel);
    var activeLabel = document.getElementById('agActiveModelLabel');
    if (activeLabel) activeLabel.textContent = info.short;

    var activeBadge = document.getElementById('agActiveModelBadge');
    if (activeBadge) activeBadge.textContent = '⚡ ' + info.short;

    var welcomePill = document.getElementById('agChatWelcomePill');
    if (welcomePill) welcomePill.textContent = '💡 Antigravity VPS Engine Ready · Model: ' + info.name;
  };

  window.agDispatchPrompt = function () {
    var p = document.getElementById('agPromptInput');
    var term = document.getElementById('agTerminalOutput');
    var stream = document.getElementById('agChatStream');
    var text = (p && p.value || '').trim();

    if (!text) {
      alert('Please enter an instruction first.');
      return;
    }

    var info = getModelInfo(selectedModel);

    // Add user message to chat stream
    if (stream) {
      var userMsg = document.createElement('div');
      userMsg.className = 'ag-msg user';
      userMsg.textContent = text;
      stream.appendChild(userMsg);
      stream.scrollTop = stream.scrollHeight;
    }

    if (p) p.value = '';

    if (term) {
      term.textContent = '🚀 Dispatching task to Antigravity on Tencent Cloud VPS...\n' +
        'Target Repo: ' + selectedRepo.toUpperCase() + '\n' +
        'Selected Model: ' + info.name + '\n' +
        'Instruction: "' + text + '"\n\n' +
        'Queue worker executing task autonomously on VPS...';
    }

    fetch('/api/antigravity/task/run', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        repo: selectedRepo,
        instruction: text,
        source: 'antigravity_studio',
        model: selectedModel
      })
    })
      .then(function (res) { return res.json(); })
      .then(function (data) {
        if (data.ok) {
          if (term) {
            term.textContent = '✅ Task Dispatched Successfully!\n' +
              'Task ID: ' + (data.task && data.task.id || 'N/A') + '\n' +
              'Model: ' + info.name + '\n' +
              'Status: ' + (data.task && data.task.status || 'queued') + '\n\n' +
              'Antigravity agent is executing task on the VPS with selected model.';
          }
          if (stream) {
            var agentMsg = document.createElement('div');
            agentMsg.className = 'ag-msg agent';
            agentMsg.innerHTML = `
              <div class="ag-thought-pill">⚡ Executing on VPS · ID: ${data.task && data.task.id || 'N/A'} · Model: ${info.short}</div>
              <div class="ag-msg-body" style="color:#94a3b8; font-style:italic;">Processing with ${info.short}...</div>
            `;
            stream.appendChild(agentMsg);
            stream.scrollTop = stream.scrollHeight;

            if (data.task && data.task.id) {
              pollTaskOutput(data.task.id, agentMsg);
            }
          }
          fetchRecentTasks();
        } else {
          if (term) term.textContent = '⚠️ Dispatch failed: ' + (data.error || 'Unknown error');
        }
      })
      .catch(function (err) {
        if (term) term.textContent = '⚠️ Network / server error: ' + err.message;
      });
  };

  function pollTaskOutput(taskId, containerEl) {
    if (!taskId || !containerEl) return;
    var attempts = 0;
    var timer = setInterval(function () {
      attempts++;
      if (attempts > 75) { clearInterval(timer); return; }
      fetch('/api/antigravity/tasks')
        .then(function (r) { return r.json(); })
        .then(function (d) {
          var t = (d && d.tasks || []).find(function (item) { return item.id === taskId; });
          if (t && (t.status === 'completed' || t.status === 'done' || t.status === 'error')) {
            clearInterval(timer);
            var pillText = t.status === 'error' ? '⚠️ Execution Error' : '✅ Completed on VPS';
            var modelBadge = t.modelUsed || t.model || 'Flash Low';
            var bodyText = t.output || (t.error ? 'Error: ' + t.error : 'Task finished.');
            containerEl.innerHTML = `
              <div class="ag-thought-pill">${pillText} · ${(t.repo || '').toUpperCase()} · ${modelBadge}</div>
              <div class="ag-msg-body" style="white-space:pre-wrap; line-height:1.5;">${escapeHtml(bodyText)}</div>
            `;
            var stream = document.getElementById('agChatStream');
            if (stream) stream.scrollTop = stream.scrollHeight;
            var term = document.getElementById('agTerminalOutput');
            if (term && t.output) term.textContent = t.output;
            fetchRecentTasks();
          }
        })
        .catch(function () {});
    }, 2000);
  }

  window.agRefreshTasks = function () {
    fetchRecentTasks();
  };

  function fetchEngineStatus() {
    fetch('/api/antigravity/status')
      .then(function (r) { return r.json(); })
      .then(function () {})
      .catch(function () {});
  }

  var historyLoaded = false;
  function loadChatHistoryFromTasks(tasks) {
    if (historyLoaded || !tasks || !tasks.length) return;
    var stream = document.getElementById('agChatStream');
    if (!stream) return;

    var relevant = tasks.slice(0, 5).reverse();
    relevant.forEach(function (t) {
      if (!t.instruction) return;
      var userMsg = document.createElement('div');
      userMsg.className = 'ag-msg user';
      userMsg.textContent = t.instruction;
      stream.appendChild(userMsg);

      if (t.output || t.status === 'completed' || t.status === 'error') {
        var agentMsg = document.createElement('div');
        agentMsg.className = 'ag-msg agent';
        var pill = t.status === 'error' ? '⚠️ Execution Error' : '✅ Antigravity Reply';
        var modelBadge = t.modelUsed || t.model || 'Flash Low';
        var body = t.output || (t.error ? 'Error: ' + t.error : 'Task completed.');
        agentMsg.innerHTML = `
          <div class="ag-thought-pill">${pill} · ${(t.repo || '').toUpperCase()} · ${modelBadge}</div>
          <div class="ag-msg-body" style="white-space:pre-wrap; line-height:1.5;">${escapeHtml(body)}</div>
        `;
        stream.appendChild(agentMsg);
      }
    });
    historyLoaded = true;
    stream.scrollTop = stream.scrollHeight;
  }

  function fetchRecentTasks() {
    var list = document.getElementById('agTasksList');
    var badge = document.getElementById('agQueueBadge');

    fetch('/api/antigravity/tasks')
      .then(function (r) { return r.json(); })
      .then(function (d) {
        var tasks = (d && d.tasks) || [];
        loadChatHistoryFromTasks(tasks);

        var queuedCount = tasks.filter(function (t) { return t.status === 'queued'; }).length;
        if (badge) {
          if (queuedCount > 0) {
            badge.textContent = queuedCount;
            badge.style.display = 'inline-block';
          } else {
            badge.style.display = 'none';
          }
        }

        if (!tasks.length) {
          list.innerHTML = `
            <div style="color:#64748b; text-align:center; padding:16px;">
              No recent Antigravity tasks. Send an instruction in the Studio above to start!
            </div>
          `;
          return;
        }

        var html = '';
        tasks.slice(0, 8).forEach(function (t) {
          var dateStr = t.createdAt ? new Date(t.createdAt).toLocaleString('en-GB', { timeZone: 'Asia/Dubai', month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit' }) : 'Recent';
          var statusClass = 'ag-status-queued';
          if (t.status === 'done' || t.status === 'completed') statusClass = 'ag-status-completed';
          else if (t.status === 'running') statusClass = 'ag-status-running';
          else if (t.status === 'error') statusClass = 'ag-status-error';

          var outputBox = '';
          if (t.output) {
            outputBox = `
              <details style="margin-top:6px; font-size:11px; color:#94a3b8;">
                <summary style="cursor:pointer; font-weight:600; color:#818cf8;">🔍 View Agent Execution Output</summary>
                <pre style="background:#030712; border:1px solid #1e293b; color:#38bdf8; padding:8px 10px; border-radius:6px; overflow-x:auto; margin-top:4px; max-height:160px; font-size:11px;">${escapeHtml(t.output)}</pre>
              </details>
            `;
          }

          var modelDisplay = t.modelUsed || t.model || 'auto (flash low)';

          html += `
            <div class="ag-task-card">
              <div class="ag-task-top">
                <span style="font-weight:700; color:#fff; font-size:12.5px;">[${(t.repo || 'WHATANAGENT').toUpperCase()}]</span>
                <span class="ag-status-pill ${statusClass}">${t.status || 'queued'}</span>
              </div>
              <div style="font-size:12.5px; color:#cbd5e1; line-height:1.4;">
                ${escapeHtml(t.instruction || '')}
              </div>
              <div style="font-size:11px; color:#64748b; display:flex; justify-content:space-between; flex-wrap:wrap; gap:4px;">
                <span>Source: ${t.source || 'whatsapp'} · Model: <strong style="color:#38bdf8;">${modelDisplay}</strong></span>
                <span>${dateStr}</span>
              </div>
              ${outputBox}
            </div>
          `;
        });
        list.innerHTML = html;
      })
      .catch(function () {});
  }

  function escapeHtml(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

})();
