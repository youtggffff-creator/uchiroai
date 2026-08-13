// ============================================
// AI CHATBOT SERVER v2 — ដូច Claude.ai ជាងមុន
// ============================================

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { OpenAI } = require('openai');
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

// Setup OpenAI SDK with Custom Base URL & Key
const openai = new OpenAI({
  apiKey: process.env.ANTHROPIC_API_KEY,
  baseURL: process.env.ANTHROPIC_BASE_URL || 'https://llm.2006.lol/api/v1',
});

// Enforce Fable5 default
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
// TOOL DEFINITIONS (OpenAI Format)
// ============================================
const tools = [
  {
    type: 'function',
    function: {
      name: 'create_document',
      description: 'បង្កើត file ជា PDF ឬ Word document សម្រាប់ user ទាញយក។',
      parameters: {
        type: 'object',
        properties: {
          title: { type: 'string', description: 'ចំណងជើងឯកសារ' },
          content: { type: 'string', description: 'ខ្លឹមសារពេញលេញនៃឯកសារ' },
          format: { type: 'string', enum: ['pdf', 'docx'], description: 'ប្រភេទ file (default: pdf)' },
        },
        required: ['title', 'content'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'remember_fact',
      description: 'រក្សាទុកព័ត៌មានសំខាន់អំពី user ជាអចិន្ត្រៃយ៍',
      parameters: {
        type: 'object',
        properties: {
          fact: { type: 'string', description: 'ព័ត៌មានខ្លីមួយប្រយោគ' },
        },
        required: ['fact'],
      },
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

    // 1. Get History & Memory
    const pastMessages = getHistory(sessionId).map((m) => ({
      role: m.role,
      content: m.content,
    }));

    const facts = getFacts(sessionId);
    const memoryBlock = facts.length
      ? `\n\nរឿងដែលអ្នកចាំពី user:\n${facts.map((f) => `- ${f.fact}`).join('\n')}`
      : '';

    const systemPrompt = {
      role: 'system',
      content: `អ្នកឈ្មោះ Uchiro — ជា AI assistant ផ្ទាល់ខ្លួនរបស់ user។ អត្តចរិកអ្នក: ឆ្លាត, ស្មោះត្រង់, មានថាមពល, ជួយអ្នកប្រើប្រាស់ដោយផ្ទាល់ និងកក់ក្តៅ។ ឆ្លើយជាភាសាដូចដែល user សរសេរមក (ខ្មែរ ឬ អង់គ្លេស)។${memoryBlock}`,
    };

    // 2. Prepare User Content
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

    let messages = [systemPrompt, ...pastMessages, { role: 'user', content: userContent }];

    saveMessage(sessionId, 'user', message || '[បានផ្ញើរូបភាព]');

    let downloadUrl = null;
    let finalText = '';
    let newFacts = [];

    // 3. Agent Loop
    for (let turn = 0; turn < 5; turn++) {
      const response = await openai.chat.completions.create({
        model: MODEL,
        messages: messages,
        tools: tools,
        tool_choice: 'auto',
      });

      const responseMessage = response.choices[0].message;

      if (responseMessage.content) {
        finalText += responseMessage.content;
      }

      // Check if tool called
      const toolCalls = responseMessage.tool_calls;
      if (!toolCalls || toolCalls.length === 0) {
        break; // Finish if no tool calls
      }

      messages.push(responseMessage);

      for (const toolCall of toolCalls) {
        const functionName = toolCall.function.name;
        const functionArgs = JSON.parse(toolCall.function.arguments);

        if (functionName === 'create_document') {
          const { title, content, format = 'pdf' } = functionArgs;
          const filename = format === 'docx' ? await createDocx(content, title) : createPDF(content, title);
          downloadUrl = `/downloads/${filename}`;

          messages.push({
            tool_call_id: toolCall.id,
            role: 'tool',
            name: functionName,
            content: `File "${filename}" ត្រូវបានបង្កើតដោយជោគជ័យ។`,
          });
        }

        if (functionName === 'remember_fact') {
          const { fact } = functionArgs;
          saveFact(sessionId, fact);
          newFacts.push(fact);

          messages.push({
            tool_call_id: toolCall.id,
            role: 'tool',
            name: functionName,
            content: `ចាំរួចរាល់៖ "${fact}"`,
          });
        }
      }
    }

    saveMessage(sessionId, 'assistant', finalText, downloadUrl);

    res.json({ reply: finalText, downloadUrl, usedWebSearch: false, newFacts });
  } catch (error) {
    console.error('❌ Error details:', error);
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
