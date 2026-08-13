// ============================================
// AI CHATBOT SERVER v2 — FULL FIX (LLM Gateway)
// ============================================

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const Anthropic = require('@anthropic-ai/sdk');
const PDFDocument = require('pdfkit');
const { Document, Packer, Paragraph, TextRun } = require('docx');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { saveMessage, getHistory, clearHistory, saveFact, getFacts, deleteFact } = require('./db');

const app = express();
const PORT = process.env.PORT || 8080;

// Ensure Downloads folder exists
const DOWNLOADS_DIR = path.join(__dirname, 'public', 'downloads');
if (!fs.existsSync(DOWNLOADS_DIR)) fs.mkdirSync(DOWNLOADS_DIR, { recursive: true });

app.use(cors());
app.use(express.json({ limit: '15mb' }));
app.use(express.static('public'));

const apiKey = process.env.ANTHROPIC_API_KEY || process.env.OPENAI_API_KEY;
if (!apiKey) {
  console.error('❌ Missing API key in .env file!');
  process.exit(1);
}

// Initialize Anthropic SDK pointing to llm.2006.lol
const anthropic = new Anthropic({
  apiKey: apiKey,
  baseURL: process.env.ANTHROPIC_BASE_URL || 'https://llm.2006.lol/api/v1',
});

// Enforce model Fable5
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
// TOOL DEFINITIONS
// ============================================
const tools = [
  {
    name: 'create_document',
    description: 'បង្កើត file ជា PDF ឬ Word document សម្រាប់ user ទាញយក។',
    input_schema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'ចំណងជើងឯកសារ' },
        content: { type: 'string', description: 'ខ្លឹមសារពេញលេញនៃឯកសារ' },
        format: { type: 'string', enum: ['pdf', 'docx'], description: 'ប្រភេទ file (default: pdf)' },
      },
      required: ['title', 'content'],
    },
  },
  {
    name: 'remember_fact',
    description: 'រក្សាទុកព័ត៌មានសំខាន់អំពី user ជាអចិន្ត្រៃយ៍',
    input_schema: {
      type: 'object',
      properties: {
        fact: { type: 'string', description: 'ព័ត៌មានខ្លីមួយប្រយោគ' },
      },
      required: ['fact'],
    },
  },
];

// ============================================
// MAIN CHAT ENDPOINT
// ============================================
app.post('/api/chat', async (req, res) => {
  try {
    const { message, sessionId, image } = req.body;
    if (!message && !image) return res.status(400).json({ error: 'សូមផ្ញើសារ' });
    if (!sessionId) return res.status(400).json({ error: 'sessionId ត្រូវការ' });

    // 1. Retrieve history & memory
    const pastMessages = getHistory(sessionId).map((m) => ({
      role: m.role,
      content: m.content,
    }));

    const facts = getFacts(sessionId);
    const memoryBlock = facts.length
      ? `\n\nរឿងដែលអ្នកចាំពី user:\n${facts.map((f) => `- ${f.fact}`).join('\n')}`
      : '';

    const systemPrompt = `អ្នកឈ្មោះ Uchiro — ជា AI assistant ផ្ទាល់ខ្លួនរបស់ user។ ឆ្លើយជាភាសាដូចដែល user សរសេរមក (ខ្មែរ ឬ អង់គ្លេស)។${memoryBlock}`;

    // 2. Build user content block
    const userContent = [];
    if (image && image.base64 && image.mediaType) {
      userContent.push({
        type: 'image',
        source: { type: 'base64', media_type: image.mediaType, data: image.base64 },
      });
    }
    userContent.push({ type: 'text', text: message || 'សូមមើលរូបភាពនេះ' });

    let messages = [...pastMessages, { role: 'user', content: userContent }];

    saveMessage(sessionId, 'user', message || '[បានផ្ញើរូបភាព]');

    let downloadUrl = null;
    let finalText = '';
    let newFacts = [];

    // 3. Agent loop
    for (let turn = 0; turn < 5; turn++) {
      const response = await anthropic.messages.create({
        model: MODEL,
        max_tokens: 2000,
        system: systemPrompt,
        tools: tools,
        messages: messages,
      });

      const textBlocks = response.content.filter((b) => b.type === 'text');
      if (textBlocks.length) {
        finalText += textBlocks.map((b) => b.text).join('\n');
      }

      if (response.stop_reason !== 'tool_use') break;

      messages.push({ role: 'assistant', content: response.content });

      const toolResults = [];
      for (const block of response.content) {
        if (block.type !== 'tool_use') continue;

        if (block.name === 'create_document') {
          const { title, content, format = 'pdf' } = block.input;
          const filename = format === 'docx' ? await createDocx(content, title) : createPDF(content, title);
          downloadUrl = `/downloads/${filename}`;
          toolResults.push({
            type: 'tool_result',
            tool_use_id: block.id,
            content: `File "${filename}" ត្រូវបានបង្កើតដោយជោគជ័យ។`,
          });
        }

        if (block.name === 'remember_fact') {
          const { fact } = block.input;
          saveFact(sessionId, fact);
          newFacts.push(fact);
          toolResults.push({
            type: 'tool_result',
            tool_use_id: block.id,
            content: `ចាំរួចរាល់៖ "${fact}"`,
          });
        }
      }

      if (toolResults.length === 0) break;
      messages.push({ role: 'user', content: toolResults });
    }

    // 4. Save response to DB
    saveMessage(sessionId, 'assistant', finalText, downloadUrl);

    res.json({ reply: finalText, downloadUrl, usedWebSearch: false, newFacts });
  } catch (error) {
    console.error('❌ Detailed Error Log:', {
      status: error.status,
      message: error.message,
      errorDetails: error.error,
    });

    res.status(500).json({
      error: 'មានបញ្ហា! សូមពិនិត្យ API key ឬ credit របស់អ្នក។',
      detail: error.message,
    });
  }
});

// ============================================
// HISTORY ENDPOINTS
// ============================================
app.get('/api/history/:sessionId', (req, res) => {
  res.json({ history: getHistory(req.params.sessionId) });
});

app.delete('/api/history/:sessionId', (req, res) => {
  clearHistory(req.params.sessionId);
  res.json({ ok: true });
});

// ============================================
// MEMORY ENDPOINTS
// ============================================
app.get('/api/memory/:sessionId', (req, res) => {
  res.json({ facts: getFacts(req.params.sessionId) });
});

app.delete('/api/memory/:factId', (req, res) => {
  deleteFact(req.params.factId);
  res.json({ ok: true });
});

// ============================================
// FILES CATALOG
// ============================================
app.get('/api/files', (req, res) => {
  try {
    const files = fs
      .readdirSync(DOWNLOADS_DIR)
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

app.listen(PORT, () => {
  console.log(`✅ Server ដំណើរការនៅ http://localhost:${PORT}`);
});
