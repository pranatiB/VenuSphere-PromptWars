/**
 * assistant.js
 * Gemini-powered AI chat assistant with contextual quick-prompt chips.
 */

import { sendChatMessage } from '../services/api-client.js';
import { announce } from '../utils/a11y.js';
import { t } from '../utils/i18n.js';

let _sessionId = null;
let _messagesEl = null;
let _inputEl = null;
let _mounted = false;

const QUICK_PROMPTS = [
  'Where should I eat with no line?',
  'Nearest restroom with short wait?',
  'How do I get to Gate 4?',
  'What\'s happening next?',
  'Best time to grab food?',
  'Which exit is least crowded?',
];

const DEMO_RESPONSES = {
  'eat':      'Based on current queue data, **Chaat Corner (Stall 2)** in Food Court A has only a 5-minute wait. If you prefer grilled food, **Kebabs & Rolls (Stall 4)** in Food Court B is also quick at 10 minutes. Head there now before the halftime rush!',
  'restroom': '**Restroom West** currently has the shortest wait at 3 minutes vs 15 minutes at the North restrooms. It\'s accessible from the main concourse — turn left at the food court.',
  'exit':     '**Gate West** is currently 35% less crowded than Gate North. For the fastest exit, head through the main concourse and follow signs to Gate West.',
  'next':     'The **First Half** is currently underway. **Halftime** begins in approximately 12 minutes — expect queues at food courts to surge by 3–5x. I\'d recommend heading to Food Court B now.',
  'default':  'I\'m your VenuSphere AI assistant! I can help you find food, locate restrooms, navigate the venue, and plan your event experience. What would you like to know?',
};

/**
 * Mount the assistant chat view.
 * @param {string} rootId
 */
export function mount(rootId) {
  if (_mounted) return;
  _mounted = true;
  _sessionId = localStorage.getItem('vf_session') || _generateSessionId();
  localStorage.setItem('vf_session', _sessionId);

  const root = document.getElementById(rootId);
  if (!root) return;

  root.innerHTML = `
    <div class="chat-container">
      <div class="section-header mb-3" style="flex-shrink:0">
        <h1 class="section-title">AI Assistant</h1>
        <div style="display:flex;align-items:center;gap:0.5rem">
          <span style="width:8px;height:8px;border-radius:50%;background:var(--clr-success);display:inline-block"></span>
          <span style="font-size:0.75rem;color:var(--clr-text-muted)">Gemini 1.5 Flash</span>
        </div>
      </div>

      <div id="chat-messages" class="chat-messages" role="log" aria-live="polite" aria-label="Chat messages" tabindex="0">
        ${_welcomeMessage()}
      </div>

      <div class="chat-input-area" style="flex-shrink:0">
        <div class="chat-chips" role="list" aria-label="Quick prompts">
          ${QUICK_PROMPTS.map((p) => `
            <button class="chip" role="listitem" aria-label="Quick prompt: ${p}">${p}</button>`).join('')}
        </div>
        <div class="chat-input-row">
          <textarea
            id="chat-input"
            class="chat-input"
            placeholder="Ask anything about the venue…"
            aria-label="Message to AI assistant"
            rows="1"
            maxlength="500"
          ></textarea>
          <button id="chat-send" class="chat-send-btn" aria-label="Send message">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
              <line x1="22" y1="2" x2="11" y2="13"/><polygon points="22,2 15,22 11,13 2,9"/>
            </svg>
          </button>
        </div>
        <div style="font-size:0.65rem;color:var(--clr-text-faint);text-align:right;margin-top:0.25rem">
          Powered by Vertex AI Gemini
        </div>
      </div>
    </div>`;

  _messagesEl = document.getElementById('chat-messages');
  _inputEl = document.getElementById('chat-input');

  _bindEvents();
  _checkForDeepLinkPrompt();
}

/** Re-check for deep-link prompt on each navigation. */
export function refresh() {
  _checkForDeepLinkPrompt();
}

function _bindEvents() {
  document.getElementById('chat-send')?.addEventListener('click', _handleSend);

  _inputEl?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); _handleSend(); }
  });

  _inputEl?.addEventListener('input', () => {
    _inputEl.style.height = 'auto';
    _inputEl.style.height = `${Math.min(_inputEl.scrollHeight, 120)}px`;
  });

  document.querySelectorAll('.chat-chips .chip').forEach((chip) => {
    chip.addEventListener('click', () => _sendMessage(chip.textContent));
  });
}

function _checkForDeepLinkPrompt() {
  window.addEventListener('vf:navigate', (e) => {
    if (e.detail?.view === 'assistant' && e.detail?.prompt) {
      setTimeout(() => _sendMessage(e.detail.prompt), 100);
    }
  }, { once: true });
}

async function _handleSend() {
  const text = _inputEl?.value.trim();
  if (!text) return;
  _inputEl.value = '';
  _inputEl.style.height = 'auto';
  await _sendMessage(text);
}

async function _sendMessage(text) {
  _appendMessage('user', text);
  _showTyping();

  try {
    const response = await sendChatMessage(text, _sessionId);
    _hideTyping();
    _appendMessage('ai', response.text, response.action_type, response.action_payload);
    announce(`Assistant replied: ${response.text.substring(0, 80)}`);
  } catch {
    _hideTyping();
    const fallback = _demoResponse(text);
    _appendMessage('ai', fallback);
    announce(`Assistant: ${fallback.substring(0, 80)}`);
  }
}

function _appendMessage(role, text, actionType = null, actionPayload = null) {
  if (!_messagesEl) return;
  const div = document.createElement('div');
  div.className = `chat-bubble chat-bubble--${role}`;
  div.setAttribute('role', 'article');
  div.setAttribute('aria-label', `${role === 'user' ? 'You' : 'Assistant'}: ${text.substring(0, 60)}`);

  const formatted = _formatText(text);
  div.innerHTML = formatted;

  if (actionType && actionPayload) {
    div.appendChild(_buildActionCard(actionType, actionPayload));
  }

  _messagesEl.appendChild(div);
  _messagesEl.scrollTop = _messagesEl.scrollHeight;
}

function _showTyping() {
  const div = document.createElement('div');
  div.id = 'typing-indicator';
  div.className = 'chat-typing';
  div.setAttribute('aria-label', 'Assistant is typing');
  div.innerHTML = '<span class="typing-dot"></span><span class="typing-dot"></span><span class="typing-dot"></span>';
  _messagesEl?.appendChild(div);
  _messagesEl.scrollTop = _messagesEl.scrollHeight;
}

function _hideTyping() {
  document.getElementById('typing-indicator')?.remove();
}

function _buildActionCard(type, payload) {
  const card = document.createElement('div');
  card.className = 'action-card';
  if (type === 'navigate') {
    card.innerHTML = `<div class="action-card-title">🗺 Navigation</div>
      <div>From: ${_esc(payload.from_zone || '—')} → To: ${_esc(payload.to_zone || '—')}</div>
      <div style="margin-top:0.25rem;color:var(--clr-text-muted)">Est. walk: ~5 min</div>`;
  } else if (type === 'queue') {
    card.innerHTML = `<div class="action-card-title">⏱ Queue Info</div>
      <div>Wait: <strong>${_esc(String(payload.wait_minutes || '—'))} min</strong></div>`;
  }
  return card;
}

function _welcomeMessage() {
  return `<div class="chat-bubble chat-bubble--ai" role="article" aria-label="Welcome message from assistant">
    👋 <strong>Welcome to VenuSphere!</strong><br><br>
    I'm your AI assistant for <em>Championship Final 2026</em> at Eden Gardens. I know the live crowd levels, queue times, and event schedule.<br><br>
    Ask me anything — try a quick prompt below or type your question.
  </div>`;
}

function _formatText(text) {
  return text
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    .replace(/\n/g, '<br>');
}

function _demoResponse(text) {
  const lower = text.toLowerCase();
  if (lower.includes('eat') || lower.includes('food') || lower.includes('hungry')) return DEMO_RESPONSES.eat;
  if (lower.includes('restroom') || lower.includes('toilet') || lower.includes('bathroom')) return DEMO_RESPONSES.restroom;
  if (lower.includes('exit') || lower.includes('gate') || lower.includes('leave')) return DEMO_RESPONSES.exit;
  if (lower.includes('next') || lower.includes('halftime') || lower.includes('schedule')) return DEMO_RESPONSES.next;
  return DEMO_RESPONSES.default;
}

function _generateSessionId() {
  return `sess_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

function _esc(str) {
  const div = document.createElement('div');
  div.textContent = str || '';
  return div.innerHTML;
}
