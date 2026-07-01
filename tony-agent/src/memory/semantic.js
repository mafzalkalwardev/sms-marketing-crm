const fs = require('fs');
const path = require('path');
const config = require('../config');

const FILE = () => path.join(config.dataDir, 'semantic.json');

function load() {
  try {
    return JSON.parse(fs.readFileSync(FILE(), 'utf8'));
  } catch {
    return { facts: [], entities: {}, preferences: {} };
  }
}

function save(data) {
  const dir = config.dataDir;
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(FILE(), JSON.stringify(data, null, 2));
}

function rememberFact(text, tags = []) {
  const data = load();
  data.facts.push({ text, tags, at: new Date().toISOString() });
  if (data.facts.length > 500) data.facts = data.facts.slice(-500);
  save(data);
  return data.facts[data.facts.length - 1];
}

function setPreference(key, value) {
  const data = load();
  data.preferences[key] = value;
  save(data);
}

function search(query, limit = 8) {
  const q = query.toLowerCase();
  const data = load();
  const hits = data.facts.filter((f) => f.text.toLowerCase().includes(q));
  const prefs = Object.entries(data.preferences)
    .filter(([k, v]) => `${k} ${v}`.toLowerCase().includes(q))
    .map(([k, v]) => ({ text: `Preference: ${k} = ${v}`, tags: ['preference'] }));
  return [...hits, ...prefs].slice(0, limit);
}

module.exports = { load, rememberFact, setPreference, search };
