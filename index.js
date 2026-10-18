
const {
  Client,
  GatewayIntentBits,
  SlashCommandBuilder,
  REST,
  Routes,
  EmbedBuilder,
  PermissionFlagsBits,
} = require("discord.js");

const TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const GUILD_ID = process.env.GUILD_ID;

const IP = process.env.MINECRAFT_IP || "YSISmc.aternos.me";
const PORT = "50061";
const SITE = "https://bit.ly/YsisMc";
const ATERNOS = "https://aternos.org/server/";

if (!TOKEN || !CLIENT_ID || !GUILD_ID) {
  throw new Error(
    "Configure DISCORD_TOKEN, CLIENT_ID e GUILD_ID nas variáveis do Railway."
  );
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
  ],
});

const comandos = [
  new SlashCommandBuilder()
    .setName("ajuda")
    .setDescription("Mostra todos os comandos do YSIS MC"),

  new SlashCommandBuilder()
    .setName("ip")
    .setDescription("Mostra o IP do servidor Minecraft"),

  new SlashCommandBuilder()
    .setName("site")
    .setDescription("Mostra o site do YSIS MC"),

  new SlashCommandBuilder()
    .setName("banho")
    .setDescription("Manda alguém tomar banho")
    .addUserOption(option =>
      option
        .setName("usuario")
        .setDescription("Pessoa que vai tomar banho")
        .setRequired(false)
    ),

  new SlashCommandBuilder()
    .setName("avatar")
    .setDescription("Mostra o avatar de um usuário")
    .addUserOption(option =>
      option
        .setName("usuario")
        .setDescription("Usuário desejado")
        .setRequired(false)
    ),

  new SlashCommandBuilder()
    .setName("servidor")
    .setDescription("Mostra informações do servidor Discord"),

  new SlashCommandBuilder()
    .setName("limpar")
    .setDescription("Apaga mensagens do canal")
    .addIntegerOption(option =>
      option
        .setName("quantidade")
        .setDescription("Quantidade de mensagens (1 a 100)")
        .setMinValue(1)
        .setMaxValue(100)
        .setRequired(true)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),

  new SlashCommandBuilder()
    .setName("expulsar")
    .setDescription("Expulsa um membro do servidor")
    .addUserOption(option =>
      option
        .setName("usuario")
        .setDescription("Membro que será expulso")
        .setRequired(true)
    )
    .addStringOption(option =>
      option
        .setName("motivo")
        .setDescription("Motivo da expulsão")
        .setRequired(false)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.KickMembers),

  new SlashCommandBuilder()
    .setName("banir")
    .setDescription("Bane um membro do servidor")
    .addUserOption(option =>
      option
        .setName("usuario")
        .setDescription("Membro que será banido")
        .setRequired(true)
    )
    .addStringOption(option =>
      option
        .setName("motivo")
        .setDescription("Motivo do banimento")
        .setRequired(false)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers),
].map(command => command.toJSON());

function embed(titulo, descricao, cor = 0x3498db) {
  return new EmbedBuilder()
    .setColor(cor)
    .setTitle(titulo)
    .setDescription(descricao)
    .setFooter({ text: "YSIS MC • Créditos: Kuroshi" })
    .setTimestamp();
}

function encontrarCanal(guild, nomes) {
  return guild.channels.cache.find(channel =>
    nomes.includes(channel.name)
  );
}

async function registrar(guild, mensagem) {
  const canal = encontrarCanal(guild, [
    "📋・logs",
    "logs",
    "📜・registros",
  ]);

  if (canal && canal.isTextBased()) {
    await canal.send({ embeds: [mensagem] }).catch(() => {});
  }
}

client.once("ready", async () => {
  console.log(`✅ ${client.user.tag} está online!`);

  try {
    const rest = new REST({ version: "10" }).setToken(TOKEN);

    await rest.put(
      Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID),
      { body: comandos }
    );

    console.log("✅ Comandos registrados com sucesso!");
  } catch (error) {
    console.error("Erro ao registrar comandos:", error);
  }
});

client.on("guildMemberAdd", async member => {
  const canal = encontrarCanal(member.guild, [
    "👋・entradas",
    "entradas",
    "bem-vindo",
  ]) || member.guild.systemChannel;

  if (canal && canal.isTextBased()) {
    await canal.send({
      content: `👋 Bem-vindo(a), ${member}!`,
      embeds: [
        embed(
          "🎮 Bem-vindo ao YSIS MC!",
          `Olá, ${member.user.username}!\n\n` +
          `🌐 **Site:** ${SITE}\n` +
          `⛏️ **IP:** \`${IP}\`\n` +
          `🔌 **Porta:** \`${PORT}\`\n\n` +
          "Divirta-se e respeite as regras!"
        ),
      ],
    }).catch(() => {});
  }

  await registrar(
    member.guild,
    embed(
      "📥 Membro entrou",
      `**Usuário:** ${member.user.tag}\n` +
      `**ID:** ${member.id}`,
      0x2ecc71
    )
  );
});

client.on("guildMemberRemove", async member => {
  await registrar(
    member.guild,
    embed(
      "📤 Membro saiu",
      `**Usuário:** ${member.user.tag}\n` +
      `**ID:** ${member.id}`,
      0xe74c3c
    )
  );
});

client.on("interactionCreate", async interaction => {
  if (!interaction.isChatInputCommand()) return;

  const { commandName, guild } = interaction;

  try {
    if (commandName === "ajuda") {
      return interaction.reply({
        embeds: [
          embed(
            "📚 Comandos do YSIS MC",
            "**🌐 Informações**\n" +
            "`/ip` — IP do Minecraft\n" +
            "`/site` — Site do servidor\n" +
            "`/servidor` — Informações do Discord\n" +
            "`/avatar` — Ver avatar de usuário\n\n" +
            "**😂 Diversão**\n" +
            "`/banho` — Mandar alguém tomar banho\n\n" +
            "**🛡️ Moderação**\n" +
            "`/limpar` — Apagar mensagens\n" +
            "`/expulsar` — Expulsar membro\n" +
            "`/banir` — Banir membro\n\n" +
            "💙 **Em breve:** novos sistemas e comandos!"
          ),
        ],
      });
    }

    if (commandName === "ip") {
      return interaction.reply({
        embeds: [
          embed(
            "⛏️ Servidor Minecraft",
            `**IP:** \`${IP}\`\n` +
            `**Porta:** \`${PORT}\`\n\n` +
            `🎮 **Painel Aternos:** ${ATERNOS}`
          ),
        ],
      });
    }

    if (commandName === "site") {
      return interaction.reply({
        embeds: [
          embed(
            "🌐 Site do YSIS MC",
            `Acesse nosso site por aqui:\n${SITE}`
          ),
        ],
      });
    }

    if (commandName === "banho") {
      const usuario =
        interaction.options.getUser("usuario") || interaction.user;

      return interaction.reply({
        embeds: [
          embed(
            "🧼 Hora do banho!",
            `🚿 ${usuario}, está na hora de tomar um banho! 🧽`,
            0x1abc9c
          ),
        ],
      });
    }

    if (commandName === "avatar") {
      const usuario =
        interaction.options.getUser("usuario") || interaction.user;

      return interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(0x3498db)
            .setTitle(`🖼️ Avatar de ${usuario.username}`)
            .setImage(
              usuario.displayAvatarURL({
                size: 1024,
                extension: "png",
              })
            )
            .setFooter({ text: "YSIS MC • Créditos: Kuroshi" }),
        ],
      });
    }

    if (commandName === "servidor") {
      return interaction.reply({
        embeds: [
          embed(
            `📊 ${guild.name}`,
            `**👥 Membros:** ${guild.memberCount}\n` +
            `**🆔 ID:** ${guild.id}\n` +
            `**📅 Criado em:** <t:${Math.floor(
              guild.createdTimestamp / 1000
            )}:D>`
          ),
        ],
      });
    }

    if (commandName === "limpar") {
      if (!interaction.channel ||
          !interaction.channel.isTextBased() ||
          !interaction.channel.messages) {
        return interaction.reply({
          content: "❌ Este comando só funciona em canais de texto.",
          ephemeral: true,
        });
      }

      const quantidade =
        interaction.options.getInteger("quantidade");

      const apagadas = await interaction.channel.bulkDelete(
        quantidade,
        true
      );

      await interaction.reply({
        content: `🧹 Apaguei ${apagadas.size} mensagens.`,
        ephemeral: true,
      });

      await registrar(
        guild,
        embed(
          "🧹 Mensagens apagadas",
          `**Responsável:** ${interaction.user.tag}\n` +
          `**Canal:** ${interaction.channel}\n` +
          `**Quantidade:** ${apagadas.size}`
        )
      );

      return;
    }

    if (commandName === "expulsar") {
      const usuario = interaction.options.getUser("usuario");
      const motivo =
        interaction.options.getString("motivo") || "Não informado";

      const membro = await guild.members.fetch(usuario.id);

      if (!membro.kickable) {
        return interaction.reply({
          content: "❌ Não consigo expulsar esse usuário. Verifique minhas permissões e a hierarquia de cargos.",
          ephemeral: true,
        });
      }

      await membro.kick(`${motivo} | Responsável: ${interaction.user.tag}`);

      await interaction.reply({
        embeds: [
          embed(
            "👢 Membro expulso",
            `**Usuário:** ${usuario.tag}\n` +
            `**Motivo:** ${motivo}\n` +
            `**Responsável:** ${interaction.user.tag}`,
            0xe67e22
          ),
        ],
      });

      await registrar(
        guild,
        embed(
          "👢 Registro de expulsão",
          `**Usuário:** ${usuario.tag}\n` +
          `**Motivo:** ${motivo}\n` +
          `**Responsável:** ${interaction.user.tag}`
        )
      );

      return;
    }

    if (commandName === "banir") {
      const usuario = interaction.options.getUser("usuario");
      const motivo =
        interaction.options.getString("motivo") || "Não informado";

      const membro = await guild.members.fetch(usuario.id);

      if (!membro.bannable) {
        return interaction.reply({
          content: "❌ Não consigo banir esse usuário. Verifique minhas permissões e a hierarquia de cargos.",
          ephemeral: true,
        });
      }

      await membro.ban({
        reason: `${motivo} | Responsável: ${interaction.user.tag}`,
      });

      await interaction.reply({
        embeds: [
          embed(
            "🔨 Membro banido",
            `**Usuário:** ${usuario.tag}\n` +
            `**Motivo:** ${motivo}\n` +
            `**Responsável:** ${interaction.user.tag}`,
            0xe74c3c
          ),
        ],
      });

      await registrar(
        guild,
        embed(
          "🔨 Registro de banimento",
          `**Usuário:** ${usuario.tag}\n` +
          `**Motivo:** ${motivo}\n` +
          `**Responsável:** ${interaction.user.tag}`
        )
      );

      return;
    }
  } catch (error) {
    console.error(`Erro no comando ${commandName}:`, error);

    const resposta = {
      content: "❌ Ocorreu um erro ao executar o comando. Verifique as permissões e os logs do bot.",
      ephemeral: true,
    };

    if (interaction.replied || interaction.deferred) {
      await interaction.followUp(resposta).catch(() => {});
    } else {
      await interaction.reply(resposta).catch(() => {});
    }
  }
});

client.login(TOKEN);
