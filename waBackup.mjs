// WhatsApp chat backup builder — produces explorer-friendly HTML + JSON files from the
// Firestore vault (waWebChatHistory). Works WITHOUT the WhatsApp session (pure DB reads),
// so backups can be made even when the phone/linked device is offline.
import { collection, getDocs, query, orderBy, limit, startAfter } from 'firebase/firestore';

const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fname = (s) => String(s || 'chat').replace(/[^A-Za-z0-9._-]+/g, '_').replace(/^_+|_+$/g, '').substring(0, 60) || 'chat';
const fmtTime = (ms) => (ms ? new Date(ms).toLocaleString('en-GB', { timeZone: 'Asia/Dubai', day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '');

export function buildChatFiles(chat) {
  const c = chat || {};
  const msgs = Array.isArray(c.messages) ? c.messages : [];
  const shortId = String(c.id || 'x').replace(/[^0-9]/g, '').slice(-6) || 'x';
  const base = fname((c.name || 'chat') + '_' + (c.phone || '')) + '_' + shortId;

  const cleanMsgs = msgs.map((m) => ({
    id: m.id || '',
    fromMe: !!m.fromMe,
    senderName: m.senderName || '',
    text: m.text || '',
    timestamp: m.timestamp || 0,
    time: fmtTime(m.timestamp || 0),
    mediaType: m.mediaType || null,
    caption: (m.mediaInfo && m.mediaInfo.caption) || '',
    fileName: (m.mediaInfo && m.mediaInfo.fileName) || ''
  }));

  const json = JSON.stringify({
    app: 'WhatAnAgent (whatanagent-a1e59)',
    exportFormatVersion: 1,
    exportedAt: new Date().toISOString(),
    chat: {
      id: c.id || '',
      name: c.name || '',
      phone: c.phone || '',
      isGroup: !!c.isGroup,
      messageCount: cleanMsgs.length,
      lastActivity: fmtTime(c.timestamp || 0)
    },
    messages: cleanMsgs
  }, null, 1);

  const bubbles = cleanMsgs.map((m) => {
    const badge = m.mediaType ? ('<span class="badge">' + esc(m.mediaType) + (m.fileName ? ' · ' + esc(m.fileName) : '') + '</span>') : '';
    const cap = m.caption ? '<div class="cap">' + esc(m.caption) + '</div>' : '';
    const text = esc(m.text || '');
    return '<div class="row ' + (m.fromMe ? 'out' : 'in') + '">' +
      '<div class="bubble">' +
      '<div class="who">' + esc(m.fromMe ? 'Me' : (m.senderName || c.name || '')) + '</div>' +
      (text ? '<div class="txt">' + text + '</div>' : '') + badge + cap +
      '<div class="time">' + esc(m.time) + '</div>' +
      '</div></div>';
  }).join('\n');

  const html = '<!DOCTYPE html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1">\n' +
    '<title>' + esc(c.name || c.id) + ' — WhatsApp export</title>\n<style>\n' +
    'body{margin:0;background:#0b141a;font-family:Segoe UI,Roboto,Arial,sans-serif;color:#e9edef}\n' +
    '.head{position:sticky;top:0;background:#202c33;padding:14px 20px;border-bottom:1px solid #2a3942;z-index:5}\n' +
    '.head h1{margin:0;font-size:17px}\n.head .meta{font-size:12px;color:#8696a0;margin-top:3px}\n' +
    '.wrap{max-width:900px;margin:0 auto;padding:16px}\n' +
    '.row{display:flex;margin:6px 0}\n.row.out{justify-content:flex-end}\n.row.in{justify-content:flex-start}\n' +
    '.bubble{max-width:78%;background:#202c33;border-radius:10px;padding:8px 12px;box-shadow:0 1px 2px #00000040}\n' +
    '.row.out .bubble{background:#005c4b}\n' +
    '.who{font-size:11.5px;font-weight:700;color:#00a884;margin-bottom:2px}\n' +
    '.row.out .who{color:#a7f3d0}\n' +
    '.txt{font-size:14px;line-height:1.5;white-space:pre-wrap;word-break:break-word}\n' +
    '.time{font-size:10.5px;color:#8696a0;text-align:right;margin-top:4px}\n' +
    '.badge{display:inline-block;font-size:10.5px;background:#00000030;border:1px solid #ffffff22;border-radius:8px;padding:1px 7px;margin-top:4px}\n' +
    '.cap{font-size:12px;color:#cbd5e1;margin-top:4px}\n' +
    '</style>\n</head>\n<body>\n' +
    '<div class="head"><h1>' + esc(c.name || 'Chat') + (c.isGroup ? ' (Group)' : '') + '</h1>' +
    '<div class="meta">' + esc(c.phone ? '+' + c.phone : c.id || '') + ' · ' + cleanMsgs.length + ' messages · exported ' + esc(new Date().toLocaleString('en-GB', { timeZone: 'Asia/Dubai' })) + ' (Dubai) · Ctrl+F to search</div></div>\n' +
    '<div class="wrap">\n' + bubbles + '\n</div>\n</body>\n</html>';

  return { base, html, json };
}

export async function buildFullBackup(db, opts = {}) {
  const cap = opts.limit ? Math.max(1, Number(opts.limit)) : 20000;
  const files = [];
  const indexEntries = [];
  let cursor = null;
  let count = 0;
  let totalMsgs = 0;

  while (count < cap) {
    const col = collection(db, 'waWebChatHistory');
    const q = cursor
      ? query(col, orderBy('timestamp', 'desc'), startAfter(cursor), limit(200))
      : query(col, orderBy('timestamp', 'desc'), limit(200));
    const snap = await getDocs(q);
    if (snap.empty) break;
    for (const d of snap.docs) {
      const chat = d.data() || {};
      const { base, html, json } = buildChatFiles(chat);
      files.push({ name: 'chats/' + base + '.html', data: html });
      files.push({ name: 'chats/' + base + '.json', data: json });
      indexEntries.push({
        name: chat.name || chat.id || '',
        phone: chat.phone || '',
        isGroup: !!chat.isGroup,
        file: base + '.html',
        msgs: (chat.messages || []).length,
        last: chat.timestamp || 0
      });
      totalMsgs += (chat.messages || []).length;
      count++;
      if (count >= cap) break;
    }
    cursor = snap.docs[snap.docs.length - 1];
    if (snap.size < 200) break;
  }

  const dateStr = new Date().toISOString().slice(0, 10);
  const rows = indexEntries.map((e) =>
    '<tr data-search="' + esc((e.name + ' ' + e.phone).toLowerCase()) + '">' +
    '<td>' + (e.isGroup ? '👥 ' : '') + esc(e.name) + '</td>' +
    '<td>' + esc(e.phone ? '+' + e.phone : '—') + '</td>' +
    '<td style="text-align:right">' + e.msgs + '</td>' +
    '<td>' + esc(fmtTime(e.last)) + '</td>' +
    '<td><a href="chats/' + esc(e.file) + '">Open ↗</a></td>' +
    '</tr>').join('\n');

  const indexHtml = '<!DOCTYPE html>\n<html><head><meta charset="utf-8"><title>WhatsApp Backup — ' + dateStr + '</title>\n' +
    '<style>body{font-family:Segoe UI,Arial,sans-serif;background:#f5f7fa;margin:0;padding:24px;color:#1f2937}\n' +
    'h1{margin:0} .meta{color:#6b7280;font-size:13px;margin:6px 0 16px}\n' +
    'input{padding:10px 14px;border:1px solid #d1d5db;border-radius:9px;font-size:14px;width:320px;max-width:100%}\n' +
    'table{border-collapse:collapse;width:100%;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 1px 4px #0001;margin-top:14px}\n' +
    'th,td{padding:9px 12px;border-bottom:1px solid #eef2f7;font-size:13.5px;text-align:left}\n' +
    'th{background:#111827;color:#fff;font-size:12.5px}\n' +
    'a{color:#0369a1;font-weight:600;text-decoration:none}\n' +
    '</style></head><body>\n' +
    '<h1>💬 WhatsApp Chat Backup — ' + dateStr + '</h1>\n' +
    '<div class="meta">' + count + ' chats · ' + totalMsgs + ' messages · exported from WhatAnAgent · every chat opens as its own HTML page (Ctrl+F to search) + a JSON data file for re-import</div>\n' +
    '<input id="q" placeholder="🔍 Search chat name or number..." oninput="filter()">\n' +
    '<table id="t"><thead><tr><th>Chat</th><th>Phone</th><th style="text-align:right">Msgs</th><th>Last activity (Dubai)</th><th></th></tr></thead><tbody>\n' +
    rows + '\n</tbody></table>\n' +
    '<script>function filter(){var v=document.getElementById("q").value.toLowerCase();document.querySelectorAll("#t tbody tr").forEach(function(r){r.style.display=(r.getAttribute("data-search")||"").indexOf(v)>=0?"":"none";});}</script>\n' +
    '</body></html>';

  files.push({ name: 'index.html', data: indexHtml });
  files.push({ name: 'manifest.json', data: JSON.stringify({
    app: 'WhatAnAgent',
    exportFormatVersion: 1,
    exportedAt: new Date().toISOString(),
    date: dateStr,
    chats: count,
    messages: totalMsgs,
    filesPerChat: ['chats/<name>_<phone>_<id>.html (human readable)', 'chats/<name>_<phone>_<id>.json (machine data)'],
    note: 'Open index.html in any browser — no app or internet needed. JSON files preserve full data for future re-import.'
  }, null, 1) });

  return { files, stats: { chats: count, messages: totalMsgs } };
}
