const config = require('../config');

async function complete(messages, options = {}) {
  if (!config.anthropic.apiKey) {
    throw new Error('ANTHROPIC_API_KEY not set');
  }

  const system = messages.filter((m) => m.role === 'system').map((m) => m.content).join('\n\n');
  const chatMessages = messages.filter((m) => m.role !== 'system');

  const body = {
    model: config.anthropic.model,
    max_tokens: options.maxTokens ?? 4096,
    system: system || undefined,
    messages: chatMessages.map((m) => ({
      role: m.role === 'assistant' ? 'assistant' : 'user',
      content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content),
    })),
  };

  if (options.tools?.length) {
    body.tools = options.tools.map((t) => ({
      name: t.name,
      description: t.description,
      input_schema: t.parameters || { type: 'object', properties: {} },
    }));
  }

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': config.anthropic.apiKey,
      'anthropic-version': '2023-06-01',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error?.message || `Anthropic HTTP ${response.status}`);
  }

  const textBlocks = data.content.filter((b) => b.type === 'text');
  const toolBlocks = data.content.filter((b) => b.type === 'tool_use');

  return {
    content: textBlocks.map((b) => b.text).join('\n'),
    toolCalls: toolBlocks.map((b) => ({ name: b.name, arguments: b.input })),
    finishReason: data.stop_reason,
  };
}

module.exports = { complete };
