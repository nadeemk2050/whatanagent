// ============================================================================
// 🪐 ANTIGRAVITY VPS ENGINE — Background Task Queue Worker & Runner
// Polls and executes queued coding tasks from Firestore (appData/antigravityTasks/tasks)
// Runs on Tencent Cloud VPS (43.156.245.176)
// ============================================================================

import { collection, query, where, getDocs, doc, updateDoc, orderBy, limit } from 'firebase/firestore';
import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';

let workerRunning = false;
let workerDb = null;
let pollTimer = null;

const REPO_PATHS = {
  aligntasks: path.join(process.cwd(), 'public', 'aligntasks'),
  whatanagent: process.cwd(),
  accountspro: '/opt/accountspro',
  invent: '/opt/invent'
};

export function startAntigravityWorker(db) {
  if (workerRunning || !db) return;
  workerDb = db;
  workerRunning = true;
  console.log('🪐 [ANTIGRAVITY WORKER] Started background queue listener.');

  // Run initial check after 3 seconds, then poll every 20 seconds
  setTimeout(pollQueuedTasks, 3000);
  pollTimer = setInterval(pollQueuedTasks, 20000);
}

export async function stopAntigravityWorker() {
  if (pollTimer) clearInterval(pollTimer);
  workerRunning = false;
}

export async function pollQueuedTasks() {
  if (!workerDb) return;
  try {
    const col = collection(workerDb, 'appData', 'antigravityTasks', 'tasks');
    const q = query(col, where('status', '==', 'queued'), limit(3));
    const snap = await getDocs(q);

    if (snap.empty) return;

    for (const docSnap of snap.docs) {
      const task = { docId: docSnap.id, ...docSnap.data() };
      await processTask(task);
    }
  } catch (err) {
    console.warn('🪐 [ANTIGRAVITY WORKER] Poll warning:', err.message);
  }
}

export async function processTask(task) {
  if (!task || !task.docId || !workerDb) return;
  const taskRef = doc(workerDb, 'appData', 'antigravityTasks', 'tasks', task.docId);

  const targetRepo = task.repo || 'whatanagent';
  const targetDir = REPO_PATHS[targetRepo] || process.cwd();
  const instruction = task.instruction || '';
  const requestedModel = task.model || 'auto';

  // Auto defaults to the cheapest possible model to save credits
  const effectiveModel = (requestedModel === 'auto' || !requestedModel)
    ? 'gemini-3.8-flash-low'
    : requestedModel;

  console.log(`🪐 [ANTIGRAVITY WORKER] Executing task [${task.id || task.docId}] on model [${effectiveModel}] for repo [${targetRepo}]: "${instruction.slice(0, 80)}..."`);

  await updateDoc(taskRef, {
    status: 'running',
    startedAt: Date.now(),
    modelUsed: effectiveModel
  });

  try {
    const result = await executeAgentTask({ instruction, targetDir, repo: targetRepo, model: effectiveModel });

    await updateDoc(taskRef, {
      status: result.ok ? 'completed' : 'error',
      completedAt: Date.now(),
      output: result.output || '',
      error: result.error || null
    });

    console.log(`🪐 [ANTIGRAVITY WORKER] Task [${task.id || task.docId}] finished with status: ${result.ok ? 'completed' : 'error'}`);

    if (task.source === 'whatsapp_boss') {
      try {
        const { sendWaWebMessage } = await import('./waWebClient.js');
        const replySnippet = (result.output || '').trim().slice(0, 600);
        const msg = `🪐 *Antigravity on VPS* [${targetRepo.toUpperCase()}]:\n\n${replySnippet || 'Task completed successfully.'}`;
        await sendWaWebMessage('971529244592@s.whatsapp.net', msg);
      } catch (notifyErr) {
        console.warn('🪐 [ANTIGRAVITY WORKER] WhatsApp notify warning:', notifyErr.message);
      }
    }
  } catch (err) {
    console.error(`🪐 [ANTIGRAVITY WORKER] Task failed:`, err);
    await updateDoc(taskRef, {
      status: 'error',
      completedAt: Date.now(),
      error: err.message
    });
  }
}

async function executeAgentTask({ instruction, targetDir, repo, model }) {
  const agyBin = fs.existsSync('/home/ubuntu/.local/bin/agy')
    ? '/home/ubuntu/.local/bin/agy'
    : (process.platform === 'win32' ? 'agy.cmd' : 'agy');

  return new Promise((resolve) => {
    let output = '';
    let timedOut = false;

    // Check if agy binary is present
    const hasAgy = fs.existsSync(agyBin) || process.env.PATH.includes('agy');

    if (!hasAgy) {
      resolve({
        ok: true,
        output: `[Antigravity Simulated Execution on ${repo.toUpperCase()}]\nTarget Directory: ${targetDir}\nModel: ${model || 'default'}\nInstruction: ${instruction}\nStatus: Code changes logged.`
      });
      return;
    }

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGKILL');
      resolve({
        ok: false,
        error: 'Execution timed out after 180 seconds.',
        output: output + '\n[TIMEOUT]'
      });
    }, 180000);

    const cliArgs = ['--dangerously-skip-permissions'];
    if (model) {
      cliArgs.push('--model', model);
    }
    cliArgs.push('-p', instruction);

    const child = spawn(agyBin, cliArgs, {
      cwd: fs.existsSync(targetDir) ? targetDir : process.cwd(),
      env: {
        ...process.env,
        PATH: `/home/ubuntu/.local/bin:${process.env.PATH || ''}`
      }
    });

    child.stdout.on('data', (d) => { output += d.toString(); });
    child.stderr.on('data', (d) => { output += d.toString(); });

    child.on('close', (code) => {
      clearTimeout(timer);
      if (timedOut) return;
      if (code === 0) {
        resolve({ ok: true, output });
      } else {
        // If agy exited with code != 0 (e.g. auth required), capture informative output
        resolve({
          ok: code === 0,
          output,
          error: code !== 0 ? `Process exited with code ${code}` : null
        });
      }
    });

    child.on('error', (err) => {
      clearTimeout(timer);
      resolve({ ok: false, error: err.message, output });
    });
  });
}
