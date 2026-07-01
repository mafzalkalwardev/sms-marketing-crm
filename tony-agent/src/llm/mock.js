/** Mock LLM for tests and offline dev — pattern-based tool routing */

const TOOL_PATTERN = /\[TOOL:(\w+)\]\s*(\{[\s\S]*?\})?/;

async function complete(messages, { tools = [] } = {}) {
  const last = [...messages].reverse().find((m) => m.role === 'user');
  const text = (last?.content || '').toLowerCase();

  const toolNames = tools.map((t) => t.name);

  if (text.includes('remember') || text.includes('memory')) {
    return {
      content: `[TOOL:memory_search] {"query":"${last.content.slice(0, 80)}"}\nI'll search memory first.`,
      toolCalls: [{ name: 'memory_search', arguments: { query: last.content.slice(0, 120) } }],
      finishReason: 'tool_calls',
    };
  }

  if (text.includes('signalmint') || text.includes('sms') || text.includes('campaign')) {
    if (text.includes('health') || text.includes('status')) {
      return {
        content: 'Checking SignalMint API health.',
        toolCalls: [{ name: 'signalmint_health', arguments: {} }],
        finishReason: 'tool_calls',
      };
    }
    return {
      content: 'Pulling SignalMint workspace summary.',
      toolCalls: [{ name: 'signalmint_workspace', arguments: {} }],
      finishReason: 'tool_calls',
    };
  }

  if (text.includes('read') && (text.includes('file') || text.includes('.md') || text.includes('.js'))) {
    const match = last.content.match(/[`'"]?([\w./-]+\.(md|js|json|txt))[`'"]?/i);
    const filePath = match ? match[1] : 'README.md';
    return {
      content: `Reading ${filePath}.`,
      toolCalls: [{ name: 'read_file', arguments: { path: filePath } }],
      finishReason: 'tool_calls',
    };
  }

  if (text.includes('list') && text.includes('skill')) {
    return {
      content: 'Listing available skills.',
      toolCalls: [{ name: 'list_skills', arguments: {} }],
      finishReason: 'tool_calls',
    };
  }

  if (text.includes('github') || text.includes('repo')) {
    return {
      content: 'Searching GitHub knowledge index.',
      toolCalls: [{ name: 'knowledge_search', arguments: { query: last.content } }],
      finishReason: 'tool_calls',
    };
  }

  // Direct answer mode
  const skillsHint = toolNames.length ? ` Available tools: ${toolNames.join(', ')}.` : '';
  return {
    content: `TONY (mock mode): I understood your request — "${last?.content || ''}".${skillsHint}\n\nIn production, connect OPENAI_API_KEY or ANTHROPIC_API_KEY for full reasoning. I can still use tools when you ask about SignalMint, files, memory, or skills.`,
    toolCalls: [],
    finishReason: 'stop',
  };
}

module.exports = { complete, TOOL_PATTERN };
