
const {
  Client,
  GatewayIntentBits,
  REST,
  Routes
} = require("discord.js");

const token = process.env.DISCORD_TOKEN;
const clientId = process.env.CLIENT_ID;
const guildId = process.env.GUILD_ID;

// Troque pelo IP ou endereço real do seu servidor Minecraft.
const minecraftIP = "SEU_IP_AQUI";

if (!token || !clientId || !guildId) {
  console.error(
    "Configure DISCORD_TOKEN, CLIENT_ID e GUILD_ID no Railway."
  );
  process.exit(1);
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers
  ]
});

const commands = [
  {
    name: "ajuda",
    description: "Mostra os comandos do bot YSIS-MC"
  },
  {
    name: "ip",
    description: "Mostra o endereço do servidor Minecraft"
  }
];

client.once("ready", async () => {
  console.log(`YSIS MC online como ${client.user.tag}`);

  try {
    const rest = new REST({ version: "10" }).setToken(token);

    await rest.put(
      Routes.applicationGuildCommands(clientId, guildId),
      { body: commands }
    );

    console.log("Comandos /ajuda e /ip registrados!");
  } catch (error) {
    console.error("Erro ao registrar comandos:", error);
  }
});

client.on("interactionCreate", async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  if (interaction.commandName === "ajuda") {
    await interaction.reply({
      embeds: [{
        color: 0x39a852,
        title: "⛏️ YSIS-MC | Ajuda",
        description:
          "**Comandos disponíveis:**\n\n" +
          "📖 `/ajuda` — mostra esta lista.\n" +
          "🌐 `/ip` — mostra o endereço do Minecraft.\n\n" +
          "🌌 Explore, construa e crie seu próprio império!"
      }]
    });
  }

  if (interaction.commandName === "ip") {
    if (minecraftIP === "SEU_IP_AQUI") {
      await interaction.reply(
        "⚠️ O endereço do servidor ainda não foi configurado."
      );
      return;
    }

    await interaction.reply({
      embeds: [{
        color: 0x39a852,
        title: "🌐 Servidor Minecraft YSIS-MC",
        description:
          `**Endereço:** \`${minecraftIP}\`\n\n` +
          "⛏️ Prepare sua picareta e venha jogar!"
      }]
    });
  }
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
