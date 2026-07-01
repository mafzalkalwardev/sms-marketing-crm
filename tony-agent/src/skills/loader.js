const fs = require('fs');
const path = require('path');
const config = require('../config');

function discoverSkillFiles() {
  const files = [];
  const roots = [
    path.join(path.dirname(config.identityPath), 'skills'),
    ...config.skillsDirs,
  ];

  for (const root of roots) {
    if (!fs.existsSync(root)) continue;
    const walk = (dir) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (entry.name === 'SKILL.md') files.push(full);
      }
    };
    walk(root);
  }
  return [...new Set(files)];
}

function parseSkill(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8');
  const name = path.basename(path.dirname(filePath));
  const titleMatch = raw.match(/^#\s+(.+)/m);
  return {
    id: name,
    title: titleMatch ? titleMatch[1].trim() : name,
    path: filePath,
    content: raw.slice(0, 4000),
  };
}

function listSkills() {
  return discoverSkillFiles().map(parseSkill).map((s) => ({
    id: s.id,
    title: s.title,
    path: s.path,
  }));
}

function loadSkillsContext(maxChars = 6000) {
  const skills = discoverSkillFiles().map(parseSkill);
  let out = '';
  for (const s of skills) {
    if (out.length + s.content.length > maxChars) break;
    out += `\n### Skill: ${s.title}\n${s.content}\n`;
  }
  return out.trim();
}

module.exports = { listSkills, loadSkillsContext, discoverSkillFiles };
