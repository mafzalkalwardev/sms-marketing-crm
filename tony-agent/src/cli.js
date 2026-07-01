#!/usr/bin/env node
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const readline = require('readline');
const { randomUUID } = require('crypto');
const { runAgent } = require('./core/agent');
const memory = require('./memory');
const { listSkills } = require('./skills/loader');

const [,, command, ...rest] = process.argv;
const argText = rest.join(' ').trim();

async function chatInteractive() {
  const sessionId = randomUUID();
  console.log('TONY v1.0 — type "exit" to quit\n');

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const ask = () => {
    rl.question('You: ', async (line) => {
      if (!line.trim() || line.trim() === 'exit') {
        rl.close();
        return;
      }
      try {
        const result = await runAgent({ sessionId, message: line });
        console.log(`\nTONY: ${result.response}\n`);
        if (result.toolResults?.length) {
          console.log(`[tools: ${result.toolResults.map((t) => t.tool).join(', ')}]\n`);
        }
      } catch (e) {
        console.error('Error:', e.message);
      }
      ask();
    });
  };
  ask();
}

async function runOnce(message) {
  const result = await runAgent({ sessionId: randomUUID(), message });
  console.log(result.response);
  if (result.toolResults?.length) {
    console.error(`Tools: ${result.toolResults.map((t) => t.tool).join(', ')}`);
  }
}

function remember(text) {
  const fact = memory.remember(text, ['cli']);
  console.log('Remembered:', fact.text);
}

function showSkills() {
  const skills = listSkills();
  if (!skills.length) {
    console.log('No skills found.');
    return;
  }
  for (const s of skills) {
    console.log(`- ${s.title} (${s.id})`);
  }
}

async function main() {
  switch (command) {
    case 'chat':
      await chatInteractive();
      break;
    case 'run':
      if (!argText) {
        console.error('Usage: node src/cli.js run "your task"');
        process.exit(1);
      }
      await runOnce(argText);
      break;
    case 'remember':
      if (!argText) {
        console.error('Usage: node src/cli.js remember "fact to store"');
        process.exit(1);
      }
      remember(argText);
      break;
    case 'skills':
      showSkills();
      break;
    default:
      console.log(`TONY CLI
  npm run chat
  npm run run -- "task"
  npm run remember -- "fact"
  npm run skills
  npm start          # gateway`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
