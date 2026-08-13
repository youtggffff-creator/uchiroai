// ============================================
// AI CHATBOT SERVER v2 — LLM GATEWAY (FULL FIX)
// ============================================

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const PDFDocument = require('pdfkit');
const { Document, Packer, Paragraph, TextRun } = require('docx');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { saveMessage, getHistory, clearHistory, saveFact, getFacts, deleteFact } = require('./db');

const app = express();
const PORT = process.env.PORT || 8080;

const DOWNLOADS_DIR = path.join(__dirname, 'public', 'downloads');
if (!fs.existsSync(DOWNLOADS_DIR)) fs.mkdirSync(DOWNLOADS_DIR, { recursive: true });

app.use(cors());
app.use(express.json({ limit: '15mb' }));
app.use(express.static('public'));

const API_KEY = process.env.ANTHROPIC_API_KEY || process.env.OPENAI_API_KEY;
if (!API_KEY) {
  console.error('❌ សូមដាក់ API KEY ក្នុង file .env ជាមុនសិន!');
  process.exit(1);
}

const MODEL = process.env.MODEL_NAME || 'Fable5';

// ============================================
// FILE GENERATION HELPERS
// ============================================
function slugify(text) {
  return (text || 'document').toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40) || 'document';
}

function createPDF(content, title) {
  const filename = `${slugify(title)}-${crypto.randomBytes(4).toString('hex')}.pdf`;
  const filepath = path.join(DOWNLOADS_DIR, filename);
  const doc = new PDFDocument({ margin: 50 });
  doc.pipe(fs.createWriteStream(filepath));
  doc.fontSize(18).text(title, { underline: true });
  doc.moveDown();
  doc.fontSize(12).text(content, { align: 'left' });
  doc.end();
  return filename;
}

async function createDocx(content, title) {
  const filename = `${slugify(title)}-${crypto.randomBytes(4).toString('hex')}.docx`;
  const filepath = path.join(DOWNLOADS_DIR, filename);
  const paragraphs = content.split('\n').map((line) => new Paragraph({ children: [new TextRun(line)] }));
  const doc = new Document({
    sections: [{
      children: [
        new Paragraph({ children: [new TextRun({ text: title, bold: true, size: 32 })] }),
        new Paragraph({ children: [new TextRun('')] }),
        ...paragraphs,
      ],
    }],
  });
  const buffer = await Packer.toBuffer(doc);
  fs.writeFileSync(filepath, buffer);
  return filename;
}

// ============================================
// MAIN CHAT ENDPOINT (OpenAI-compatible Direct Request)
// ============================================
app.post('/api/chat', async (req, res) => {
  try {
    const { message, sessionId, image } = req.body;
    if (!message && !image) return res.status(400).json({ error: 'សូមផ្ញើសារ' });
    if (!sessionId) return res.status(400).json({ error: 'sessionId ត្រូវការ' });

    // ១. រៀបចំ History
    const pastMessages = getHistory(sessionId).map((m) => ({
      role: m.role,
      content: m.content,
    }));

    const facts = getFacts(sessionId);
    const memoryBlock = facts.length
      ? `\n\nរឿងដែលអ្នកចាំពី user:\n${facts.map((f) => `- ${f.fact}`).join('\n')}`
      : '';

    const systemMessage = {
      role: 'system',
      content: `អ្នកឈ្មោះ Uchiro — ជា AI assistant ផ្ទាល់ខ្លួនរបស់ user។ ឆ្លើយជាភាសាដូចដែល user សរសេរមក (ខ្មែរ ឬ អង់គ្លេស)។${memoryBlock}`,
    };

    // ២. រៀបចំ User Content (Text + Image support)
    let userContent = message || 'សូមមើលរូបភាពនេះ';
    if (image && image.base64 && image.mediaType) {
      userContent = [
        { type: 'text', text: message || 'សូមមើលរូបភាពនេះ' },
        {
          type: 'image_url',
          image_url: { url: `data:${image.mediaType};base64,${image.base64}` },
        },
      ];
    }

    const messages = [systemMessage, ...pastMessages, { role: 'user', content: userContent }];

    saveMessage(sessionId, 'user', message || '[បានផ្ញើរូបភាព]');

    // ៣. ផ្ញើ Request ដោយផ្ទាល់ទៅកាន់ llm.2006.lol chat completions endpoint
    const response = await fetch('https://llm.2006.lol/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${API_KEY}`,
        'Content-Type': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
      },
      body: JSON.stringify({
        model: MODEL,
        messages: messages,
        max_tokens: 2000,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error(`❌ Gateway Error (${response.status}):`, errText);
      throw new Error(`Gateway Returned Status ${response.status}: ${errText}`);
    }

    const data = await response.json();
    const finalText = data.choices[0].message.content;

    // ៤. រក្សាទុក និងឆ្លើយតប
    saveMessage(sessionId, 'assistant', finalText);

    res.json({ reply: finalText });
  } catch (error) {
    console.error('❌ Detailed Error Log:', error.message);

    res.status(500).json({
      error: 'មានបញ្ហា! សូមពិនិត្យ API key ឬ credit របស់អ្នក។',
      detail: error.message,
    });
  }
});

// ============================================
// HISTORY & MEMORY ENDPOINTS
// ============================================
app.get('/api/history/:sessionId', (req, res) => res.json({ history: getHistory(req.params.sessionId) }));
app.delete('/api/history/:sessionId', (req, res) => { clearHistory(req.params.sessionId); res.json({ ok: true }); });
app.get('/api/memory/:sessionId', (req, res) => res.json({ facts: getFacts(req.params.sessionId) }));
app.delete('/api/memory/:factId', (req, res) => { deleteFact(req.params.factId); res.json({ ok: true }); });

// ============================================
// FILES CATALOG
// ============================================
app.get('/api/files', (req, res) => {
  try {
    const files = fs.readdirSync(DOWNLOADS_DIR)
      .filter((f) => f !== '.gitkeep')
      .map((f) => {
        const stat = fs.statSync(path.join(DOWNLOADS_DIR, f));
        return { name: f, url: `/downloads/${f}`, size: stat.size, createdAt: stat.birthtime };
      })
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    res.json({ files });
  } catch (err) {
    res.json({ files: [] });
  }
});

app.get('/api/health', (req, res) => res.json({ status: 'ok' }));

app.listen(PORT, () => console.log(`✅ Server ដំណើរការនៅ http://localhost:${PORT}`));
