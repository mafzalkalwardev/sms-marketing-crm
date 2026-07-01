const { randomUUID } = require('crypto');
const path = require('path');

process.chdir(path.join(__dirname, '..'));
process.env.TONY_LLM_PROVIDER = process.env.TONY_LLM_PROVIDER || 'mock';
process.env.TONY_DATA_DIR = process.env.TONY_DATA_DIR || './data-test';

const { runAgent } = require('../src/core/agent');
const memory = require('../src/memory');
const { listSkills } = require('../src/skills/loader');
const { listTools } = require('../src/tools/registry');

let passed = 0;
let failed = 0;

function assert(name, condition) {
  if (condition) {
    passed += 1;
    console.log(`  OK ${name}`);
  } else {
    failed += 1;
    console.error(`  FAIL ${name}`);
  }
}

async function main() {
  console.log('=== TONY Agent Tests ===\n');

  assert('tools registered', listTools().length >= 10);
  assert('skills loaded', listSkills().length >= 3);

  memory.remember('User prefers autonomous overnight builds', ['test']);
  const search = memory.searchAll('autonomous');
  assert('semantic memory', search.semantic.length >= 1);

  const sessionId = randomUUID();
  const result = await runAgent({
    sessionId,
    message: 'List available skills and search memory for autonomous',
  });
  assert('agent responds', Boolean(result.response));
  assert('agent used tools', result.toolResults.length >= 1);

  const history = memory.getSessionHistory(sessionId, 10);
  assert('episodic memory', history.length >= 2);

  const knowledge = require('../src/knowledge/agents-index.json');
  assert('knowledge index', knowledge.agents.length >= 15);

  console.log(`\n=== ${passed} passed, ${failed} failed ===`);
  process.exit(failed ? 1 : 0);
}

main().catch((e) => {
  console.error('FAILED:', e);
  process.exit(1);
});
