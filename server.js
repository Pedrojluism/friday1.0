require('dotenv').config();
const express = require('express');
const Anthropic = require('@anthropic-ai/sdk');
const https = require('https');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(express.json());

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;

function buildSystemPrompt() {
  let prompt = '';
  const claudeMdPath = path.join(__dirname, 'CLAUDE.md');
  if (fs.existsSync(claudeMdPath)) {
    prompt += fs.readFileSync(claudeMdPath, 'utf8');
  }
  const contextDir = path.join(__dirname, 'context');
  if (fs.existsSync(contextDir)) {
    const files = fs.readdirSync(contextDir).filter(f => f.endsWith('.md'));
    if (files.length > 0) {
      prompt += '\n\n# CONTEXTO DEL USUARIO\n';
      files.forEach(file => {
        const content = fs.readFileSync(path.join(contextDir, file), 'utf8');
        prompt += `\n## ${file}\n${content}\n`;
      });
    }
  }
  return prompt;
}

async function askFriday(message, userId) {
  if (!conversations[userId]) conversations[userId] = [];
  conversations[userId].push({ role: 'user', content: message });

  const response = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 1024,
    system: buildSystemPrompt(),
    messages: conversations[userId],
  });

  const reply = response.content[0].text;
  conversations[userId].push({ role: 'assistant', content: reply });

  if (conversations[userId].length > 20) {
    conversations[userId] = conversations[userId].slice(-20);
  }

  return reply;
}

function sendTelegram(chatId, text) {
  const body = JSON.stringify({ chat_id: chatId, text });
  const options = {
    hostname: 'api.telegram.org',
    path: `/bot${TELEGRAM_TOKEN}/sendMessage`,
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
  };
  const req = https.request(options);
  req.write(body);
  req.end();
}

const conversations = {};

// Webhook de Telegram
app.post('/telegram', async (req, res) => {
  res.sendStatus(200);
  const msg = req.body.message;
  if (!msg || !msg.text) return;

  const chatId = msg.chat.id;
  const userId = String(chatId);
  const text = msg.text;

  if (text === '/start') {
    sendTelegram(chatId, 'Hola Pedro, soy Friday. ¿En qué te ayudo?');
    return;
  }

  if (text === '/reset') {
    conversations[userId] = [];
    sendTelegram(chatId, 'Historial limpiado.');
    return;
  }

  try {
    const reply = await askFriday(text, userId);
    sendTelegram(chatId, reply);
  } catch (error) {
    console.error('Error:', error.message);
    sendTelegram(chatId, 'Error conectando con Claude. Intenta de nuevo.');
  }
});

// Chat directo via HTTP
app.post('/chat', async (req, res) => {
  const { message, userId = 'pedro' } = req.body;
  if (!message) return res.status(400).json({ error: 'El campo message es requerido' });
  try {
    const reply = await askFriday(message, userId);
    res.json({ response: reply });
  } catch (error) {
    res.status(500).json({ error: 'Error conectando con Claude' });
  }
});

app.post('/reset', (req, res) => {
  const { userId = 'pedro' } = req.body;
  conversations[userId] = [];
  res.json({ ok: true });
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok', bot: 'Friday v1.0', timestamp: new Date().toISOString() });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Friday bot corriendo en puerto ${PORT}`);
});
