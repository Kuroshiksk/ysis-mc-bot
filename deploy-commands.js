require('dotenv').config();
const { REST, Routes } = require('discord.js');
const { commands } = require('./commands');

if (!process.env.DISCORD_TOKEN || !process.env.DISCORD_CLIENT_ID) {
  console.error('Define DISCORD_TOKEN e DISCORD_CLIENT_ID no .env antes de registar os comandos.');
  process.exit(1);
}
const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
(async () => {
  try {
    console.log(`A registar ${commands.length} comandos globais...`);
    await rest.put(Routes.applicationCommands(process.env.DISCORD_CLIENT_ID), { body: commands });
    console.log('Comandos registados. A atualização global pode demorar alguns minutos a aparecer no Discord.');
  } catch (error) {
    console.error('Não foi possível registar os comandos:', error);
    process.exit(1);
  }
})();
