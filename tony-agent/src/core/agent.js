const config = require('../config');
const memory = require('../memory');
const procedural = require('../memory/procedural');
const { complete, loadIdentity } = require('../llm');
const { listTools, executeTool } = require('../tools/registry');
const { plan, synthesize } = require('./planner');
const { loadSkillsContext } = require('../skills/loader');

function buildMessages(sessionId, userMessage, skillsContext) {
  const history = memory.getSessionHistory(sessionId, 20);
  const system = `${loadIdentity()}

## Skills loaded
${skillsContext || 'None'}

## Instructions
Use tools when needed. After tool results, continue reasoning or give final answer.
When done, respond without requesting more tools.`;

  return [
    { role: 'system', content: system },
    ...history.map((h) => ({ role: h.role, content: h.content })),
    { role: 'user', content: userMessage },
  ];
}

async function runAgent({ sessionId, message }) {
  memory.appendEpisode(sessionId, 'user', message);

  const skillsContext = loadSkillsContext();
  const planResult = await plan(message, sessionId);
  const tools = listTools();
  const toolResults = [];

  let messages = buildMessages(sessionId, message, skillsContext);
  let iterations = 0;
  let finalContent = '';

  while (iterations < config.maxIterations) {
    iterations += 1;
    const result = await complete(messages, {
      tools: tools.map((t) => ({
        name: t.name,
        description: t.description,
        parameters: t.parameters,
      })),
    });

    if (result.toolCalls?.length) {
      for (const call of result.toolCalls) {
        const toolResult = await executeTool(call.name, call.arguments, sessionId);
        toolResults.push({ tool: call.name, args: call.arguments, result: toolResult });
        messages.push({
          role: 'assistant',
          content: result.content || `Calling ${call.name}...`,
        });
        messages.push({
          role: 'user',
          content: `Tool ${call.name} result:\n${JSON.stringify(toolResult, null, 2)}`,
        });
      }
      continue;
    }

    finalContent = result.content || '';
    break;
  }

  if (!finalContent && toolResults.length) {
    finalContent = await synthesize(message, planResult, toolResults);
  }

  if (!finalContent) {
    finalContent = 'I reached the iteration limit. Here is what I gathered:\n' + JSON.stringify(toolResults, null, 2);
  }

  memory.appendEpisode(sessionId, 'assistant', finalContent);

  if (config.autoReflect && toolResults.length) {
    procedural.recordPlaybook(
      planResult.intent?.slice(0, 80) || message.slice(0, 80),
      toolResults.map((t) => t.tool),
      'completed'
    );
  }

  return {
    sessionId,
    response: finalContent,
    plan: planResult,
    toolResults,
    iterations,
  };
}

module.exports = { runAgent };
