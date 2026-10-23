const fs = require('node:fs');
const path = require('node:path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const CONFIG_PATH = path.join(DATA_DIR, 'config.json');
fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(CONFIG_PATH)) fs.writeFileSync(CONFIG_PATH, JSON.stringify({}, null, 2));

function allConfig() {
  try { return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8')); }
  catch { return {}; }
}
function getGuildConfig(guildId) {
  const all = allConfig();
  return all[guildId] || { rulesText: '📜 **Regras do YSIS MC**\n\n1. Respeite os outros jogadores.\n2. Não use cheats, hacks ou exploits.\n3. Não faça spam nem publicidade sem autorização.\n4. Siga as orientações da administração.\n5. Divirta-se e ajude a manter a comunidade agradável.', rulesChannelId: '', logChannelId: '' };
}
function updateGuildConfig(guildId, patch) {
  const all = allConfig();
  all[guildId] = { ...getGuildConfig(guildId), ...patch };
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(all, null, 2));
  return all[guildId];
}
module.exports = { getGuildConfig, updateGuildConfig };
