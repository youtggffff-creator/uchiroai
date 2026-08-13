// ============================================
// DATABASE — SQLite (file-based, no server needed)
// ============================================
// រក្សាទុក chat history អចិន្ត្រៃយ៍ក្នុង file "chat.db"

const Database = require('better-sqlite3');
const path = require('path');

const db = new Database(path.join(__dirname, 'chat.db'));

db.pragma('journal_mode = WAL');

// បង្កើត table បើមិនទាន់មាន
db.exec(`
  CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT NOT NULL,
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    download_url TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

db.exec(`CREATE INDEX IF NOT EXISTS idx_session ON messages(session_id);`);

// ============================================
// MEMORY — ការពិត/ចំណូលចិត្តអំពី user ដែល Uchiro ចងចាំរវាងការសន្ទនា
// ============================================
db.exec(`
  CREATE TABLE IF NOT EXISTS memory (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT NOT NULL,
    fact TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

function saveFact(sessionId, fact) {
  db.prepare(`INSERT INTO memory (session_id, fact) VALUES (?, ?)`).run(sessionId, fact);
}

function getFacts(sessionId) {
  return db
    .prepare(`SELECT id, fact, created_at as createdAt FROM memory WHERE session_id = ? ORDER BY id DESC`)
    .all(sessionId);
}

function deleteFact(id) {
  db.prepare(`DELETE FROM memory WHERE id = ?`).run(id);
}

function saveMessage(sessionId, role, content, downloadUrl = null) {
  const stmt = db.prepare(
    `INSERT INTO messages (session_id, role, content, download_url) VALUES (?, ?, ?, ?)`
  );
  stmt.run(sessionId, role, content, downloadUrl);
}

function getHistory(sessionId, limit = 50) {
  const stmt = db.prepare(
    `SELECT role, content, download_url as downloadUrl, created_at as createdAt
     FROM messages WHERE session_id = ? ORDER BY id ASC LIMIT ?`
  );
  return stmt.all(sessionId, limit);
}

function clearHistory(sessionId) {
  const stmt = db.prepare(`DELETE FROM messages WHERE session_id = ?`);
  stmt.run(sessionId);
}

module.exports = { saveMessage, getHistory, clearHistory, saveFact, getFacts, deleteFact };
