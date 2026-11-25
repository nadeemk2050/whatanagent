/* ============================================================================
   ☁️ CLOUD FLARE SECTION — Interactive Infrastructure & Experiments Lab
   Domain focus: alshaabalwaseem.com + WhatAnAgent Ecosystem
   Includes: 8 Lab Services + Interactive Master Benefits & To-Do Tracker
   ============================================================================ */
(function () {
  const DOMAIN = 'alshaabalwaseem.com';

  const SERVICES = [
    {
      id: 'gdrive',
      num: '01',
      icon: '🗄️',
      shortTitle: 'Private GDrive Cloud',
      title: '1. Private Google Drive Cloud (Self-Hosted Storage)',
      badge: 'STORAGE LAB',
      color: '#0284c7',
      bgLight: '#f0f9ff',
      borderLight: '#bae6fd',
      subdomain: 'drive.' + DOMAIN,
      summary: 'Turn your own 2TB/4TB hard drive or VPS folder into a private Google Drive & Dropbox replacement for invoices, GST Excel books, PDFs, and WhatsApp backups.',
      whatItIs:
        'Instead of paying monthly fees to Google Drive, Dropbox, or OneDrive (or worrying about storage limits), this service connects a local hard drive on your Office PC or VPS to Cloudflare Tunnel using lightweight self-hosted cloud software (FileBrowser or Nextcloud). You and your staff get a clean web & mobile interface at drive.' + DOMAIN + ' to upload, organize, preview, and share files with 100% ownership.',
      architecture: [
        'Public URL: https://drive.' + DOMAIN + ' (routed via Cloudflare Tunnel -> localhost:8085)',
        'Storage Engine: FileBrowser / Nextcloud pointed to your dedicated local HDD/SSD folder',
        'Access Control: Separate folders & permissions for Boss, Accounts (Commission/GST sheets), and Staff',
        'Zero Port Forwarding: Works even behind normal home/office Wi-Fi without a static IP'
      ],
      steps: [
        'Install FileBrowser (single lightweight binary) or Nextcloud on your Office PC or VPS.',
        'Point it to your storage directory (e.g., D:\\AlShaabDrive or /data/cloud-drive).',
        'Map drive.' + DOMAIN + ' in your Cloudflare Tunnel configuration to http://localhost:8085.',
        'Enable Cloudflare Zero Trust OTP in front of drive.' + DOMAIN + ' for extra protection.',
        'Upload Excel ledgers, supplier invoices, contracts, and WhatsApp media backups from any phone or laptop.'
      ],
      benefits: [
        'Unlimited storage capacity (only limited by your own hard disk size)',
        '$0/month subscription cost forever (replaces Google Drive/Dropbox fees)',
        'Instant Excel, PDF, image, and video preview directly inside the browser',
        'One-click share links with expiry dates for customers or dealers',
        'Automatic sync option with your WhatAnAgent backups and Commission Accounts exports'
      ],
      todos: [
        { id: 'gdrive_1', text: 'Install FileBrowser / Nextcloud binary on Office PC or VPS storage partition' },
        { id: 'gdrive_2', text: 'Map drive.' + DOMAIN + ' in Cloudflare Tunnel to http://localhost:8085' },
        { id: 'gdrive_3', text: 'Set up separate folders for Boss, Accounts (Commission/GST), and Logistics' },
        { id: 'gdrive_4', text: 'Enable Zero Trust email OTP protection before public access' }
      ]
    },
    {
      id: 'domain_email',
      num: '02',
      icon: '📧',
      shortTitle: 'alshaabalwaseem.com Email & Hosting',
      title: '2. Domain Email & Portal Hosting (' + DOMAIN + ')',
      badge: 'DOMAIN & MAIL',
      color: '#d97706',
      bgLight: '#fffbeb',
      borderLight: '#fde68a',
      subdomain: 'mail.' + DOMAIN + ' & *.' + DOMAIN,
      summary: 'Create official custom emails (nadeem@' + DOMAIN + ', sales@, accounts@) with a full webmail inbox, WhatsApp AI forwarding, and host all WhatAnAgent portals.',
      whatItIs:
        'This experiment powers your official company identity on ' + DOMAIN + '. Using Cloudflare Email Routing + open-source GitHub Cloudflare Worker Webmail (cloudflare_temp_email / vmail) + Cloudflare D1 database, you can create unlimited professional email addresses (like nadeem@' + DOMAIN + ', accounts@' + DOMAIN + ', info@' + DOMAIN + '). At the same time, Cloudflare Tunnel hosts all your live WhatAnAgent portals on clean subdomains.',
      architecture: [
        'Official Emails: nadeem@' + DOMAIN + ', sales@' + DOMAIN + ', accounts@' + DOMAIN + ', support@' + DOMAIN,
        'Webmail Portal: https://mail.' + DOMAIN + ' (powered by Cloudflare Workers + Pages + D1 SQLite)',
        'Inbound -> WhatsApp Bridge: Emails sent to orders@' + DOMAIN + ' forward to WhatAnAgent so Mr. Zaheer summarizes them on WhatsApp',
        'Subdomain Hosting: admin.' + DOMAIN + ', commission.' + DOMAIN + ', trade.' + DOMAIN + ', academy.' + DOMAIN + ', tasks.' + DOMAIN
      ],
      steps: [
        'Add ' + DOMAIN + ' to your free Cloudflare account and point the domain nameservers to Cloudflare.',
        'Enable Cloudflare Email Routing (auto-configures MX, SPF, DKIM, and DMARC records for high deliverability).',
        'Deploy the GitHub Cloudflare Worker Email Inbox repo (or forward directly to Gmail with "Send Mail As" SMTP).',
        'Connect Email Worker webhook to WhatAnAgent so urgent supplier/customer emails alert you on WhatsApp.',
        'Map all WhatAnAgent subdomains (admin, commission, trade, academy, live) through your Cloudflare Tunnel.'
      ],
      benefits: [
        'Unlimited @' + DOMAIN + ' email addresses for $0/month (no per-user Google Workspace fee)',
        'Full custom webmail inbox plus Gmail/Outlook forwarding',
        'AI Staff integration: Mr. Zaheer & Saad can read incoming business emails and brief you on WhatsApp',
        'All your apps live under your own prestigious company domain with automatic HTTPS SSL'
      ],
      todos: [
        { id: 'email_1', text: 'Point nameservers of ' + DOMAIN + ' to Cloudflare' },
        { id: 'email_2', text: 'Activate Cloudflare Email Routing with SPF, DKIM & DMARC records' },
        { id: 'email_3', text: 'Create nadeem@' + DOMAIN + ', accounts@, and sales@ addresses' },
        { id: 'email_4', text: 'Connect incoming emails to WhatAnAgent WhatsApp AI briefing webhook' }
      ]
    },
    {
      id: 'local_ai',
      num: '03',
      icon: '🧠',
      shortTitle: 'Local AI Model Trials',
      title: '3. Local AI Model Connection Trials (Ollama / Qwen / DeepSeek)',
      badge: 'FREE AI ENGINE',
      color: '#7c3aed',
      bgLight: '#f5f3ff',
      borderLight: '#ddd6fe',
      subdomain: 'ai.' + DOMAIN,
      summary: 'Run Qwen, DeepSeek, Llama, and Whisper voice models on your own PC hardware and connect them to WhatAnAgent via Cloudflare Tunnel for $0 AI bills.',
      whatItIs:
        'Why pay per token for every routine WhatsApp reply, translation, or note summary when your own PC can run powerful open-source AI models for free? By installing Ollama on a desktop PC (at home or office) and linking it to ai.' + DOMAIN + ' through Cloudflare Tunnel, your cloud VPS and AI Staff Academy agents can call your local PC as an OpenAI-compatible AI server.',
      architecture: [
        'Local AI Server: Ollama running on Windows/Linux PC (http://localhost:11434)',
        'Secure Tunnel Endpoint: https://ai.' + DOMAIN + '/v1/chat/completions',
        'Models to Trial: Qwen 2.5/3, DeepSeek-R1, Llama 3.3, and Whisper (for Urdu/Roman Urdu voice notes)',
        'Smart Hybrid Routing: Use free Local AI first; if your PC is turned off, automatically fall back to cloud Qwen/Gemini'
      ],
      steps: [
        'Install Ollama on your PC and pull models (e.g., ollama run qwen2.5:7b or deepseek-r1).',
        'Expose localhost:11434 through Cloudflare Tunnel at https://ai.' + DOMAIN + '.',
        'Protect https://ai.' + DOMAIN + ' with a Cloudflare Service Token so only your WhatAnAgent server can call it.',
        'Add the tunnel URL to WhatAnAgent Model Switcher and test live replies inside AI Staff Academy.'
      ],
      benefits: [
        '100% free, unlimited AI token generation on your own hardware',
        'Complete data privacy — sensitive accounting and customer chats never leave your own machines',
        'Seamless automatic fallback to cloud APIs whenever your local PC is asleep',
        'Great for heavy background jobs like LLM Tank learning, news summaries, and CV drafting'
      ],
      todos: [
        { id: 'ai_1', text: 'Install Ollama on local office/home PC and download Qwen 2.5 / DeepSeek-R1' },
        { id: 'ai_2', text: 'Map localhost:11434 to ai.' + DOMAIN + ' via Cloudflare Tunnel' },
        { id: 'ai_3', text: 'Add Cloudflare Service Token header to protect the AI endpoint' },
        { id: 'ai_4', text: 'Set WhatAnAgent hybrid routing: Free Local AI first, cloud fallback second' }
      ]
    },
    {
      id: 'rdp_ssh',
      num: '04',
      icon: '🖥️',
      shortTitle: 'Remote Desktop & SSH',
      title: '4. Browser Remote Desktop (RDP), SSH & VS Code Studio',
      badge: 'REMOTE ACCESS',
      color: '#0f766e',
      bgLight: '#f0fdfa',
      borderLight: '#99f6e4',
      subdomain: 'ssh.' + DOMAIN + ' & rdp.' + DOMAIN,
      summary: 'Open your Linux VPS terminal, Windows Remote Desktop, or full VS Code directly inside any web browser—no TeamViewer, no AnyDesk, and zero open ports.',
      whatItIs:
        'Opening port 22 (SSH) or port 3389 (Windows RDP) to the public internet invites thousands of brute-force hacker bots every hour. Cloudflare Tunnel lets you close those ports completely and instead render an interactive SSH terminal, Windows Remote Desktop, or VS Code (code-server) directly inside Chrome or Safari on your phone, tablet, or laptop.',
      architecture: [
        'Browser SSH Terminal: https://ssh.' + DOMAIN + ' -> renders full Linux terminal in browser after email OTP',
        'Remote VS Code: https://code.' + DOMAIN + ' -> full VS Code environment for editing WhatAnAgent from anywhere',
        'Windows RDP Tunnel: https://rdp.' + DOMAIN + ' -> connect to your Office Windows PC without TeamViewer/AnyDesk limits',
        'Firewall State: Inbound ports 22 and 3389 stay 100% CLOSED on the router and VPS firewall'
      ],
      steps: [
        'Configure ssh.' + DOMAIN + ' in Cloudflare Tunnel pointing to ssh://localhost:22 on your VPS.',
        'Turn on "Browser Rendering" in Cloudflare Zero Trust -> Access -> Applications for ssh.' + DOMAIN + '.',
        'Set up an Access Policy allowing only your verified email address with a 6-digit OTP code.',
        'Open https://ssh.' + DOMAIN + ' from any browser to manage your server securely in seconds.'
      ],
      benefits: [
        'Zero risk of SSH or RDP brute-force hacking attacks',
        'No need to carry SSH private keys on every laptop or phone',
        'No more TeamViewer "Commercial Use Detected" popups or costly subscriptions',
        'Manage your VPS or Office PC even from an iPad or mobile browser while traveling'
      ],
      todos: [
        { id: 'rdp_1', text: 'Point ssh.' + DOMAIN + ' to ssh://localhost:22 on Tencent VPS via Cloudflare Tunnel' },
        { id: 'rdp_2', text: 'Close port 22 on public VPS firewall (allow SSH only via Tunnel)' },
        { id: 'rdp_3', text: 'Install code-server on VPS for mobile browser coding at code.' + DOMAIN },
        { id: 'rdp_4', text: 'Protect ssh.' + DOMAIN + ' and code.' + DOMAIN + ' with 6-digit email PIN gate' }
      ]
    },
    {
      id: 'zero_trust',
      num: '05',
      icon: '🛡️',
      shortTitle: 'Zero Trust Security Wall',
      title: '5. Cloudflare Zero Trust Gate (OTP, Country & Device Lock)',
      badge: 'ZERO TRUST',
      color: '#dc2626',
      bgLight: '#fef2f2',
      borderLight: '#fecaca',
      subdomain: 'Zero Trust Policy on *.' + DOMAIN,
      summary: 'Lock your Admin Dashboard, AI Staff Academy, and Accounting pages behind Cloudflare’s Email PIN gate, UAE/Pakistan country lock, and device check.',
      whatItIs:
        'With Cloudflare Zero Trust (free for up to 50 users), nobody on the internet can even see your login screen unless they first pass Cloudflare’s security check at the edge. Before a single byte reaches your server, Cloudflare verifies who the user is (via a 6-digit email PIN or Google account), which country they are connecting from, and what device they are using.',
      architecture: [
        'Edge Authentication: 6-digit One-Time PIN sent to nadeem@' + DOMAIN + ' or approved staff emails',
        'Geo-Fencing Rule: Allow connections ONLY from UAE and Pakistan; block all other countries at the edge',
        'Path Protection: Protect /admin.html, /academy.html, and /api/agents/* while leaving public webhooks open',
        'Audit Logging: Full log of every login attempt, IP address, country, and device timestamp'
      ],
      steps: [
        'Open Cloudflare Zero Trust dashboard -> Access -> Applications -> Add a Self-Hosted Application.',
        'Select the subdomain or path to protect (e.g., admin.' + DOMAIN + ' or academy.' + DOMAIN + ').',
        'Create a Policy: Action = Allow, Include = Emails ending in @' + DOMAIN + ' (or your specific Gmail addresses).',
        'Add a Country Requirement: Country = United Arab Emirates, Pakistan.',
        'Save — Cloudflare immediately puts a branded OTP verification screen in front of the app.'
      ],
      benefits: [
        'Stops hackers, scanners, and bots before they ever touch your Node.js server',
        'Protects internal tools even if someone accidentally leaks a password',
        '100% free for up to 50 team members on the Cloudflare Zero Trust Free Plan',
        'Instant 1-click revocation if a staff member leaves the company'
      ],
      todos: [
        { id: 'zt_1', text: 'Create Zero Trust Application for admin.' + DOMAIN + ' and academy.' + DOMAIN },
        { id: 'zt_2', text: 'Configure Geo-Fence: Whitelist United Arab Emirates and Pakistan only' },
        { id: 'zt_3', text: 'Add Email Pin authentication for nadeemalsaham@gmail.com and approved team' },
        { id: 'zt_4', text: 'Keep public WhatsApp webhooks (/api/whatsapp) un-gated for Meta connectivity' }
      ]
    },
    {
      id: 'failover',
      num: '06',
      icon: '🔄',
      shortTitle: 'Automatic Failover Trials',
      title: '6. Automatic High-Availability Failover (VPS + Office PC)',
      badge: 'HIGH AVAILABILITY',
      color: '#059669',
      bgLight: '#ecfdf5',
      borderLight: '#a7f3d0',
      subdomain: 'Multi-Connector Tunnel on ' + DOMAIN,
      summary: 'Run the same Cloudflare Tunnel on both your Tencent VPS and your Office PC simultaneously so if one goes down, traffic switches to the other in seconds.',
      whatItIs:
        'Normally, if a VPS reboots or has a network issue, your dashboards and webhooks go offline until it comes back. Cloudflare Tunnel allows multiple "connectors" (cloudflared replicas) on different machines to serve the exact same tunnel ID. If your primary VPS stops responding, Cloudflare’s edge automatically routes requests to your secondary machine (e.g., your Office PC or standby server) with zero DNS delay.',
      architecture: [
        'Connector #1 (Primary): Tencent Cloud VPS running WhatAnAgent (localhost:3000)',
        'Connector #2 (Backup): Office Windows PC or Standby Node running WhatAnAgent replica (localhost:3000)',
        'Database Sync: Shared Firestore + SQLite delta replication for Commission Accounts & Contact Store',
        'Switchover Time: Automatic edge rerouting in 1–3 seconds (no DNS TTL waiting)'
      ],
      steps: [
        'Create one Named Tunnel ("whatanagent-prod") in Cloudflare Zero Trust.',
        'Install the tunnel service with the same token on your Tencent VPS (Primary).',
        'Install the tunnel service with the same token on your Office PC or backup server (Secondary).',
        'Test failover by stopping the server on one machine and watching Cloudflare seamlessly serve from the other.'
      ],
      benefits: [
        'Near-100% uptime for Commission Accounts, AlignTasks, and Trade Portals',
        'Zero DNS propagation delay when switching between servers',
        'Perform server maintenance or upgrades on your VPS without interrupting staff work',
        'Included free in Cloudflare Tunnel without paying for expensive enterprise load balancers'
      ],
      todos: [
        { id: 'fo_1', text: 'Create Named Cloudflare Tunnel ("whatanagent-prod")' },
        { id: 'fo_2', text: 'Install cloudflared connector on Primary Tencent VPS (43.156.245.176)' },
        { id: 'fo_3', text: 'Install cloudflared connector with identical token on Office PC (Backup)' },
        { id: 'fo_4', text: 'Perform test shutdown on Primary to verify 2-second automatic traffic shift' }
      ]
    },
    {
      id: 'office_security',
      num: '07',
      icon: '🏢',
      shortTitle: '7 Security Office Access',
      title: '7. Security & Office Hardware Access (CCTV, Printers & LAN)',
      badge: 'OFFICE SECURITY',
      color: '#4f46e5',
      bgLight: '#eef2ff',
      borderLight: '#c7d2fe',
      subdomain: 'cctv.' + DOMAIN + ' & WARP Private LAN',
      summary: 'View office/warehouse CCTV cameras securely in your browser, and connect remote staff to office printers, local SQL/Tally databases, and LAN devices.',
      whatItIs:
        'Office hardware like CCTV camera recorders (NVR/DVR), network printers, NAS drives, and local accounting software are dangerous to expose on router ports. By running one cloudflared connector inside your office network, you can access your CCTV web viewer at cctv.' + DOMAIN + ' behind Zero Trust OTP, and let your phone/laptop join the private office LAN (192.168.1.x) from anywhere using the Cloudflare WARP app.',
      architecture: [
        'CCTV Portal: https://cctv.' + DOMAIN + ' -> routes to Office NVR/Camera System (e.g. 192.168.1.200:80)',
        'Private Subnet Routing: Expose 192.168.1.0/24 privately to authorized devices running Cloudflare WARP',
        '7 Office Security Layers: (1) CCTV Live View, (2) Office NAS/File Server, (3) Network Printers, (4) Local ERP/Tally DB, (5) Biometric Attendance Device, (6) Router Admin Panel, (7) Office PCs',
        'Zero Public Exposure: Invisible to the public internet; accessible only after Zero Trust authentication'
      ],
      steps: [
        'Run cloudflared on an always-on computer inside your office Wi-Fi/LAN.',
        'Add a Public Hostname cctv.' + DOMAIN + ' pointing to your CCTV NVR local IP (protected by Zero Trust OTP).',
        'Add your office private subnet (e.g., 192.168.1.0/24) to the tunnel’s Private Network routes.',
        'Install the Cloudflare WARP app on your phone/laptop to reach any office device from anywhere in the world.'
      ],
      benefits: [
        'Check office & warehouse cameras securely from any browser without slow third-party P2P apps',
        'Remote staff can print directly to the office printer or connect to local office software',
        'Manage your office router, attendance machine, and local servers remotely with military-grade encryption',
        'No static IP required from your office internet provider'
      ],
      todos: [
        { id: 'sec_1', text: 'Deploy cloudflared on an office LAN PC connected to office Wi-Fi' },
        { id: 'sec_2', text: 'Map cctv.' + DOMAIN + ' to local NVR IP (e.g. 192.168.1.200:80) behind OTP' },
        { id: 'sec_3', text: 'Configure Cloudflare WARP Private Subnet route for 192.168.1.0/24' },
        { id: 'sec_4', text: 'Test remote network printing to office printer from laptop outside office' }
      ]
    },
    {
      id: 'bandwidth_boost',
      num: '08',
      icon: '⚡',
      shortTitle: 'Instant Bandwidth & Speed Boost',
      title: '8. Instant Free Bandwidth & Global Speed Boost (CDN + Cache)',
      badge: 'SPEED & BANDWIDTH',
      color: '#db2777',
      bgLight: '#fdf2f8',
      borderLight: '#fbcfe8',
      subdomain: 'Global Edge Cache on *.' + DOMAIN,
      summary: 'Cache your dashboards, scripts, images, and 15MB AlignTasks APK files on 300+ Cloudflare edge servers (Dubai, Karachi, etc.) to save VPS bandwidth.',
      whatItIs:
        'Every time someone downloads the 15.6 MB AlignTasks APK, opens the 1.1 MB Admin Dashboard, or loads scripts and icons, it consumes outbound bandwidth from your server. When routed through Cloudflare, static assets are cached on Cloudflare’s local data centers in Dubai, Karachi, Mumbai, and 300+ global cities. Users download from the nearest city at lightning speed while your VPS bandwidth usage drops dramatically.',
      architecture: [
        'Edge Caching: Caches /downloads/*.apk, icons, sounds, fonts, and static assets at 300+ global PoPs',
        'Smart Bypass for Live Data: Keeps /commission, /api/*, and WebSockets 100% live and un-cached for real-time accuracy',
        'Brotli & HTTP/3 Acceleration: Compresses HTML/JS/CSS even smaller than standard gzip and speeds up mobile 4G/5G connections',
        'Bot & Scraper Shield: Blocks automated crawlers that waste your server CPU and monthly bandwidth allowance'
      ],
      steps: [
        'Route your domain traffic through Cloudflare (Proxied / Orange Cloud enabled automatically by Tunnel).',
        'Add a Cache Rule: Cache all files under /downloads/* and static extensions (.apk, .png, .mp3, .woff2) for 7 days.',
        'Add a Bypass Rule: Bypass cache for /api/*, /commission*, and dynamic JSON endpoints so money data is always fresh.',
        'Enable Brotli compression, HTTP/3 (QUIC), and Bot Fight Mode in the Cloudflare dashboard.'
      ],
      benefits: [
        'Saves 60%–85% of your VPS / Render monthly outbound bandwidth',
        '15.6 MB AlignTasks APK downloads in seconds from Cloudflare’s local Dubai/Karachi edge',
        'Dashboards open noticeably faster on mobile networks',
        'Free unmetered DDoS protection absorbs traffic spikes automatically'
      ],
      todos: [
        { id: 'speed_1', text: 'Set Cloudflare Cache Rule: Cache /downloads/*.apk and static files for 7 days' },
        { id: 'speed_2', text: 'Set Cache Bypass Rule: Bypass /api/* and /commission* for instant real-time sync' },
        { id: 'speed_3', text: 'Turn on Brotli compression, HTTP/3 (QUIC), and Early Hints in Cloudflare' },
        { id: 'speed_4', text: 'Enable Bot Fight Mode to block malicious crawlers from wasting server bandwidth' }
      ]
    }
  ];

  let activeTab = 'all'; // 'all', 'todo', or service.id
  let todoFilter = 'all'; // 'all', 'pending', 'completed'

  // Persistent To-Do state helper
  function getTodoState() {
    try {
      const saved = localStorage.getItem('cf_lab_todos_v1');
      return saved ? JSON.parse(saved) : {};
    } catch (e) {
      return {};
    }
  }

  function setTodoState(state) {
    try {
      localStorage.setItem('cf_lab_todos_v1', JSON.stringify(state));
    } catch (e) {}
  }

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function injectStyles() {
    if (document.getElementById('cfLabStyles')) return;
    const st = document.createElement('style');
    st.id = 'cfLabStyles';
    st.textContent = `
      .cf-wrap { max-width: 1260px; margin: 0 auto; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; color: #0f172a; }
      .cf-hero {
        background: linear-gradient(135deg, #0f172a 0%, #1e293b 55%, #7c2d12 100%);
        color: #fff;
        border-radius: 16px;
        padding: 22px 24px;
        margin-bottom: 18px;
        box-shadow: 0 10px 25px rgba(15, 23, 42, 0.16);
        display: flex;
        justify-content: space-between;
        align-items: center;
        flex-wrap: wrap;
        gap: 16px;
      }
      .cf-hero h2 { margin: 0 0 6px 0; font-size: 22px; font-weight: 800; display: flex; align-items: center; gap: 10px; color: #fff; }
      .cf-hero p { margin: 0; font-size: 13.5px; color: #cbd5e1; max-width: 760px; line-height: 1.5; }
      .cf-domain-pill {
        background: rgba(249, 115, 22, 0.18);
        border: 1px solid #fb923c;
        color: #ffedd5;
        padding: 8px 14px;
        border-radius: 12px;
        font-size: 13px;
        font-weight: 700;
        display: flex;
        flex-direction: column;
        align-items: flex-end;
        gap: 3px;
      }
      .cf-domain-pill small { font-size: 10.5px; color: #fdba74; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; }
      .cf-tabs {
        display: flex;
        gap: 8px;
        flex-wrap: wrap;
        margin-bottom: 18px;
        background: #fff;
        padding: 10px 12px;
        border-radius: 14px;
        border: 1px solid #e2e8f0;
        box-shadow: 0 2px 6px rgba(15,23,42,0.03);
      }
      .cf-tab {
        border: 1px solid #e2e8f0;
        background: #f8fafc;
        color: #334155;
        padding: 8px 13px;
        border-radius: 10px;
        font-size: 12.5px;
        font-weight: 700;
        cursor: pointer;
        display: inline-flex;
        align-items: center;
        gap: 6px;
        transition: all 0.15s ease;
      }
      .cf-tab:hover { border-color: #f97316; color: #c2410c; background: #fff7ed; }
      .cf-tab.active { background: #f97316; color: #fff; border-color: #ea580c; box-shadow: 0 4px 12px rgba(249, 115, 22, 0.28); }
      .cf-tab.todo-tab { background: #0f172a; color: #f8fafc; border-color: #334155; }
      .cf-tab.todo-tab.active { background: #059669; color: #fff; border-color: #047857; box-shadow: 0 4px 12px rgba(5, 150, 105, 0.35); }
      
      .cf-todo-banner {
        background: linear-gradient(135deg, #f0fdf4 0%, #dcfce7 100%);
        border: 1.5px solid #86efac;
        border-radius: 14px;
        padding: 16px 20px;
        margin-bottom: 18px;
        display: flex;
        justify-content: space-between;
        align-items: center;
        flex-wrap: wrap;
        gap: 14px;
      }
      .cf-todo-progress-bar-wrap {
        width: 100%;
        max-width: 320px;
        background: #bbf7d0;
        height: 10px;
        border-radius: 999px;
        overflow: hidden;
        margin-top: 6px;
      }
      .cf-todo-progress-bar {
        background: #16a34a;
        height: 100%;
        transition: width 0.3s ease;
      }

      .cf-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(290px, 1fr));
        gap: 16px;
      }
      .cf-box {
        background: #fff;
        border: 1px solid #e2e8f0;
        border-radius: 15px;
        padding: 18px;
        cursor: pointer;
        transition: transform 0.16s ease, box-shadow 0.16s ease, border-color 0.16s ease;
        display: flex;
        flex-direction: column;
        justify-content: space-between;
        position: relative;
        overflow: hidden;
      }
      .cf-box:hover {
        transform: translateY(-3px);
        box-shadow: 0 12px 24px rgba(15, 23, 42, 0.09);
        border-color: #f97316;
      }
      .cf-box-top { display: flex; align-items: flex-start; justify-content: space-between; gap: 10px; margin-bottom: 10px; }
      .cf-box-icon {
        width: 44px; height: 44px; border-radius: 12px;
        display: flex; align-items: center; justify-content: center;
        font-size: 22px; flex-shrink: 0;
      }
      .cf-box-badge {
        font-size: 10px; font-weight: 800; padding: 3px 8px; border-radius: 999px;
        letter-spacing: 0.4px; text-transform: uppercase;
      }
      .cf-box-title { font-size: 15.5px; font-weight: 800; color: #0f172a; margin: 0 0 6px 0; line-height: 1.3; }
      .cf-box-sub { font-size: 11.5px; font-family: monospace; color: #64748b; background: #f8fafc; padding: 4px 8px; border-radius: 6px; margin-bottom: 10px; border: 1px dashed #cbd5e1; }
      .cf-box-desc { font-size: 12.8px; color: #475569; line-height: 1.5; margin-bottom: 14px; flex: 1; }
      .cf-box-foot { display: flex; justify-content: space-between; align-items: center; gap: 8px; padding-top: 10px; border-top: 1px solid #f1f5f9; }
      .cf-btn-open {
        background: #fff7ed; color: #c2410c; border: 1px solid #fdba74;
        padding: 6px 12px; border-radius: 8px; font-size: 12px; font-weight: 700; cursor: pointer;
      }
      .cf-btn-start-sm {
        background: linear-gradient(135deg, #f97316, #ea580c); color: #fff; border: none;
        padding: 6px 12px; border-radius: 8px; font-size: 12px; font-weight: 700; cursor: pointer;
      }
      .cf-detail-card {
        background: #fff;
        border: 1px solid #e2e8f0;
        border-radius: 16px;
        padding: 24px;
        box-shadow: 0 8px 24px rgba(15, 23, 42, 0.06);
      }
      .cf-detail-head {
        display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 14px;
        padding-bottom: 18px; margin-bottom: 20px; border-bottom: 1px solid #e2e8f0;
      }
      .cf-detail-grid {
        display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 18px; margin-top: 18px;
      }
      .cf-panel {
        background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 16px;
      }
      .cf-panel h4 { margin: 0 0 10px 0; font-size: 14px; font-weight: 800; color: #0f172a; display: flex; align-items: center; gap: 6px; }
      .cf-list { margin: 0; padding-left: 18px; color: #334155; font-size: 13px; line-height: 1.65; }
      .cf-list li { margin-bottom: 6px; }
      
      .cf-todo-section-card {
        background: #fff;
        border: 1px solid #e2e8f0;
        border-radius: 14px;
        padding: 18px 20px;
        margin-bottom: 16px;
        box-shadow: 0 2px 8px rgba(0,0,0,0.03);
      }
      .cf-todo-row {
        display: flex;
        align-items: flex-start;
        gap: 12px;
        padding: 8px 0;
        border-bottom: 1px solid #f1f5f9;
        font-size: 13px;
        color: #1e293b;
      }
      .cf-todo-row:last-child { border-bottom: none; }
      .cf-todo-row input[type="checkbox"] {
        width: 17px;
        height: 17px;
        accent-color: #16a34a;
        margin-top: 2px;
        cursor: pointer;
      }
      .cf-todo-text { flex: 1; line-height: 1.5; }
      .cf-todo-text.checked { text-decoration: line-through; color: #94a3b8; }
    `;
    document.head.appendChild(st);
  }

  function render() {
    injectStyles();
    const host = document.getElementById('cloudflareSection');
    if (!host) return;

    const todoState = getTodoState();
    let totalTodos = 0;
    let completedTodos = 0;

    SERVICES.forEach(s => {
      (s.todos || []).forEach(t => {
        totalTodos++;
        if (todoState[t.id]) completedTodos++;
      });
    });

    const progressPct = totalTodos > 0 ? Math.round((completedTodos / totalTodos) * 100) : 0;

    const tabsHtml =
      `<button class="cf-tab ${activeTab === 'all' ? 'active' : ''}" onclick="cfSelectTab('all')">📦 All 8 Services (Boxes)</button>` +
      `<button class="cf-tab todo-tab ${activeTab === 'todo' ? 'active' : ''}" onclick="cfSelectTab('todo')">📋 Master Benefits & To-Do List (${completedTodos}/${totalTodos})</button>` +
      SERVICES.map(s =>
        `<button class="cf-tab ${activeTab === s.id ? 'active' : ''}" onclick="cfSelectTab('${s.id}')">${s.icon} ${esc(s.shortTitle)}</button>`
      ).join('');

    let bodyHtml = '';

    if (activeTab === 'todo') {
      // MASTER BENEFITS & TO-DO CHECKLIST VIEW
      bodyHtml = `
        <div class="cf-detail-card" style="margin-bottom:20px;">
          <div class="cf-detail-head">
            <div>
              <div style="display:flex; align-items:center; gap:8px; margin-bottom:6px;">
                <span style="background:#dcfce7; color:#166534; font-size:11px; font-weight:800; padding:3px 9px; border-radius:999px;">MASTER TO-DO TRACKER</span>
                <span style="font-size:12px; font-family:monospace; background:#f1f5f9; color:#334155; padding:3px 9px; border-radius:6px; font-weight:700;">🌐 ${esc(DOMAIN)}</span>
              </div>
              <h3 style="margin:0; font-size:20px; font-weight:800; color:#0f172a;">📋 Cloudflare 8 Services Setup & Benefits Checklist</h3>
              <p style="margin:4px 0 0 0; font-size:13px; color:#64748b;">
                All setup steps and core benefits discussed yesterday for ${esc(DOMAIN)}. Check off items as you configure them on your Tencent VPS, Office PC, and Cloudflare dashboard. State is automatically saved!
              </p>
            </div>
            <div style="display:flex; gap:8px; flex-wrap:wrap; align-items:center;">
              <button class="cf-tab" type="button" onclick="cfSelectTab('all')">← Back to 8 Boxes</button>
              <button class="cf-tab" type="button" onclick="cfSaveTodoState()" style="background:#059669; color:#fff; border-color:#047857;">💾 Save / Sync</button>
            </div>
          </div>

          <!-- Progress summary bar -->
          <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:12px; padding:14px 18px; margin-bottom:20px; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px;">
            <div>
              <span style="font-size:14px; font-weight:700; color:#0f172a;">Overall Execution Progress: </span>
              <strong style="color:#16a34a; font-size:15px;">${completedTodos} of ${totalTodos} Steps Done (${progressPct}%)</strong>
              <div class="cf-todo-progress-bar-wrap" style="max-width:380px;">
                <div class="cf-todo-progress-bar" style="width:${progressPct}%;"></div>
              </div>
            </div>
            <div style="display:flex; gap:6px;">
              <button class="cf-tab ${todoFilter === 'all' ? 'active' : ''}" style="padding:4px 10px; font-size:11.5px;" onclick="cfSetTodoFilter('all')">Show All</button>
              <button class="cf-tab ${todoFilter === 'pending' ? 'active' : ''}" style="padding:4px 10px; font-size:11.5px;" onclick="cfSetTodoFilter('pending')">Pending Only</button>
              <button class="cf-tab ${todoFilter === 'completed' ? 'active' : ''}" style="padding:4px 10px; font-size:11.5px;" onclick="cfSetTodoFilter('completed')">Completed Only</button>
            </div>
          </div>

          <!-- 8 Services Breakdown -->
          ${SERVICES.map(s => {
            const serviceTodos = s.todos || [];
            const serviceDone = serviceTodos.filter(t => todoState[t.id]).length;
            const visibleTodos = serviceTodos.filter(t => {
              if (todoFilter === 'pending') return !todoState[t.id];
              if (todoFilter === 'completed') return !!todoState[t.id];
              return true;
            });

            if (!visibleTodos.length && todoFilter !== 'all') return '';

            return `
              <div class="cf-todo-section-card">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px; flex-wrap:wrap; gap:8px;">
                  <div style="display:flex; align-items:center; gap:10px;">
                    <span style="font-size:22px;">${s.icon}</span>
                    <div>
                      <h4 style="margin:0; font-size:15px; font-weight:800; color:#0f172a;">${esc(s.title)}</h4>
                      <span style="font-size:11px; font-family:monospace; color:#64748b;">${esc(s.subdomain)}</span>
                    </div>
                  </div>
                  <div style="display:flex; align-items:center; gap:8px;">
                    <span style="font-size:11px; font-weight:700; background:${s.bgLight}; color:${s.color}; border:1px solid ${s.borderLight}; padding:3px 8px; border-radius:999px;">
                      ${serviceDone}/${serviceTodos.length} Done
                    </span>
                    <button class="cf-btn-open" style="font-size:11px; padding:3px 8px;" onclick="cfSelectTab('${s.id}')">View Blueprint</button>
                  </div>
                </div>

                <!-- Core Benefits Quick Box -->
                <div style="background:${s.bgLight}; border-left:4px solid ${s.color}; border-radius:6px; padding:8px 12px; margin-bottom:12px; font-size:12px; color:#1e293b;">
                  <strong>✨ Key Business Benefits:</strong> ${esc(s.benefits.slice(0, 2).join(' · '))}
                </div>

                <!-- Checklist Items -->
                <div>
                  ${visibleTodos.map(t => {
                    const isChecked = !!todoState[t.id];
                    return `
                      <div class="cf-todo-row">
                        <input type="checkbox" id="${t.id}" ${isChecked ? 'checked' : ''} onchange="cfToggleTodo('${t.id}', this.checked)">
                        <label for="${t.id}" class="cf-todo-text ${isChecked ? 'checked' : ''}">
                          ${esc(t.text)}
                        </label>
                      </div>
                    `;
                  }).join('')}
                </div>
              </div>
            `;
          }).join('')}
        </div>
      `;
    } else if (activeTab === 'all') {
      // 8 BOXES VIEW WITH TOP TO-DO BANNER
      bodyHtml = `
        <!-- Top To-Do & Benefits Quick Tracker Banner -->
        <div class="cf-todo-banner">
          <div>
            <div style="display:flex; align-items:center; gap:8px; margin-bottom:4px;">
              <span style="font-size:16px;">📋</span>
              <strong style="color:#166534; font-size:14px;">Master Cloudflare Benefits & Setup To-Do Tracker</strong>
              <span style="background:#16a34a; color:#fff; font-size:10px; font-weight:800; padding:2px 7px; border-radius:999px;">PERSISTENT</span>
            </div>
            <div style="font-size:12.5px; color:#15803d; line-height:1.4;">
              Tracks all setup steps and benefits for <b>${esc(DOMAIN)}</b>: $0 email hosting, private GDrive, 0 open ports, local AI, and 60-85% bandwidth reduction.
            </div>
            <div class="cf-todo-progress-bar-wrap">
              <div class="cf-todo-progress-bar" style="width:${progressPct}%;"></div>
            </div>
          </div>
          <div style="display:flex; align-items:center; gap:10px;">
            <div style="text-align:right;">
              <div style="font-size:13.5px; font-weight:800; color:#166534;">${completedTodos} of ${totalTodos} Steps</div>
              <div style="font-size:11px; color:#15803d;">${progressPct}% Completed</div>
            </div>
            <button class="cf-btn-primary" onclick="cfSelectTab('todo')" style="background:#16a34a; color:#fff; border:none; padding:8px 14px; border-radius:8px; font-size:12.5px; font-weight:700; cursor:pointer;">
              Open To-Do List →
            </button>
          </div>
        </div>

        <div style="margin-bottom:12px; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px;">
          <div style="font-size:13px; color:#475569; font-weight:600;">
            👇 Click any of the <b>8 Cloudflare Lab Boxes</b> below (or use the top tabs) to read the full blueprint and launch the service:
          </div>
          <span style="font-size:12px; background:#ecfdf5; color:#047857; border:1px solid #a7f3d0; padding:4px 10px; border-radius:999px; font-weight:700;">
            ✅ All 8 Services Ready for Trial on ${esc(DOMAIN)}
          </span>
        </div>
        <div class="cf-grid">
          ${SERVICES.map(s => `
            <div class="cf-box" onclick="cfSelectTab('${s.id}')">
              <div>
                <div class="cf-box-top">
                  <div class="cf-box-icon" style="background:${s.bgLight}; border:1px solid ${s.borderLight}; color:${s.color};">${s.icon}</div>
                  <span class="cf-box-badge" style="background:${s.bgLight}; color:${s.color}; border:1px solid ${s.borderLight};">${esc(s.badge)}</span>
                </div>
                <h3 class="cf-box-title">${esc(s.title)}</h3>
                <div class="cf-box-sub">🔗 ${esc(s.subdomain)}</div>
                <div class="cf-box-desc">${esc(s.summary)}</div>
              </div>
              <div class="cf-box-foot">
                <button class="cf-btn-open" type="button" onclick="event.stopPropagation(); cfSelectTab('${s.id}')">📖 Full Details</button>
                <button class="cf-btn-start-sm" type="button" onclick="event.stopPropagation(); cfQuickStart('${s.id}')">🚀 Start This Service</button>
              </div>
            </div>
          `).join('')}
        </div>
      `;
    } else {
      // SINGLE SERVICE DETAIL VIEW
      const s = SERVICES.find(x => x.id === activeTab) || SERVICES[0];
      const idx = SERVICES.indexOf(s);
      const prev = idx > 0 ? SERVICES[idx - 1] : null;
      const next = idx < SERVICES.length - 1 ? SERVICES[idx + 1] : null;

      bodyHtml = `
        <div class="cf-detail-card">
          <div class="cf-detail-head">
            <div style="display:flex; gap:14px; align-items:center;">
              <div class="cf-box-icon" style="width:54px; height:54px; font-size:28px; background:${s.bgLight}; border:1px solid ${s.borderLight}; color:${s.color};">${s.icon}</div>
              <div>
                <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap; margin-bottom:4px;">
                  <span class="cf-box-badge" style="background:${s.bgLight}; color:${s.color}; border:1px solid ${s.borderLight};">${esc(s.badge)}</span>
                  <span style="font-size:12px; font-family:monospace; background:#f1f5f9; color:#334155; padding:3px 9px; border-radius:6px; font-weight:700;">🌐 ${esc(s.subdomain)}</span>
                </div>
                <h3 style="margin:0; font-size:20px; font-weight:800; color:#0f172a;">${esc(s.title)}</h3>
              </div>
            </div>
            <div style="display:flex; gap:8px; flex-wrap:wrap;">
              <button class="cf-tab" type="button" onclick="cfSelectTab('all')">← Back to All 8 Boxes</button>
              <button class="cf-tab todo-tab" type="button" onclick="cfSelectTab('todo')">📋 View In To-Do List</button>
              ${prev ? `<button class="cf-tab" type="button" onclick="cfSelectTab('${prev.id}')">◀ ${esc(prev.shortTitle)}</button>` : ''}
              ${next ? `<button class="cf-tab" type="button" onclick="cfSelectTab('${next.id}')">${esc(next.shortTitle)} ▶</button>` : ''}
            </div>
          </div>

          <div style="background:${s.bgLight}; border:1px solid ${s.borderLight}; border-radius:12px; padding:15px 18px; font-size:14px; color:#1e293b; line-height:1.6;">
            <b style="color:${s.color}; display:block; margin-bottom:4px; font-size:13px; text-transform:uppercase; letter-spacing:0.4px;">📌 Complete Service Overview</b>
            ${esc(s.whatItIs)}
          </div>

          <div class="cf-detail-grid">
            <div class="cf-panel">
              <h4>🏗️ Architecture & Endpoints (${esc(DOMAIN)})</h4>
              <ul class="cf-list">
                ${s.architecture.map(item => `<li>${esc(item)}</li>`).join('')}
              </ul>
            </div>

            <div class="cf-panel">
              <h4>🛠️ Step-by-Step Implementation Plan</h4>
              <ol class="cf-list">
                ${s.steps.map(item => `<li>${esc(item)}</li>`).join('')}
              </ol>
            </div>

            <div class="cf-panel">
              <h4>✨ Maximum Benefits for Your Business</h4>
              <ul class="cf-list">
                ${s.benefits.map(item => `<li><b>✓</b> ${esc(item)}</li>`).join('')}
              </ul>
            </div>
          </div>

          <!-- Service specific checklist box -->
          <div style="margin-top:20px; background:#f8fafc; border:1px solid #e2e8f0; border-radius:12px; padding:16px;">
            <h4 style="margin:0 0 10px 0; font-size:14px; font-weight:800; color:#0f172a; display:flex; align-items:center; gap:6px;">
              <span>📋</span> Setup Checklist for this Service
            </h4>
            ${(s.todos || []).map(t => {
              const isChecked = !!todoState[t.id];
              return `
                <div class="cf-todo-row">
                  <input type="checkbox" id="detail_${t.id}" ${isChecked ? 'checked' : ''} onchange="cfToggleTodo('${t.id}', this.checked)">
                  <label for="detail_${t.id}" class="cf-todo-text ${isChecked ? 'checked' : ''}">
                    ${esc(t.text)}
                  </label>
                </div>
              `;
            }).join('')}
          </div>

          <div class="cf-start-cta">
            <div>
              <div style="font-size:15px; font-weight:800; color:#9a3412;">Ready to activate ${esc(s.shortTitle)} on ${esc(DOMAIN)}?</div>
              <div style="font-size:12.5px; color:#c2410c; margin-top:2px;">Click the button to start the guided setup and live connector for this service.</div>
            </div>
            <button class="cf-start-btn" type="button" onclick="cfStartService('${s.id}')">
              🚀 START THIS SERVICE
            </button>
          </div>

          <div id="cfComingSoonBox" class="cf-coming-soon-banner">
            <div style="display:flex; justify-content:space-between; align-items:center; gap:12px; flex-wrap:wrap;">
              <div>
                <div style="font-size:15px; font-weight:800; color:#fb923c; margin-bottom:4px;">⏳ COMING SOON — ${esc(s.title)}</div>
                <div style="font-size:13px; color:#e2e8f0; line-height:1.5;">
                  This module is reserved and ready in your <b>Cloud Flare Section</b>. We will configure and launch <b>${esc(s.subdomain)}</b> step-by-step when you begin this trial!
                </div>
              </div>
              <span style="background:#f97316; color:#fff; font-size:11px; font-weight:800; padding:5px 12px; border-radius:999px; white-space:nowrap;">COMING SOON</span>
            </div>
          </div>
        </div>
      `;
    }

    host.innerHTML = `
      <div class="cf-wrap">
        <div class="cf-hero">
          <div>
            <h2>☁️ Cloud Flare Section <span style="font-size:12px; background:#f97316; color:#fff; padding:3px 10px; border-radius:9999px; font-weight:800;">8 LAB EXPERIENCES</span></h2>
            <p>All-in-one workspace for our Cloudflare Tunnel, Zero Trust, Custom Domain Email, Private GDrive, Local AI Models, Remote Desktop/SSH, Failover, and Office Security trials.</p>
          </div>
          <div class="cf-domain-pill">
            <small>Primary Target Domain</small>
            <span>🌐 ${esc(DOMAIN)}</span>
          </div>
        </div>

        <div class="cf-tabs">${tabsHtml}</div>
        ${bodyHtml}
      </div>
    `;
  }

  window.cfSelectTab = function (tabId) {
    activeTab = tabId || 'all';
    render();
  };

  window.cfSetTodoFilter = function (filter) {
    todoFilter = filter;
    render();
  };

  window.cfToggleTodo = function (todoId, checked) {
    const state = getTodoState();
    state[todoId] = !!checked;
    setTodoState(state);
    render();
  };

  window.cfSaveTodoState = function () {
    const state = getTodoState();
    setTodoState(state);
    fetch('/api/antigravity/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cloudflareTodos: state, lastUpdated: Date.now() })
    }).catch(function () {});

    if (typeof showNotification === 'function') {
      showNotification('✅ Cloudflare To-Do & Benefits Saved!');
    } else {
      alert('✅ Cloudflare To-Do Checklist Saved & Synced!');
    }
  };

  window.cfStartService = function (serviceId) {
    const s = SERVICES.find(x => x.id === serviceId);
    const box = document.getElementById('cfComingSoonBox');
    if (box) {
      box.style.display = 'block';
      box.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
    if (typeof showNotification === 'function') {
      showNotification('⏳ Coming Soon: ' + (s ? s.shortTitle : 'Cloudflare Service'));
    } else {
      alert('⏳ COMING SOON\n\n' + (s ? s.title : 'Cloudflare Service') + '\nTarget: ' + (s ? s.subdomain : DOMAIN));
    }
  };

  window.cfQuickStart = function (serviceId) {
    activeTab = serviceId;
    render();
    setTimeout(function () {
      window.cfStartService(serviceId);
    }, 60);
  };

  window.loadCloudflareLab = render;

  document.addEventListener('DOMContentLoaded', function () {
    render();
  });
})();
