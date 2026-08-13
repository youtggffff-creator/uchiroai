const chat = document.getElementById('chat');
const form = document.getElementById('form');
const input = document.getElementById('input');
const sendBtn = document.getElementById('sendBtn');
const status = document.getElementById('status');
const statusDot = document.getElementById('statusDot');
const clearBtn = document.getElementById('clearBtn');
const imageInput = document.getElementById('imageInput');
const imagePreview = document.getElementById('imagePreview');
const previewImg = document.getElementById('previewImg');
const removeImageBtn = document.getElementById('removeImage');
const sunMark = document.getElementById('sunMark');
const memoryList = document.getElementById('memoryList');
const memCount = document.getElementById('memCount');
const filesList = document.getElementById('filesList');
const fileCount = document.getElementById('fileCount');
const sidebar = document.getElementById('sidebar');
const menuToggle = document.getElementById('menuToggle');
const attachChip = document.getElementById('attachChip');

// ============================================
// SESSION — real website the user hosts themselves, localStorage is fine here
// ============================================
let sessionId = localStorage.getItem('uchiro_session_id');
if (!sessionId) {
  sessionId = 'session-' + Math.random().toString(36).slice(2) + Date.now();
  localStorage.setItem('uchiro_session_id', sessionId);
}

let pendingImage = null;

// ============================================
// INIT
// ============================================
fetch('/api/health')
  .then((r) => r.json())
  .then(() => {
    status.textContent = 'Uchiro ត្រៀមរួចរាល់';
    loadHistory();
    loadMemory();
    loadFiles();
  })
  .catch(() => {
    status.textContent = 'Server មិនដំណើរការ';
    statusDot.style.background = '#d8481f';
  });

async function loadHistory() {
  try {
    const res = await fetch(`/api/history/${sessionId}`);
    const data = await res.json();
    if (data.history && data.history.length) {
      chat.innerHTML = '';
      data.history.forEach((m) => addMessage(m.role, m.content, m.downloadUrl));
    }
  } catch (e) {
    console.error('Could not load history', e);
  }
}

async function loadMemory() {
  try {
    const res = await fetch(`/api/memory/${sessionId}`);
    const data = await res.json();
    renderMemory(data.facts || []);
  } catch (e) {
    console.error(e);
  }
}

function renderMemory(facts) {
  memCount.textContent = facts.length;
  if (!facts.length) {
    memoryList.innerHTML = '<div class="empty-hint">មិនទាន់មានអ្វីទេ — Uchiro នឹងចាំពេលអ្នកប្រាប់</div>';
    return;
  }
  memoryList.innerHTML = '';
  facts.forEach((f) => {
    const item = document.createElement('div');
    item.className = 'memory-item';
    item.innerHTML = `<span title="${escapeHtml(f.fact)}">${escapeHtml(f.fact)}</span><button class="fact-delete" data-id="${f.id}">✕</button>`;
    memoryList.appendChild(item);
  });
  memoryList.querySelectorAll('.fact-delete').forEach((btn) => {
    btn.addEventListener('click', async () => {
      await fetch(`/api/memory/${btn.dataset.id}`, { method: 'DELETE' });
      loadMemory();
    });
  });
}

async function loadFiles() {
  try {
    const res = await fetch('/api/files');
    const data = await res.json();
    renderFiles(data.files || []);
  } catch (e) {
    console.error(e);
  }
}

function renderFiles(files) {
  fileCount.textContent = files.length;
  if (!files.length) {
    filesList.innerHTML = '<div class="empty-hint">មិនទាន់មាន file ទេ</div>';
    return;
  }
  filesList.innerHTML = '';
  files.forEach((f) => {
    const item = document.createElement('div');
    item.className = 'file-item';
    item.innerHTML = `<a href="${f.url}" download>${escapeHtml(f.name)}</a>`;
    filesList.appendChild(item);
  });
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// ============================================
// UI HELPERS
// ============================================
function addMessage(role, text, downloadUrl = null, usedWebSearch = false, newFacts = []) {
  const msg = document.createElement('div');
  msg.className = `msg ${role === 'user' ? 'user' : 'bot'}`;

  if (role !== 'user') {
    const avatar = document.createElement('div');
    avatar.className = 'avatar';
    avatar.textContent = '☀';
    msg.appendChild(avatar);
  }

  const bubble = document.createElement('div');
  bubble.className = 'bubble';

  if (usedWebSearch) {
    const badge = document.createElement('div');
    badge.className = 'search-badge';
    badge.textContent = '🔍 បានស្វែងរកលើ Internet';
    bubble.appendChild(badge);
  }

  const textNode = document.createElement('div');
  textNode.textContent = text;
  bubble.appendChild(textNode);

  if (downloadUrl) {
    const link = document.createElement('a');
    link.href = downloadUrl;
    link.className = 'download-link';
    link.textContent = '⬇ ទាញយក File';
    bubble.appendChild(link);
  }

  if (newFacts && newFacts.length) {
    newFacts.forEach((f) => {
      const badge = document.createElement('div');
      badge.className = 'fact-badge';
      badge.textContent = `🧠 ចាំរួច៖ ${f}`;
      bubble.appendChild(badge);
    });
  }

  msg.appendChild(bubble);
  chat.appendChild(msg);
  chat.scrollTop = chat.scrollHeight;
}

function addTyping() {
  const msg = document.createElement('div');
  msg.className = 'msg bot';
  msg.id = 'typing-indicator';
  msg.innerHTML = '<div class="avatar">☀</div><div class="bubble typing">Uchiro កំពុងគិត...</div>';
  chat.appendChild(msg);
  chat.scrollTop = chat.scrollHeight;
  sunMark.classList.add('thinking');
}

function removeTyping() {
  document.getElementById('typing-indicator')?.remove();
  sunMark.classList.remove('thinking');
}

// ============================================
// CATALOG QUICK ACTIONS
// ============================================
document.querySelectorAll('.tool-chip[data-prompt]').forEach((chip) => {
  chip.addEventListener('click', () => {
    input.value = chip.dataset.prompt;
    input.focus();
    input.dispatchEvent(new Event('input'));
    if (window.innerWidth <= 820) sidebar.classList.remove('open');
  });
});

attachChip.addEventListener('click', () => {
  imageInput.click();
  if (window.innerWidth <= 820) sidebar.classList.remove('open');
});

menuToggle.addEventListener('click', () => sidebar.classList.toggle('open'));

// ============================================
// IMAGE UPLOAD
// ============================================
imageInput.addEventListener('change', () => {
  const file = imageInput.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    const base64 = reader.result.split(',')[1];
    pendingImage = { base64, mediaType: file.type };
    previewImg.src = reader.result;
    imagePreview.style.display = 'flex';
  };
  reader.readAsDataURL(file);
});

removeImageBtn.addEventListener('click', () => {
  pendingImage = null;
  imageInput.value = '';
  imagePreview.style.display = 'none';
});

// ============================================
// SEND MESSAGE
// ============================================
form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const text = input.value.trim();
  if (!text && !pendingImage) return;

  addMessage('user', text || '[រូបភាព]');
  const imageToSend = pendingImage;
  input.value = '';
  input.style.height = 'auto';
  pendingImage = null;
  imageInput.value = '';
  imagePreview.style.display = 'none';
  sendBtn.disabled = true;
  addTyping();

  try {
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: text, sessionId, image: imageToSend }),
    });

    const data = await res.json();
    removeTyping();

    if (data.error) {
      addMessage('bot', `❌ ${data.error}`);
    } else {
      addMessage('bot', data.reply, data.downloadUrl, data.usedWebSearch, data.newFacts);
      if (data.newFacts && data.newFacts.length) loadMemory();
      if (data.downloadUrl) loadFiles();
    }
  } catch (err) {
    removeTyping();
    addMessage('bot', '❌ មិនអាចភ្ជាប់ទៅ server បានទេ។');
  } finally {
    sendBtn.disabled = false;
  }
});

// ============================================
// CLEAR HISTORY
// ============================================
clearBtn.addEventListener('click', async () => {
  if (!confirm('សម្អាតការសន្ទនាទាំងអស់?')) return;
  await fetch(`/api/history/${sessionId}`, { method: 'DELETE' });
  chat.innerHTML = '';
  addMessage('bot', 'ការសន្ទនាត្រូវបានសម្អាតរួចរាល់។ ចាប់ផ្តើមថ្មី!');
});

// ============================================
// TEXTAREA UX
// ============================================
input.addEventListener('input', () => {
  input.style.height = 'auto';
  input.style.height = input.scrollHeight + 'px';
});

input.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    form.requestSubmit();
  }
});
