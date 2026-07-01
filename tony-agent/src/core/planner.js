/**
 * JARVIS/HuggingGPT-inspired 4-stage planner:
 * 1. Task planning — decompose user intent
 * 2. Model/tool selection — pick executors
 * 3. Execution — handled by agent loop
 * 4. Response synthesis — final LLM pass
 */

const { complete, loadIdentity } = require('../llm');
const { listTools } = require('../tools/registry');
const memory = require('../memory');

async function plan(userMessage, sessionId) {
  const history = memory.getSessionHistory(sessionId, 6);
  const tools = listTools();
  const memoryContext = memory.searchAll(userMessage, 3);

  const system = `${loadIdentity()}

You are in PLANNING mode. Output JSON only:
{
  "intent": "one sentence",
  "subtasks": ["step1", "step2"],
  "suggested_tools": ["tool_name"],
  "requires_confirmation": false
}`;

  const messages = [
    { role: 'system', content: system },
    ...history.map((h) => ({ role: h.role, content: h.content })),
    {
      role: 'user',
      content: `User request: ${userMessage}\n\nRelevant memory: ${JSON.stringify(memoryContext).slice(0, 2000)}`,
    },
  ];

  try {
    const result = await complete(messages, { tools: [], temperature: 0.2 });
    const match = result.content.match(/\{[\s\S]*\}/);
    if (match) return JSON.parse(match[0]);
  } catch {
    // fall through
  }

  return {
    intent: userMessage,
    subtasks: [userMessage],
    suggested_tools: inferTools(userMessage, tools),
    requires_confirmation: /delete|push|send sms|drop table/i.test(userMessage),
  };
}

function inferTools(message, tools) {
  const m = message.toLowerCase();
  const names = [];
  if (m.includes('file') || m.includes('read')) names.push('read_file');
  if (m.includes('memory') || m.includes('remember')) names.push('memory_search');
  if (m.includes('signalmint') || m.includes('sms')) names.push('signalmint_workspace');
  if (m.includes('skill')) names.push('list_skills');
  if (m.includes('github')) names.push('github_search');
  if (!names.length) names.push('memory_search');
  return names.filter((n) => tools.some((t) => t.name === n));
}

async function synthesize(userMessage, planResult, toolResults) {
  const system = loadIdentity();
  const messages = [
    { role: 'system', content: system },
    {
      role: 'user',
      content: `Original request: ${userMessage}
Plan: ${JSON.stringify(planResult)}
Tool results: ${JSON.stringify(toolResults).slice(0, 6000)}

Provide a clear, actionable final response for the user.`,
    },
  ];
  const result = await complete(messages, { tools: [] });
  return result.content;
}

module.exports = { plan, synthesize, inferTools };
