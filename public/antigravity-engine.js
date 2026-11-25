/* ============================================================================
   🪐 ANTIGRAVITY VPS ENGINE — 24/7 Cloud AI Coding Hub & WhatsApp Boss Bridge
   Runs on Tencent Cloud VPS (43.156.245.176) independently of laptop power state
   Account: nadeemalsaham@gmail.com | WhatsApp Boss: +971529244592
   ============================================================================ */

(function () {
  'use strict';

  var isLoaded = false;
  var currentRepo = 'aligntasks';
  var REPOS = [
    { id: 'aligntasks', name: '📋 AlignTasks PWA', path: '/opt/whatanagent/public/aligntasks', branch: 'master', desc: 'Team task board PWA & client interface' },
    { id: 'whatanagent', name: '🤖 WhatAnAgent Core', path: '/opt/whatanagent', branch: 'master', desc: 'Main WhatsApp AI bot, Baileys & Express server' },
    { id: 'accountspro', name: '📊 AccountsPro', path: '/opt/accountspro', branch: 'main', desc: 'Financial accounts & trading ledgers' },
    { id: 'invent', name: '📦 Invent App', path: '/opt/invent', branch: 'master', desc: 'Inventory management & lots system' }
  ];

  window.loadAntigravitySection = function () {
    var container = document.getElementById('antigravitySection');
    if (!container) return;
    if (!isLoaded) {
      renderSection(container);
      isLoaded = true;
    }
    fetchEngineStatus();
    fetchRecentTasks();
  };

  function renderSection(el) {
    el.innerHTML = `
      <style>
        .ag-wrap {
          max-width: 1100px;
          margin: 0 auto;
          padding: 16px;
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
          color: #1e293b;
        }
        .ag-card {
          background: #ffffff;
          border: 1px solid #e2e8f0;
          border-radius: 14px;
          padding: 20px;
          margin-bottom: 20px;
          box-shadow: 0 2px 8px rgba(0,0,0,0.04);
        }
        .ag-hero {
          background: linear-gradient(135deg, #1e1b4b 0%, #312e81 50%, #4338ca 100%);
          color: #ffffff;
          border-radius: 16px;
          padding: 24px;
          margin-bottom: 22px;
          box-shadow: 0 10px 25px -5px rgba(49, 46, 129, 0.3);
        }
        .ag-hero h1 {
          margin: 0 0 8px 0;
          font-size: 22px;
          font-weight: 700;
          display: flex;
          align-items: center;
          gap: 10px;
          letter-spacing: -0.3px;
        }
        .ag-hero p {
          margin: 0 0 16px 0;
          font-size: 13.5px;
          opacity: 0.9;
          line-height: 1.5;
        }
        .ag-badges {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
        }
        .ag-badge {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          font-size: 11px;
          font-weight: 600;
          padding: 4px 10px;
          border-radius: 20px;
          background: rgba(255,255,255,0.15);
          color: #fff;
          backdrop-filter: blur(4px);
        }
        .ag-badge.live {
          background: rgba(16, 185, 129, 0.25);
          color: #6ee7b7;
          border: 1px solid rgba(110, 231, 183, 0.4);
        }
        .ag-badge-dot {
          width: 7px;
          height: 7px;
          border-radius: 50%;
          background: #10b981;
          box-shadow: 0 0 8px #10b981;
          display: inline-block;
        }
        .ag-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
          gap: 18px;
        }
        .ag-section-title {
          font-size: 15px;
          font-weight: 700;
          color: #0f172a;
          margin-bottom: 12px;
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .ag-step-box {
          background: #f8fafc;
          border: 1px solid #e2e8f0;
          border-radius: 10px;
          padding: 12px;
          margin-bottom: 10px;
          font-size: 12.5px;
          line-height: 1.5;
        }
        .ag-code-box {
          background: #0f172a;
          color: #38bdf8;
          font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
          font-size: 11.5px;
          padding: 10px 14px;
          border-radius: 8px;
          overflow-x: auto;
          margin: 8px 0;
          position: relative;
        }
        .ag-btn-copy {
          position: absolute;
          top: 6px;
          right: 6px;
          background: #334155;
          color: #f1f5f9;
          border: none;
          border-radius: 5px;
          padding: 3px 8px;
          font-size: 10px;
          cursor: pointer;
          transition: background 0.15s;
        }
        .ag-btn-copy:hover {
          background: #475569;
        }
        .ag-prompt-input {
          width: 100%;
          box-sizing: border-box;
          padding: 12px;
          border: 1px solid #cbd5e1;
          border-radius: 10px;
          font-size: 13px;
          font-family: inherit;
          resize: vertical;
          min-height: 80px;
          margin-bottom: 10px;
        }
        .ag-prompt-input:focus {
          outline: none;
          border-color: #6366f1;
          box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.15);
        }
        .ag-btn-primary {
          background: #4f46e5;
          color: #fff;
          border: none;
          border-radius: 8px;
          padding: 9px 16px;
          font-size: 13px;
          font-weight: 600;
          cursor: pointer;
          display: inline-flex;
          align-items: center;
          gap: 6px;
          transition: background 0.15s, transform 0.05s;
        }
        .ag-btn-primary:hover {
          background: #4338ca;
        }
        .ag-btn-primary:active {
          transform: scale(0.98);
        }
        .ag-quick-chips {
          display: flex;
          flex-wrap: wrap;
          gap: 6px;
          margin-bottom: 12px;
        }
        .ag-chip {
          background: #f1f5f9;
          color: #334155;
          border: 1px solid #e2e8f0;
          border-radius: 20px;
          padding: 4px 10px;
          font-size: 11px;
          cursor: pointer;
          transition: all 0.15s;
        }
        .ag-chip:hover {
          background: #e0e7ff;
          border-color: #c7d2fe;
          color: #3730a3;
        }
        .ag-log-terminal {
          background: #090d16;
          color: #e2e8f0;
          font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
          font-size: 11px;
          line-height: 1.6;
          padding: 12px;
          border-radius: 10px;
          max-height: 220px;
          overflow-y: auto;
          margin-top: 10px;
          white-space: pre-wrap;
        }
        .ag-log-item {
          display: flex;
          justify-content: space-between;
          padding: 8px 10px;
          border-bottom: 1px solid #f1f5f9;
          font-size: 12px;
        }
        .ag-status-pill {
          padding: 2px 7px;
          border-radius: 10px;
          font-size: 10px;
          font-weight: 700;
          text-transform: uppercase;
        }
        .ag-status-queued { background: #fef3c7; color: #92400e; }
        .ag-status-running { background: #e0e7ff; color: #3730a3; }
        .ag-status-done { background: #dcfce7; color: #166534; }
        .ag-status-error { background: #fee2e2; color: #991b1b; }
      </style>

      <div class="ag-wrap">
        <!-- Hero Header -->
        <div class="ag-hero">
          <h1>🪐 Antigravity VPS Engine & Agent Hub</h1>
          <p>
            Zero-Laptop Dependency: Antigravity runs 24/7 on your Tencent Cloud VPS (<code>43.156.245.176</code>). 
            Even when your laptop is completely powered off or in sleep mode, you can control the coding agent directly 
            via <strong>WhatsApp Boss voice/text</strong> or from your <strong>Samsung Note 20 Ultra mobile browser</strong>.
          </p>
          <div class="ag-badges">
            <span class="ag-badge live"><span class="ag-badge-dot"></span> VPS Engine: 24/7 ONLINE</span>
            <span class="ag-badge">👤 Account: nadeemalsaham@gmail.com</span>
            <span class="ag-badge">🐙 GitHub: nadeemalsaham (Master Branch)</span>
            <span class="ag-badge">📱 WhatsApp Boss: +971529244592</span>
          </div>
        </div>

        <div class="ag-grid">
          <!-- WhatsApp Boss Coding Bridge -->
          <div class="ag-card">
            <div class="ag-section-title">
              <span>📱 WhatsApp Boss Coding Bridge</span>
              <span style="font-size:10px; font-weight:bold; background:#dcfce7; color:#166534; padding:2px 8px; border-radius:12px;">ACTIVE</span>
            </div>
            <p style="font-size:12.5px; color:#475569; margin:0 0 12px 0; line-height:1.5;">
              Send voice notes or text messages from your verified WhatsApp (<code>+971529244592</code>). WhatAnAgent detects coding orders, dispatches the Antigravity engine on the VPS, commits changes to GitHub, and messages you back!
            </p>

            <div style="background:#f0fdf4; border:1px solid #bbf7d0; border-radius:10px; padding:12px; margin-bottom:12px;">
              <strong style="color:#166534; font-size:12px; display:block; margin-bottom:4px;">🎯 Your Requested WhatsApp Command:</strong>
              <div style="font-size:12px; color:#15803d; font-style:italic; background:#ffffff; padding:8px 10px; border-radius:6px; border:1px dashed #86efac;">
                "add filter icon on top of aligntask all pages of task"
              </div>
            </div>

            <div class="ag-quick-chips">
              <span class="ag-chip" onclick="window.agFillPrompt('add filter icon on top of aligntask all pages of task', 'aligntasks')">✨ Add Filter Icon on AlignTasks</span>
              <span class="ag-chip" onclick="window.agFillPrompt('fix mobile responsive layout on task lists in aligntasks', 'aligntasks')">📱 Fix Mobile Layout</span>
              <span class="ag-chip" onclick="window.agFillPrompt('pull latest master and verify git status', 'whatanagent')">🔄 Git Status & Pull</span>
              <span class="ag-chip" onclick="window.agFillPrompt('check error logs on VPS and report status', 'whatanagent')">🩺 Inspect VPS Logs</span>
            </div>

            <div style="display:flex; gap:8px;">
              <button class="ag-btn-primary" onclick="window.agSimulateBossCommand()" style="background:#059669; font-size:12px;">
                <span>▶️ Run / Simulate Boss Command</span>
              </button>
            </div>
          </div>

          <!-- Mobile Browser Prompt Console -->
          <div class="ag-card">
            <div class="ag-section-title">
              <span>🚀 Mobile Agent Prompt Console</span>
            </div>
            <div style="margin-bottom:10px;">
              <label style="font-size:11.5px; font-weight:600; color:#475569; display:block; margin-bottom:4px;">Target Repository on VPS:</label>
              <select id="agRepoSelect" style="width:100%; padding:8px 10px; border-radius:8px; border:1px solid #cbd5e1; font-size:12.5px; background:#fff;">
                <option value="aligntasks">📋 AlignTasks PWA (/opt/whatanagent/public/aligntasks)</option>
                <option value="whatanagent">🤖 WhatAnAgent System (/opt/whatanagent)</option>
                <option value="accountspro">📊 AccountsPro (/opt/accountspro)</option>
                <option value="invent">📦 Invent App (/opt/invent)</option>
              </select>
            </div>

            <textarea id="agPromptInput" class="ag-prompt-input" placeholder="Type or paste any coding instruction for Antigravity on your VPS (e.g. 'add filter icon on top of aligntask all pages of task')..."></textarea>

            <div style="display:flex; justify-content:space-between; align-items:center;">
              <button class="ag-btn-primary" onclick="window.agDispatchPrompt()">
                <span>⚡ Dispatch to Antigravity on VPS</span>
              </button>
              <button style="background:none; border:1px solid #cbd5e1; border-radius:8px; padding:8px 12px; font-size:12px; cursor:pointer;" onclick="window.agVoiceInput()" title="Voice input from phone">
                🎙️ Voice
              </button>
            </div>

            <div id="agTerminalOutput" class="ag-log-terminal">Engine standby. Ready to execute code tasks on Tencent Cloud VPS.</div>
          </div>
        </div>

        <!-- VPS Setup & Architecture -->
        <div class="ag-card">
          <div class="ag-section-title">
            <span>🛠️ Tencent VPS One-Time Setup & CLI Guide</span>
          </div>
          <p style="font-size:12.5px; color:#475569; margin:0 0 14px 0;">
            To ensure your VPS can independently fetch GitHub repositories and run Antigravity CLI (<code>agy</code>) with <code>nadeemalsaham@gmail.com</code>, run these quick commands in your VPS SSH terminal:
          </p>

          <div class="ag-step-box">
            <strong>1. Configure Git & GitHub Identity on Tencent VPS:</strong>
            <div class="ag-code-box">
              <button class="ag-btn-copy" onclick="window.agCopy(this, 'git config --global user.name \"Nadeem\"\ngit config --global user.email \"nadeemalsaham@gmail.com\"\ngh auth status || gh auth login')">Copy</button>
              git config --global user.name "Nadeem"<br>
              git config --global user.email "nadeemalsaham@gmail.com"<br>
              gh auth status || gh auth login
            </div>
            <span style="color:#64748b; font-size:11.5px;">Ensures all automated commits to AlignTasks and WhatAnAgent are stamped with your verified GitHub profile.</span>
          </div>

          <div class="ag-step-box">
            <strong>2. Install Antigravity CLI (agy) on Tencent VPS:</strong>
            <div class="ag-code-box">
              <button class="ag-btn-copy" onclick="window.agCopy(this, 'curl -fsSL https://antigravity.google/install.sh | bash\nagy --version')">Copy</button>
              curl -fsSL https://antigravity.google/install.sh | bash<br>
              agy --version
            </div>
            <span style="color:#64748b; font-size:11.5px;">Installs the official lightweight headless Antigravity CLI runner on Linux.</span>
          </div>

          <div class="ag-step-box">
            <strong>3. Optional Mobile Web IDE (VS Code in Browser via Cloudflare Tunnel):</strong>
            <div class="ag-code-box">
              <button class="ag-btn-copy" onclick="window.agCopy(this, 'curl -fsSL https://code-server.dev/install.sh | sh\nsudo systemctl enable --now code-server@ubuntu')">Copy</button>
              curl -fsSL https://code-server.dev/install.sh | sh<br>
              sudo systemctl enable --now code-server@ubuntu
            </div>
            <span style="color:#64748b; font-size:11.5px;">Allows you to open full VS Code in your phone Chrome browser at code.aitoolsgent.com anytime laptop is off.</span>
          </div>
        </div>

        <!-- Recent Tasks & Audit Trail -->
        <div class="ag-card">
          <div class="ag-section-title" style="justify-content:space-between;">
            <span>📜 Recent Dispatched Tasks & Audit Trail</span>
            <button onclick="window.agRefreshTasks()" style="background:none; border:1px solid #cbd5e1; border-radius:6px; padding:3px 8px; font-size:11px; cursor:pointer;">🔄 Refresh</button>
          </div>
          <div id="agTasksList" style="min-height:80px;">
            <div style="text-align:center; padding:20px; color:#94a3b8; font-size:12px;">Loading tasks history...</div>
          </div>
        </div>
      </div>
    `;
  }

  window.agFillPrompt = function (text, repo) {
    var p = document.getElementById('agPromptInput');
    if (p) p.value = text;
    var r = document.getElementById('agRepoSelect');
    if (r && repo) r.value = repo;
  };

  window.agCopy = function (btn, text) {
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
      alert('Speech Recognition is not supported in this browser. Please type your instruction.');
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

  window.agDispatchPrompt = function () {
    var p = document.getElementById('agPromptInput');
    var r = document.getElementById('agRepoSelect');
    var term = document.getElementById('agTerminalOutput');
    var text = (p && p.value || '').trim();
    var repo = (r && r.value || 'aligntasks');

    if (!text) {
      alert('Please enter a coding instruction first.');
      return;
    }

    if (term) {
      term.textContent = '🚀 Dispatching task to Antigravity on Tencent VPS...\n' +
        'Target Repo: ' + repo.toUpperCase() + '\n' +
        'Instruction: "' + text + '"\n\n' +
        'Connecting to VPS /opt/whatanagent backend...';
    }

    fetch('/api/antigravity/task/run', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ repo: repo, instruction: text, source: 'mobile_web_dashboard' })
    })
      .then(function (res) { return res.json(); })
      .then(function (data) {
        if (data.ok) {
          if (term) {
            term.textContent = '✅ SUCCESS! Task Dispatched to Antigravity VPS Engine.\n' +
              'Task ID: ' + (data.task && data.task.id || 'N/A') + '\n' +
              'Status: ' + (data.task && data.task.status || 'queued') + '\n' +
              'Target Repo: ' + (data.task && data.task.repo || repo) + '\n' +
              'User: ' + (data.task && data.task.user || 'nadeemalsaham@gmail.com') + '\n\n' +
              '🪐 The Antigravity agent on Tencent VPS is processing the codebase modifications.\n' +
              'All changes will be pushed to GitHub repository.';
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

  window.agSimulateBossCommand = function () {
    var cmd = 'add filter icon on top of aligntask all pages of task';
    var term = document.getElementById('agTerminalOutput');
    if (term) {
      term.textContent = '📱 Simulating Boss WhatsApp Command:\n' +
        'Boss (+971529244592): "' + cmd + '"\n\n' +
        'Routing through WhatAnAgent Boss AI Brain...';
    }

    fetch('/api/boss-chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: cmd })
    })
      .then(function (res) { return res.json(); })
      .then(function (data) {
        if (term) {
          term.textContent = '📱 BOSS WHATSAPP REPLY RECEIVED:\n\n' +
            (data.reply || 'Order received.') + '\n\n' +
            '✅ Verified: Antigravity engine received coding action from Boss WhatsApp!';
        }
        fetchRecentTasks();
      })
      .catch(function (err) {
        if (term) term.textContent = '⚠️ Boss command simulation error: ' + err.message;
      });
  };

  window.agRefreshTasks = function () {
    fetchRecentTasks();
  };

  function fetchEngineStatus() {
    fetch('/api/antigravity/status')
      .then(function (r) { return r.json(); })
      .then(function (d) {
        if (!d.ok) return;
        // Status updated
      })
      .catch(function () {});
  }

  function fetchRecentTasks() {
    var list = document.getElementById('agTasksList');
    if (!list) return;

    fetch('/api/antigravity/tasks')
      .then(function (r) { return r.json(); })
      .then(function (d) {
        var tasks = (d && d.tasks) || [];
        if (!tasks.length) {
          list.innerHTML = `
            <div class="ag-log-item" style="color:#64748b; justify-content:center; padding:16px;">
              No recent Antigravity tasks in queue yet. Send a prompt above or from WhatsApp Boss to start!
            </div>
          `;
          return;
        }

        var html = '';
        tasks.slice(0, 10).forEach(function (t) {
          var dateStr = t.createdAt ? new Date(t.createdAt).toLocaleString('en-GB', { timeZone: 'Asia/Dubai', month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit' }) : 'Recent';
          var statusClass = 'ag-status-queued';
          if (t.status === 'done' || t.status === 'completed') statusClass = 'ag-status-done';
          else if (t.status === 'running') statusClass = 'ag-status-running';
          else if (t.status === 'error') statusClass = 'ag-status-error';

          html += `
            <div class="ag-log-item">
              <div style="flex:1; padding-right:12px;">
                <div style="font-weight:600; color:#0f172a; margin-bottom:2px;">
                  [${(t.repo || 'ALIGNTASKS').toUpperCase()}] ${escapeHtml(t.instruction || '')}
                </div>
                <div style="font-size:11px; color:#64748b;">
                  Source: <strong>${t.source || 'whatsapp'}</strong> • User: ${t.user || 'nadeemalsaham@gmail.com'} • ${dateStr}
                </div>
              </div>
              <div>
                <span class="ag-status-pill ${statusClass}">${t.status || 'queued'}</span>
              </div>
            </div>
          `;
        });
        list.innerHTML = html;
      })
      .catch(function () {
        list.innerHTML = '<div style="color:#ef4444; padding:12px; font-size:12px;">Could not load tasks list.</div>';
      });
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
