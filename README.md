# ☀ Uchiro — ជំនួយការ AI ផ្ទាល់ខ្លួនរបស់អ្នក

Chatbot ផ្ទាល់ខ្លួន (robot/programming assistant) ដែលមាន theme premium original, ចាំ memory អចិន្ត្រៃយ៍, ស្វែងរក internet ពិត, និងបង្កើត file ស្វ័យប្រវត្តិ។

---

## ⚠️ សំខាន់ — សូមអានមុន

1. **អំពី testing:** ខ្ញុំបានពិនិត្យ syntax កូដទាំងអស់ (`node --check`) ជាប់ជោគជ័យ ប៉ុន្តែ **environment របស់ខ្ញុំគ្មាន internet access** ដូច្នេះមិនអាច `npm install` + run ពិតបានទេ។ អ្នកជាអ្នកដំបូង test — បើ error អ្វី copy message មកឲ្យខ្ញុំកែ។

2. **អំពី Theme:** អ្នកសុំ theme ស្រដៀង "Luffy Gear 5" / One Piece — ខ្ញុំ**មិនអាចប្រើ character ឬរូបភាព copyrighted** នោះទេ (វាជា IP របស់ Eiichiro Oda/Shueisha)។ ជំនួសមកវិញ ខ្ញុំបានរចនា theme **ដើមកំណើត** ដែលមានអារម្មណ៍ថាមពល "ព្រះអាទិត្យរះ" (មាស-ក្រហម-ភ្លើង, animated glow) ដែលផ្តល់អារម្មណ៍ស្រដៀងគ្នា ដោយមិនរំលោភសិទ្ធិ។

---

## មុខងារពេញលេញ

| មុខងារ | ពន្យល់ |
|---|---|
| 🧠 **Memory អចិន្ត្រៃយ៍** | Uchiro ចាំរឿងសំខាន់ៗអំពីអ្នក (ឈ្មោះ, ចំណូលចិត្ត, គម្រោង...) ស្វ័យប្រវត្តិ — មិនចាំបាច់ប្រាប់ម្តងទៀត! មើល/លុបបានក្នុង sidebar |
| 🔍 **Web search ពិត** | ស្វែងរក internet ដោយខ្លួនឯង ពេលត្រូវការព័ត៌មានថ្មីៗ |
| 📷 **Image analysis** | ភ្ជាប់រូបភាព ឲ្យ Uchiro មើល/វិភាគ |
| 📄 **Smart file generation** | Uchiro ខ្លួនឯងសម្រេចចិត្តបង្កើត PDF/Word ពេលសមរម្យ (Tool Use — មិនមែន keyword matching) |
| 💾 **Database** | ការសន្ទនា + memory រក្សាទុកអចិន្ត្រៃយ៍ក្នុង `chat.db` (SQLite) |
| 🗂 **Catalog sidebar** | ប៊ូតុងលឿនសម្រាប់ tool សំខាន់ៗ + បញ្ជី memory + បញ្ជី file ដែលបានបង្កើត |
| 🎨 **Premium UI** | Theme ដើមកំណើត "ព្រះអាទិត្យរះ" — មាស/ក្រហម/ភ្លើង animated glow, font Anton + Manrope |

---

## ជំហានទី ១ — ដំឡើង

### ត្រូវការ
- **Node.js** (https://nodejs.org)
- **VS Code**
- API Key ពី Anthropic

### ជំហាន

1. Extract file zip → បើក folder ក្នុង VS Code
2. Terminal → `npm install` (ចាំបន្តិច ព្រោះ `better-sqlite3` ត្រូវ compile)
3. ចម្លង `.env.example` → ប្តូរឈ្មោះទៅ `.env` → ដាក់ API key
4. `npm start`
5. បើក `http://localhost:3000`

---

## របៀបសាកល្បង feature នីមួយៗ

**Memory:**
```
ឈ្មោះខ្ញុំគឺ Dara ហើយខ្ញុំកំពុងសាងសង់ store លក់ស្បែកជើង
```
→ Uchiro គួរហៅ `remember_fact` ស្វ័យប្រវត្តិ → badge "🧠 ចាំរួច" លេចឡើង → មើលក្នុង sidebar "អ្វីដែល Uchiro ចាំ"
→ សាកជជែកបន្តសួរ "តើខ្ញុំឈ្មោះអី?" — Uchiro គួរនឹកឃើញ

**Web Search:**
```
តម្លៃមាសថ្ងៃនេះប៉ុន្មាន?
```

**File Generation (ដោយមិនប្រើពាក្យ "pdf" ត្រង់ៗ):**
```
សរសេរផែនការអាជីវកម្មខ្លីមួយសម្រាប់ store ខ្ញុំ
```
→ File លេចក្នុង sidebar "File ដែលបានបង្កើត" ភ្លាមៗ

**Image:**
ចុច 📎 ក្នុង sidebar ឬ inputbar → ជ្រើសរូបភាព → សួរ

---

## រចនាសម្ព័ន្ធ Project

```
ai-chatbot-store/
├── server.js          ← Backend (Tool Use: create_document, web_search, remember_fact)
├── db.js               ← Database (messages + memory tables)
├── chat.db               ← បង្កើតស្វ័យប្រវត្តិពេល run លើកដំបូង
├── package.json
├── .env
├── public/
│   ├── index.html          ← Sidebar + Chat UI
│   ├── style.css             ← Premium "ព្រះអាទិត្យរះ" theme
│   ├── script.js               ← Frontend logic (memory panel, files panel, catalog)
│   └── downloads/                ← File ដែលបង្កើត
```

---

## ជំហានទី ២ — Deploy ទៅ Railway (24/7)

⚠️ **Database Warning:** SQLite (`chat.db`) លើ Railway free tier disk **មិនអចិន្ត្រៃយ៍ទេ** — memory/history អាចបាត់ពេល redeploy។ សម្រាប់ production ពិត ត្រូវប្តូរទៅ Railway PostgreSQL (built-in) — ប្រាប់ខ្ញុំបើចង់ឲ្យខ្ញុំធ្វើការប្តូរនេះ។

1. Push ទៅ GitHub
2. Railway → New Project → Deploy from GitHub
3. Environment Variables → `ANTHROPIC_API_KEY`
4. Deploy

---

## បញ្ហាទូទៅ

| បញ្ហា | ដំណោះស្រាយ |
|---|---|
| `npm install` អាក់ `better-sqlite3` | Windows: `npm install --global windows-build-tools`; Mac: `xcode-select --install` |
| Font មិនបង្ហាញត្រឹមត្រូវ | ត្រូវការ internet ដើម្បីទាញ Google Fonts (Anton, Manrope) — ដំណើរការធម្មតាពេល deploy ពិត |
| Memory មិនចាំ | ត្រូវប្រាកដថា `sessionId` ដដែលក្នុង browser (កុំសម្អាត localStorage) |
| Error ផ្សេងទៀត | Copy error message ពេញលេញមកឲ្យខ្ញុំ |
