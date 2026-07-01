/**
 * CrewAI-inspired multi-agent delegation.
 * Specialists handle subtasks; TONY synthesizes.
 */

const { complete, loadIdentity } = require('../llm');

const ROLES = {
  researcher: {
    name: 'Researcher',
    focus: 'Gather facts from memory, knowledge index, and web. No speculation.',
  },
  engineer: {
    name: 'Engineer',
    focus: 'Code, files, tests, git. Minimal diffs. Safety first.',
  },
  operator: {
    name: 'Operator',
    focus: 'SignalMint SMS, campaigns, compliance, workspace ops.',
  },
  strategist: {
    name: 'Strategist',
    focus: 'Priorities, tradeoffs, Friday-style executive briefs.',
  },
};

async function runSpecialist(role, task, context = '') {
  const spec = ROLES[role];
  if (!spec) throw new Error(`Unknown role: ${role}`);

  const messages = [
    {
      role: 'system',
      content: `${loadIdentity()}\n\nYou are the ${spec.name} specialist. ${spec.focus}`,
    },
    {
      role: 'user',
      content: `Task: ${task}\n\nContext:\n${context}`.slice(0, 8000),
    },
  ];

  const result = await complete(messages, { temperature: 0.4 });
  return { role, name: spec.name, output: result.content };
}

function selectRoles(task) {
  const t = task.toLowerCase();
  const roles = [];
  if (/code|file|test|bug|refactor|implement/.test(t)) roles.push('engineer');
  if (/research|learn|find|github|pattern/.test(t)) roles.push('researcher');
  if (/sms|campaign|signalmint|compliance|inbox/.test(t)) roles.push('operator');
  if (/priority|brief|plan|strategy|focus|week/.test(t)) roles.push('strategist');
  if (!roles.length) roles.push('strategist', 'researcher');
  return [...new Set(roles)];
}

async function runCrew(task, context = '') {
  const roles = selectRoles(task);
  const results = [];
  for (const role of roles) {
    results.push(await runSpecialist(role, task, context));
  }

  const synthesis = await complete(
    [
      { role: 'system', content: loadIdentity() },
      {
        role: 'user',
        content: `Task: ${task}\n\nSpecialist outputs:\n${results.map((r) => `## ${r.name}\n${r.output}`).join('\n\n')}\n\nSynthesize one unified answer.`,
      },
    ],
    { temperature: 0.3 }
  );

  return { roles, specialists: results, synthesis: synthesis.content };
}

module.exports = { ROLES, runCrew, runSpecialist, selectRoles };
