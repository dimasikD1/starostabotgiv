import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import fs from 'fs';
import JSZip from 'jszip';

const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT) : 3000;
const BOT_DIR = path.resolve(process.cwd(), 'bot-amvera');

app.use(express.json({ limit: '10mb' }));

// Helper to bundle bot-amvera into a zip buffer
async function createBotZip(): Promise<Buffer> {
  const zip = new JSZip();

  function scan(currentDir: string, zipFolder: JSZip) {
    const items = fs.readdirSync(currentDir);
    for (const item of items) {
      const fullPath = path.join(currentDir, item);
      const stat = fs.statSync(fullPath);
      if (stat.isDirectory()) {
        const sub = zipFolder.folder(item);
        if (sub) scan(fullPath, sub);
      } else {
        const data = fs.readFileSync(fullPath);
        zipFolder.file(item, data);
      }
    }
  }

  scan(BOT_DIR, zip);
  return await zip.generateAsync({
    type: 'nodebuffer',
    compression: 'DEFLATE',
    compressionOptions: { level: 9 },
  });
}

// Download ready zip
app.get('/api/download-zip', async (req, res) => {
  try {
    const buffer = await createBotZip();
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', 'attachment; filename="starost-bot-amvera.zip"');
    res.setHeader('Content-Length', buffer.length.toString());
    res.send(buffer);
  } catch (err: any) {
    console.error('[api/download-zip]', err);
    res.status(500).json({ error: err.message });
  }
});

// List all files in bot-amvera
app.get('/api/bot-files', (req, res) => {
  try {
    const filesList: Array<{
      path: string;
      name: string;
      content: string;
      size: number;
      category: string;
    }> = [];

    function scanDir(dir: string, prefix = '') {
      if (!fs.existsSync(dir)) return;
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          scanDir(full, rel);
        } else {
          let content = '';
          try {
            content = fs.readFileSync(full, 'utf8');
          } catch {
            content = '[Binary or Unreadable]';
          }
          const stat = fs.statSync(full);
          let category = 'code';
          if (entry.name === 'amvera.yml') category = 'amvera';
          else if (entry.name.endsWith('.md')) category = 'docs';
          else if (entry.name.includes('.env') || entry.name === '.gitignore') category = 'config';
          else if (entry.name.endsWith('.json')) category = 'data';

          filesList.push({
            path: rel,
            name: entry.name,
            content,
            size: stat.size,
            category,
          });
        }
      }
    }

    scanDir(BOT_DIR);
    res.json({ ok: true, files: filesList });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Update a file in bot-amvera
app.post('/api/save-file', async (req, res) => {
  try {
    const { filePath, content } = req.body;
    if (!filePath || typeof content !== 'string') {
      return res.status(400).json({ ok: false, error: 'Invalid parameters' });
    }

    // Prevent directory traversal
    const safePath = path.normalize(filePath).replace(/^(\.\.(\/|\\|$))+/, '');
    const target = path.join(BOT_DIR, safePath);

    if (!target.startsWith(BOT_DIR)) {
      return res.status(403).json({ ok: false, error: 'Access denied' });
    }

    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, content, 'utf8');

    // Also update public/starost-bot-amvera.zip
    const buffer = await createBotZip();
    fs.mkdirSync(path.resolve(process.cwd(), 'public'), { recursive: true });
    fs.writeFileSync(path.resolve(process.cwd(), 'public', 'starost-bot-amvera.zip'), buffer);

    res.json({ ok: true, message: 'Файл успешно сохранен' });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Get db.json
app.get('/api/bot-db', (req, res) => {
  try {
    const dbPath = path.join(BOT_DIR, 'data', 'db.json');
    if (!fs.existsSync(dbPath)) {
      return res.status(404).json({ ok: false, error: 'База данных не найдена' });
    }
    const data = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
    res.json({ ok: true, data });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Update db.json
app.post('/api/bot-db', async (req, res) => {
  try {
    const { data } = req.body;
    if (!data || typeof data !== 'object') {
      return res.status(400).json({ ok: false, error: 'Некорректные данные' });
    }
    const dbPath = path.join(BOT_DIR, 'data', 'db.json');
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
    fs.writeFileSync(dbPath, JSON.stringify(data, null, 2), 'utf8');

    // Also update public/starost-bot-amvera.zip
    const buffer = await createBotZip();
    fs.writeFileSync(path.resolve(process.cwd(), 'public', 'starost-bot-amvera.zip'), buffer);

    res.json({ ok: true, message: 'База данных обновлена' });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Verify Telegram Token via official API
app.post('/api/verify-token', async (req, res) => {
  const { token } = req.body;
  if (!token || typeof token !== 'string') {
    return res.status(400).json({ ok: false, error: 'Токен не указан' });
  }
  const cleanToken = token.trim();
  if (!cleanToken.includes(':')) {
    return res.status(400).json({ ok: false, error: 'Неверный формат токена. Ожидается: 123456789:AAE...' });
  }

  try {
    const tgRes = await fetch(`https://api.telegram.org/bot${cleanToken}/getMe`);
    const data = (await tgRes.json()) as { ok: boolean; description?: string; result?: any };
    if (!data.ok) {
      return res.status(400).json({
        ok: false,
        error: data.description || 'Неверный токен Telegram (401 Unauthorized)',
      });
    }
    return res.json({ ok: true, bot: data.result });
  } catch (err: any) {
    return res.status(500).json({
      ok: false,
      error: `Ошибка подключения к Telegram API: ${err.message}`,
    });
  }
});

// Mount Vite middleware in dev or serve dist in production
async function startServer() {
  const isProd = process.env.NODE_ENV === 'production';

  if (!isProd) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Starosta 24 Deploy Hub запущен на http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Fatal error starting server:', err);
});
