const episodic = require('./episodic');
const semantic = require('./semantic');
const procedural = require('./procedural');

function searchAll(query, limit = 10) {
  return {
    episodic: episodic.searchEpisodes(query, limit),
    semantic: semantic.search(query, limit),
    procedural: procedural.findPlaybooks(query, 5),
  };
}

function remember(text, tags = []) {
  return semantic.rememberFact(text, tags);
}

module.exports = {
  ...episodic,
  remember,
  searchAll,
  semantic,
  procedural,
};
