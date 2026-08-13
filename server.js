// ============================================
// AI CHATBOT SERVER v2 — ដូច Claude.ai ជាងមុន
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
const PORT = process.env.PORT || 3000;

// បង្កើត Folder សម្រាប់ទាញយក File ប្រសិនបើមិនទាន់មាន
const DOWNLOADS_DIR = path.join(__dirname, 'public', 'downloads');
if (!fs.existsSync(DOWNLOADS_DIR)) fs.mkdirSync(DOWNLOADS_DIR, { recursive: true });

app.use(cors());
app.use(express.json({ limit: '15mb' }));
app.use(express.static('public'));

if (!process.env.ANTHROPIC_API_KEY) {
  console.error('❌ សូមដាក់ ANTHROPIC_API_KEY ក្នុង file .env ជាមុនសិន!');
  process.exit(1);
}

// កំណត់ Anthropic SDK (Support ទាំង Official & Custom Proxy Base URL)
const anthropicConfig = { apiKey: process.env.ANTHROPIC_API_KEY };
if (process.env.ANTHROPIC_BASE_URL) {
  anthropicConfig.baseURL = process.env.ANTHROPIC_BASE_URL;
}
const anthropic = new Anthropic(anthropicConfig);

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
    description:
      'បង្កើត file ជា PDF ឬ Word document សម្រាប់ user ទាញយក។ ប្រើ tool នេះនៅពេល user ស្នើសុំ report, document, letter, contract ឬអ្វីៗដែលគួរផ្តល់ជា file ដើម្បីរក្សាទុក/បោះពុម្ព/ចែករំលែក — មិនមែនគ្រាន់តែឆ្លើយសំណួរធម្មតា។',
    input_schema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'ចំណងជើងឯកសារ' },
        content: { type: 'string', description: 'ខ្លឹមសារពេញលេញនៃឯកសារ សរសេរឲ្យបានល្អិតល្អន់និងរៀបចំរបៀបរាយបញ្ជី' },
        format: { type: 'string', enum: ['pdf', 'docx'], description: 'ប្រភេទ file ដែល user ចង់បាន (default: pdf)' },
      },
      required: ['title', 'content'],
    },
  },
  {
    name: 'remember_fact',
    description:
      'រក្សាទុកព័ត៌មានសំខាន់អំពី user ជាអចិន្ត្រៃយ៍ សម្រាប់ចាំក្នុងការសន្ទនាលើកក្រោយ។ ប្រើនៅពេល user ប្រាប់ឈ្មោះ, ចំណូលចិត្ត, គម្រោង, ព័ត៌មានផ្ទាល់ខ្លួន ឬអ្វីៗដែលមានប្រយោជន៍ចាំក្នុងពេលអនាគត។ កុំប្រើសម្រាប់ព័ត៌មានបណ្តោះអាសន្នមិនសំខាន់។',
    input_schema: {
      type: 'object',
      properties: {
        fact: { type: 'string', description: 'ព័ត៌មានខ្លីមួយប្រយោគ ដែលគួរចាំ (ឧទាហរណ៍: "ឈ្មោះ user គឺ Sokha")' },
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

    // ១. ទាញយក history ចាស់ + memory ពី database
    const pastMessages = getHistory(sessionId).map((m) => ({
      role: m.role,
      content: m.content,
    }));

    const facts = getFacts(sessionId);
    const memoryBlock = facts.length
      ? `\n\nរឿងដែលអ្នកចាំពី user (ប្រើប្រាស់ដោយធម្មជាតិ កុំសរសេរឡើងវិញត្រង់ៗ):\n${facts.map((f) => `- ${f.fact}`).join('\n')}`
      : '';

    const systemPrompt = `អ្នកឈ្មោះ Uchiro — ជា AI assistant ផ្ទាល់ខ្លួនរបស់ user។ អត្តចរិកអ្នក: ឆ្លាត, ស្មោះត្រង់, មានថាមពល, ជួយអ្នកប្រើប្រាស់ដោយផ្ទាល់ និងកក់ក្តៅ។ ឆ្លើយជាភាសាដូចដែល user សរសេរមក (ខ្មែរ ឬ អង់គ្លេស)។${memoryBlock}`;

    // ២. រៀបចំ user message ថ្មី (Text + Image support)
    const userContent = [];
    if (image && image.base64 && image.mediaType) {
      userContent.push({
        type: 'image',
        source: { type: 'base64', media_type: image.mediaType, data: image.base64 },
      });
    }
    userContent.push({ type: 'text', text: message || 'សូមមើលរូបភាពនេះ' });

    let messages = [...pastMessages, { role: 'user', content: userContent }];

    // ៣. រក្សាទុកសាររបស់ user ចូល database
    saveMessage(sessionId, 'user', message || '[បានផ្ញើរូបភាព]');

    let downloadUrl = null;
    let finalText = '';
    let newFacts = [];

    // ៤. Agent loop (Tool handling)
    for (let turn = 0; turn < 5; turn++) {
      const response = await anthropic.messages.create({
        model: process.env.MODEL_NAME || 'claude-3-5-sonnet-20241022',
        max_tokens: 2000,
        system: systemPrompt,
        tools,
        messages,
      });

      // ប្រមូល Text
      const textBlocks = response.content.filter((b) => b.type === 'text');
      if (textBlocks.length) {
        finalText += textBlocks.map((b) => b.text).join('\n');
      }

      // ប្រសិនបើ AI មិនបានហៅ Tool អ្វីទេ នោះបញ្ចប់ Loop
      if (response.stop_reason !== 'tool_use') break;

      // បន្ថែម Assistant Response ចូល Memory
      messages.push({ role: 'assistant', content: response.content });

      // ដំណើរការ Custom Tools
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

    // ៥. រក្សាទុកសាររបស់ Assistant ចូល database
    saveMessage(sessionId, 'assistant', finalText, downloadUrl);

    res.json({ reply: finalText, downloadUrl, usedWebSearch: false, newFacts });
  } catch (error) {
    console.error('Error:', error.message);
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
