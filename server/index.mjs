import express from 'express';
import multer from 'multer';
import { mkdtempSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { callTool } from './mcp.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 8787);

const app = express();
app.use(express.json({ limit: '2mb' }));

// ── Uploads ───────────────────────────────────────────────────────────────────
const uploadDir = mkdtempSync(path.join(tmpdir(), 'model-council-ui-'));
const IMAGE_EXTS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp']);
const upload = multer({
  storage: multer.diskStorage({
    destination: uploadDir,
    filename: (_req, file, cb) => {
      const safe = file.originalname.replace(/[^\w.\- ]+/g, '_');
      cb(null, `${Date.now()}-${safe}`);
    },
  }),
  limits: { fileSize: 24 * 1024 * 1024, files: 8 },
});

app.post('/api/upload', upload.array('files'), (req, res) => {
  const out = (req.files ?? []).map((f) => ({
    path: f.path,
    name: f.originalname,
    size: f.size,
    kind: IMAGE_EXTS.has(path.extname(f.originalname).toLowerCase()) ? 'image' : 'file',
  }));
  res.json({ files: out });
});

// ── Simple tool passthroughs ──────────────────────────────────────────────────
const passthrough = (toolName, pickArgs = () => ({})) => async (req, res) => {
  try {
    const data = await callTool(toolName, pickArgs(req));
    res.json(data);
  } catch (err) {
    res.status(err.isToolError ? 400 : 502).json({ error: String(err.message || err) });
  }
};

app.get('/api/status', passthrough('council_status'));
app.get('/api/config', passthrough('get_council_config'));
app.get('/api/models', passthrough('list_models', (req) =>
  req.query.provider ? { filter_provider: String(req.query.provider) } : {}));
app.put('/api/config', passthrough('configure_council', (req) => req.body));
app.post('/api/setup', passthrough('setup_council', (req) => req.body));
app.put('/api/timeouts', passthrough('set_council_timeouts', (req) => req.body));
app.post('/api/estimate', passthrough('estimate_council_cost', (req) => req.body));
app.post('/api/ask-async', passthrough('ask_council_async', (req) => req.body));
app.get('/api/jobs', passthrough('get_council_result', () => ({ list: true })));
app.get('/api/jobs/:id', passthrough('get_council_result', (req) => ({ job_id: req.params.id })));

// ── ask_council over SSE ─────────────────────────────────────────────────────
// POST body = ask_council arguments. Streams `progress` events (from MCP
// notifications/progress), 15s heartbeats, then a single `result` or `error`.
app.post('/api/ask', async (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  const send = (event, data) => {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };
  const heartbeat = setInterval(() => res.write(': keep-alive\n\n'), 15_000);

  try {
    const result = await callTool('ask_council', req.body, (p) => {
      send('progress', { progress: p.progress, total: p.total, message: p.message ?? '' });
    });
    send('result', result);
  } catch (err) {
    send('error', { error: String(err.message || err) });
  } finally {
    clearInterval(heartbeat);
    res.end();
  }
});

// ── Static frontend (production build) ───────────────────────────────────────
const dist = path.resolve(__dirname, '..', 'web', 'dist');
if (existsSync(dist)) {
  app.use(express.static(dist));
  app.get(/^\/(?!api\/).*/, (_req, res) => res.sendFile(path.join(dist, 'index.html')));
}

app.listen(PORT, () => {
  console.log(`[model-council-ui] http://localhost:${PORT}`);
});
