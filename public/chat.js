import './memory-run.js';

const select = document.querySelector('select');
const status = document.querySelector('#status');
const messages = document.querySelector('#messages');
const welcome = document.querySelector('#welcome');
const themeButton = document.querySelector('#theme');
const terminal = welcome.querySelector('.art img');
const gamePlayer = document.querySelector('#game-player');
const suggestions = [...welcome.querySelectorAll('[data-prompt]')];
const form = document.querySelector('form');
const input = form.querySelector('textarea');
const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
let chat;
try { chat = sessionStorage.getItem('recallio-chat'); } catch { /* Storage can be disabled by browser policy. */ }
chat ||= crypto.randomUUID();
let pending = false;
let refreshTimer;

function setVioletTheme(enabled) {
  document.documentElement.dataset.theme = enabled ? 'violet' : 'arcade';
  themeButton.setAttribute('aria-pressed', String(enabled));
  terminal.src = enabled ? '/terminal-violet.png' : '/terminal.png';
  gamePlayer.src = terminal.src;
}

try {
  setVioletTheme(localStorage.getItem('recallio-theme') === 'violet');
} catch {
  setVioletTheme(false);
}

themeButton.addEventListener('click', () => {
  const enabled = themeButton.getAttribute('aria-pressed') !== 'true';
  setVioletTheme(enabled);
  try {
    localStorage.setItem('recallio-theme', enabled ? 'violet' : 'arcade');
  } catch {
    // The toggle still works when storage is unavailable.
  }
});

function showTurn(turn) {
  const article = document.createElement('article');
  const question = document.createElement('p');
  question.className = 'question';
  question.textContent = turn.question;
  article.append(question);
  if (turn.result) {
    const answer = document.createElement('p');
    answer.textContent = turn.result.answer;
    article.append(answer);
    if (turn.result.checklist?.length) {
      const labels = { confirmed_change: 'Confirmed change', no_change_found: 'No change found in checked sources',
        unable_to_verify: 'Unable to verify' };
      const list = document.createElement('ul');
      for (const check of turn.result.checklist) {
        const item = document.createElement('li');
        const citation = check.citation ? ' [' + check.citation + ']' : '';
        item.textContent = check.vendor + ' · ' + (check.kind === 'pricing' ? 'Pricing' : 'Releases') +
          ' · ' + labels[check.status] + citation;
        list.append(item);
      }
      article.append(list);
    }
    if (turn.result.sources.length) {
      const list = document.createElement('ul');
      for (const source of turn.result.sources) {
        const item = document.createElement('li');
        const link = document.createElement('a');
        link.href = source.url;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        link.textContent = '[' + source.id + '] ' + source.title;
        item.append(link);
        list.append(item);
      }
      article.append(list);
    }
  } else if (turn.state === 'interrupted') {
    const retry = document.createElement('button');
    retry.textContent = 'Retry';
    retry.addEventListener('click', () => sendTurn(turn));
    article.append(retry);
  } else {
    article.append(document.createTextNode('Waiting for an answer…'));
  }
  messages.append(article);
}

async function refresh() {
  const response = await fetch('/api/history?chat=' + encodeURIComponent(chat));
  if (!response.ok) throw new Error('Could not load the conversation.');
  const data = await response.json();
  try { sessionStorage.setItem('recallio-chat', chat); } catch { /* Keep the current chat in memory. */ }
  select.replaceChildren(...data.chats.map(item => new Option(item.title.slice(0, 65), item.id)));
  if (!data.chats.some(item => item.id === chat)) {
    select.add(new Option(data.chats.length ? 'New conversation' : 'Conversation', chat));
  }
  select.value = chat;
  messages.replaceChildren();
  data.turns.forEach(showTurn);
  welcome.hidden = data.turns.length > 0;
  messages.hidden = !welcome.hidden;
  if (!data.configured && !status.textContent) status.textContent = 'Add your model and search settings in .env for live research.';
  clearTimeout(refreshTimer);
  if (data.turns.some(turn => turn.state === 'running')) {
    refreshTimer = setTimeout(() => refresh().catch(error => { status.textContent = error.message; }), 1500);
  }
}

async function sendTurn(turn) {
  if (pending) return;
  pending = true;
  form.querySelector('button').disabled = true;
  select.disabled = true;
  document.querySelector('#new').disabled = true;
  suggestions.forEach(button => { button.disabled = true; });
  status.textContent = 'Sending…';
  try {
    const response = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat, id: turn.id, question: turn.question, zone: turn.zone }),
    });
    if (!response.ok) throw new Error((await response.json()).error);
    if (response.headers.get('content-type').startsWith('application/x-ndjson')) {
      let buffer = '';
      let completed = false;
      for await (const chunk of response.body.pipeThrough(new TextDecoderStream())) {
        buffer += chunk;
        const lines = buffer.split('\n');
        buffer = lines.pop();
        for (const line of lines) {
          const event = JSON.parse(line);
          if (event.error) throw new Error(event.error);
          if (event.progress) status.textContent = event.progress;
          if (event.result) completed = true;
        }
      }
      if (!completed) throw new Error('The connection ended. Check the conversation before retrying.');
    }
    input.value = '';
    status.textContent = '';
  } catch (error) {
    status.textContent = error.message;
  } finally {
    try { await refresh(); } catch (error) { status.textContent = error.message; }
    pending = false;
    form.querySelector('button').disabled = false;
    select.disabled = false;
    document.querySelector('#new').disabled = false;
    suggestions.forEach(button => { button.disabled = false; });
  }
}

form.addEventListener('submit', event => {
  event.preventDefault();
  if (input.value.trim()) sendTurn({ id: crypto.randomUUID(), question: input.value, zone });
});
for (const button of suggestions) {
  button.addEventListener('click', () => {
    input.value = button.dataset.prompt;
    input.focus();
  });
}
select.addEventListener('change', () => { chat = select.value; loadChat(); });
document.querySelector('#new').addEventListener('click', () => { chat = crypto.randomUUID(); input.value = ''; loadChat(); });

function loadChat() {
  status.textContent = '';
  refresh().catch(error => { status.textContent = error.message; });
}
loadChat();
