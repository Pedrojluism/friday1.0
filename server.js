require('dotenv').config();
const express = require('express');
const Anthropic = require('@anthropic-ai/sdk');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(express.json());

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

function buildSystemPrompt() {
  let prompt = '';

  // Cargar CLAUDE.md (reglas y configuracion del asistente)
  const claudeMdPath = path.join(__dirname, 'CLAUDE.md');
  if (fs.existsSync(claudeMdPath)) {
    prompt += fs.readFileSync(claudeMdPath, 'utf8');
  }

  // Cargar todos los archivos de contexto
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

// Historial de conversacion por usuario (en memoria)
const conversations = {};

// Ruta principal de chat
app.post('/chat', async (req, res) => {
  const { message, userId = 'pedro' } = req.body;

  if (!message) {
    return res.status(400).json({ error: 'El campo message es requerido' });
  }

  if (!conversations[userId]) {
    conversations[userId] = [];
  }

  conversations[userId].push({ role: 'user', content: message });

  try {
    const response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      system: buildSystemPrompt(),
      messages: conversations[userId],
    });

    const reply = response.content[0].text;
    conversations[userId].push({ role: 'assistant', content: reply });

    // Mantener solo los ultimos 20 mensajes para controlar el costo
    if (conversations[userId].length > 20) {
      conversations[userId] = conversations[userId].slice(-20);
    }

    res.json({ response: reply, tokens_used: response.usage });
  } catch (error) {
    console.error('Error API Claude:', error.message);
    res.status(500).json({ error: 'Error conectando con Claude' });
  }
});

// Limpiar historial de conversacion
app.post('/reset', (req, res) => {
  const { userId = 'pedro' } = req.body;
  conversations[userId] = [];
  res.json({ ok: true, message: 'Historial limpiado' });
});

// Health check para Coolify
app.get('/health', (req, res) => {
  res.json({ status: 'ok', bot: 'Friday v1.0', timestamp: new Date().toISOString() });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Friday bot corriendo en puerto ${PORT}`);
});
