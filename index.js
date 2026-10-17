
const { Client, GatewayIntentBits } = require("discord.js");

const token = process.env.DISCORD_TOKEN;

if (!token) {
  console.error("Erro: a variável DISCORD_TOKEN não está configurada.");
  process.exit(1);
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers
  ]
});

client.once("ready", () => {
  console.log(`YSIS MC online como ${client.user.tag}`);
});

client.on("guildMemberAdd", async (member) => {
  const channel = member.guild.systemChannel;

  if (!channel) return;

  channel.send(
    `🌌 Bem-vindo ao **YSIS MC**, ${member}!\n` +
    "Explora, constrói a tua base, junta recursos e cria o teu próprio império!"
  ).catch(console.error);
});

client.login(token).catch((error) => {
  console.error("Não foi possível ligar o bot:", error.message);
  process.exit(1);
});
