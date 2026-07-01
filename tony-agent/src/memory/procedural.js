const fs = require('fs');
const path = require('path');
const config = require('../config');

const FILE = () => path.join(config.dataDir, 'procedural.json');

function load() {
  try {
    return JSON.parse(fs.readFileSync(FILE(), 'utf8'));
  } catch {
    return { playbooks: [] };
  }
}

function save(data) {
  const dir = config.dataDir;
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(FILE(), JSON.stringify(data, null, 2));
}

function recordPlaybook(name, steps, outcome = 'success') {
  const data = load();
  data.playbooks.push({
    name,
    steps,
    outcome,
    at: new Date().toISOString(),
  });
  if (data.playbooks.length > 200) data.playbooks = data.playbooks.slice(-200);
  save(data);
}

function findPlaybooks(query, limit = 5) {
  const q = query.toLowerCase();
  return load()
    .playbooks.filter((p) => p.name.toLowerCase().includes(q) || JSON.stringify(p.steps).toLowerCase().includes(q))
    .slice(-limit);
}

module.exports = { load, recordPlaybook, findPlaybooks };
