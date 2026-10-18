const {
  Client,
  GatewayIntentBits,
  SlashCommandBuilder,
  REST,
  Routes,
  EmbedBuilder,
  PermissionFlagsBits,
  ChannelType,
} = require("discord.js");

const fs = require("node:fs");
const path = require("node:path");

// ==========================================
// CONFIGURAÇÃO DO YSIS MC
// ==========================================

const TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const GUILD_ID = process.env.GUILD_ID;

const IP = process.env.MINECRAFT_IP || "YSISmc.aternos.me";
const PORT = process.env.MINECRAFT_PORT || "50061";
const SITE = process.env.SITE_URL || "https://bit.ly/YsisMc";
const ATERNOS = process.env.ATERNOS_URL || "https://aternos.org/server/";

const WELCOME_CHANNEL_ID = process.env.WELCOME_CHANNEL_ID;
const GOODBYE_CHANNEL_ID = process.env.GOODBYE_CHANNEL_ID;

if (!TOKEN || !CLIENT_ID || !GUILD_ID) {
  console.error(
    "ERRO: configure DISCORD_TOKEN, CLIENT_ID e GUILD_ID nas variáveis de ambiente."
  );
  process.exit(1);
}

// ==========================================
// BANCO DE DADOS EM JSON
// ==========================================

const DATA_FILE = path.join(process.cwd(), "ysis-data.json");

let data = {
  users: {},
  warns: {},
};

try {
  if (fs.existsSync(DATA_FILE)) {
    const carregado = JSON.parse(
      fs.readFileSync(DATA_FILE, "utf8")
    );

    data = {
      users: carregado.users || {},
      warns: carregado.warns || {},
    };
  }
} catch (error) {
  console.error("Erro ao carregar banco de dados:", error);
}

function salvarDados() {
  try {
    fs.writeFileSync(
      DATA_FILE,
      JSON.stringify(data, null, 2),
      "utf8"
    );
  } catch (error) {
    console.error("Erro ao salvar dados:", error);
  }
}

function obterUsuario(id) {
  if (!data.users[id]) {
    data.users[id] = {
      coins: 100,
      bank: 0,
      inventory: [],
      xp: 0,
      lastDaily: 0,
      lastWork: 0,
      lastAdventure: 0,
      lastFish: 0,
      lastXP: 0,
    };
  }

  const user = data.users[id];

  if (typeof user.coins !== "number") user.coins = 100;
  if (typeof user.bank !== "number") user.bank = 0;
  if (!Array.isArray(user.inventory)) user.inventory = [];
  if (typeof user.xp !== "number") user.xp = 0;

  user.lastDaily ||= 0;
  user.lastWork ||= 0;
  user.lastAdventure ||= 0;
  user.lastFish ||= 0;
  user.lastXP ||= 0;

  return user;
}

function numeroAleatorio(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function formatarTempo(ms) {
  const minutos = Math.ceil(ms / 60000);
  const horas = Math.floor(minutos / 60);
  const resto = minutos % 60;

  if (horas > 0) return `${horas}h ${resto}min`;
  return `${resto}min`;
}

function criarEmbed(titulo, descricao) {
  return new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle(titulo)
    .setDescription(descricao)
    .setFooter({ text: "YSIS MC • Créditos: Kuroshi" })
    .setTimestamp();
}

function barraProgresso(atual, total) {
  const tamanho = 10;
  const porcentagem = total > 0 ? atual / total : 0;
  const preenchidos = Math.max(
    0,
    Math.min(tamanho, Math.floor(porcentagem * tamanho))
  );

  return "🟦".repeat(preenchidos) +
    "⬛".repeat(tamanho - preenchidos);
}

function nivelDo(xp) {
  return Math.floor(Math.sqrt(Math.max(0, xp) / 100));
}

// ==========================================
// LOJA DO YSIS MC
// ==========================================

const loja = {
  cafe: {
    nome: "Café",
    emoji: "☕",
    preco: 15,
    descricao: "Um café para recuperar a energia.",
    unico: false,
  },
  espada: {
    nome: "Espada",
    emoji: "⚔️",
    preco: 150,
    descricao: "Uma espada para sua coleção.",
    unico: true,
  },
  picareta: {
    nome: "Picareta",
    emoji: "⛏️",
    preco: 120,
    descricao: "Uma ferramenta para mineradores.",
    unico: true,
  },
  escudo: {
    nome: "Escudo",
    emoji: "🛡️",
    preco: 100,
    descricao: "Um escudo para sua coleção.",
    unico: true,
  },
  diamante: {
    nome: "Diamante",
    emoji: "💎",
    preco: 200,
    descricao: "Um diamante valioso.",
    unico: false,
  },
  peixe: {
    nome: "Peixe",
    emoji: "🐟",
    preco: 30,
    descricao: "Um peixe pescado durante suas aventuras.",
    unico: false,
  },
};

function nomeItem(item) {
  return loja[item]?.nome || item;
}

// ==========================================
// COMANDOS SLASH
// ==========================================

const comandos = [
  // GERAIS
  new SlashCommandBuilder()
    .setName("ajuda")
    .setDescription("Veja os comandos do YSIS MC."),

  new SlashCommandBuilder()
    .setName("ip")
    .setDescription("Veja o IP do servidor Minecraft."),

  new SlashCommandBuilder()
    .setName("site")
    .setDescription("Veja o site do YSIS MC."),

  new SlashCommandBuilder()
    .setName("servidor")
    .setDescription("Veja informações deste servidor do Discord."),

  new SlashCommandBuilder()
    .setName("avatar")
    .setDescription("Veja o avatar de alguém.")
    .addUserOption(o =>
      o.setName("usuario")
        .setDescription("Pessoa que você quer ver.")
        .setRequired(false)
    ),

  new SlashCommandBuilder()
    .setName("perfil")
    .setDescription("Veja seu perfil, saldo e nível.")
    .addUserOption(o =>
      o.setName("usuario")
        .setDescription("Perfil que você quer consultar.")
        .setRequired(false)
    ),

  // ECONOMIA
  new SlashCommandBuilder()
    .setName("daily")
    .setDescription("Receba suas moedas diárias."),

  new SlashCommandBuilder()
    .setName("saldo")
    .setDescription("Veja seu saldo de moedas.")
    .addUserOption(o =>
      o.setName("usuario")
        .setDescription("Saldo de outra pessoa.")
        .setRequired(false)
    ),

  new SlashCommandBuilder()
    .setName("trabalhar")
    .setDescription("Trabalhe para ganhar moedas."),

  new SlashCommandBuilder()
    .setName("pagar")
    .setDescription("Envie moedas para outra pessoa.")
    .addUserOption(o =>
      o.setName("usuario")
        .setDescription("Quem vai receber.")
        .setRequired(true)
    )
    .addIntegerOption(o =>
      o.setName("quantia")
        .setDescription("Quantidade de moedas.")
        .setMinValue(1)
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("top")
    .setDescription("Veja o ranking de moedas do servidor."),

  new SlashCommandBuilder()
    .setName("apostar")
    .setDescription("Aposte suas moedas e tente dobrá-las.")
    .addIntegerOption(o =>
      o.setName("quantia")
        .setDescription("Quantidade que deseja apostar.")
        .setMinValue(1)
        .setRequired(true)
    ),

  // LOJA
  new SlashCommandBuilder()
    .setName("loja")
    .setDescription("Veja os itens disponíveis para compra."),

  new SlashCommandBuilder()
    .setName("comprar")
    .setDescription("Compre um item na loja.")
    .addStringOption(o =>
      o.setName("item")
        .setDescription("Item que deseja comprar.")
        .setRequired(true)
        .addChoices(
          { name: "☕ Café — 15 moedas", value: "cafe" },
          { name: "⚔️ Espada — 150 moedas", value: "espada" },
          { name: "⛏️ Picareta — 120 moedas", value: "picareta" },
          { name: "🛡️ Escudo — 100 moedas", value: "escudo" },
          { name: "💎 Diamante — 200 moedas", value: "diamante" }
        )
    ),

  new SlashCommandBuilder()
    .setName("inventario")
    .setDescription("Veja os itens do seu inventário.")
    .addUserOption(o =>
      o.setName("usuario")
        .setDescription("Inventário de outra pessoa.")
        .setRequired(false)
    ),

  new SlashCommandBuilder()
    .setName("vender")
    .setDescription("Venda um item do seu inventário.")
    .addStringOption(o =>
      o.setName("item")
        .setDescription("Item que deseja vender.")
        .setRequired(true)
        .addChoices(
          { name: "☕ Café", value: "cafe" },
          { name: "⚔️ Espada", value: "espada" },
          { name: "⛏️ Picareta", value: "picareta" },
          { name: "🛡️ Escudo", value: "escudo" },
          { name: "💎 Diamante", value: "diamante" },
          { name: "🐟 Peixe", value: "peixe" }
        )
    ),

  new SlashCommandBuilder()
    .setName("pescar")
    .setDescription("Pesque peixes e ganhe recompensas."),

  new SlashCommandBuilder()
    .setName("aventura")
    .setDescription("Explore o mundo e encontre recompensas."),

  // DIVERSÃO
  new SlashCommandBuilder()
    .setName("moeda")
    .setDescription("Jogue uma moeda para o alto."),

  new SlashCommandBuilder()
    .setName("dado")
    .setDescription("Role um dado de seis lados."),

  new SlashCommandBuilder()
    .setName("pergunta")
    .setDescription("Faça uma pergunta para a bola mágica.")
    .addStringOption(o =>
      o.setName("texto")
        .setDescription("Sua pergunta.")
        .setMaxLength(300)
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("ship")
    .setDescription("Veja a porcentagem de compatibilidade.")
    .addUserOption(o =>
      o.setName("pessoa1")
        .setDescription("Primeira pessoa.")
        .setRequired(true)
    )
    .addUserOption(o =>
      o.setName("pessoa2")
        .setDescription("Segunda pessoa.")
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("banho")
    .setDescription("Dê um banho em alguém.")
    .addUserOption(o =>
      o.setName("usuario")
        .setDescription("Quem vai tomar banho.")
        .setRequired(false)
    ),

  // MODERAÇÃO
  new SlashCommandBuilder()
    .setName("limpar")
    .setDescription("Apague mensagens do canal.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .addIntegerOption(o =>
      o.setName("quantidade")
        .setDescription("Quantidade de mensagens, de 1 a 100.")
        .setMinValue(1)
        .setMaxValue(100)
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("expulsar")
    .setDescription("Expulse uma pessoa do servidor.")
    .setDefaultMemberPermissions(PermissionFlagsBits.KickMembers)
    .addUserOption(o =>
      o.setName("usuario")
        .setDescription("Pessoa que será expulsa.")
        .setRequired(true)
    )
    .addStringOption(o =>
      o.setName("motivo")
        .setDescription("Motivo da expulsão.")
        .setMaxLength(500)
        .setRequired(false)
    ),

  new SlashCommandBuilder()
    .setName("banir")
    .setDescription("Bane uma pessoa do servidor.")
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
    .addUserOption(o =>
      o.setName("usuario")
        .setDescription("Pessoa que será banida.")
        .setRequired(true)
    )
    .addStringOption(o =>
      o.setName("motivo")
        .setDescription("Motivo do banimento.")
        .setMaxLength(500)
        .setRequired(false)
    ),

  new SlashCommandBuilder()
    .setName("timeout")
    .setDescription("Silencie temporariamente um membro.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addUserOption(o =>
      o.setName("usuario")
        .setDescription("Membro que será silenciado.")
        .setRequired(true)
    )
    .addIntegerOption(o =>
      o.setName("minutos")
        .setDescription("Duração em minutos, até 28 dias.")
        .setMinValue(1)
        .setMaxValue(40320)
        .setRequired(true)
    )
    .addStringOption(o =>
      o.setName("motivo")
        .setDescription("Motivo do silêncio.")
        .setMaxLength(500)
        .setRequired(false)
    ),

  new SlashCommandBuilder()
    .setName("avisar")
    .setDescription("Registre uma advertência para um membro.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addUserOption(o =>
      o.setName("usuario")
        .setDescription("Membro que receberá a advertência.")
        .setRequired(true)
    )
    .addStringOption(o =>
      o.setName("motivo")
        .setDescription("Motivo da advertência.")
        .setMaxLength(500)
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("avisos")
    .setDescription("Consulte as advertências de um membro.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addUserOption(o =>
      o.setName("usuario")
        .setDescription("Membro que deseja consultar.")
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("limparavisos")
    .setDescription("Apague as advertências de um membro.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addUserOption(o =>
      o.setName("usuario")
        .setDescription("Membro que terá os avisos apagados.")
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("lock")
    .setDescription("Bloqueie o envio de mensagens neste canal.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),

  new SlashCommandBuilder()
    .setName("unlock")
    .setDescription("Libere o envio de mensagens neste canal.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),

  new SlashCommandBuilder()
    .setName("dizer")
    .setDescription("Faça o bot enviar uma mensagem.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .addStringOption(o =>
      o.setName("texto")
        .setDescription("Mensagem que será enviada.")
        .setMaxLength(1800)
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("anunciar")
    .setDescription("Publique um anúncio em um canal.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .addStringOption(o =>
      o.setName("titulo")
        .setDescription("Título do anúncio.")
        .setMaxLength(200)
        .setRequired(true)
    )
    .addStringOption(o =>
      o.setName("texto")
        .setDescription("Conteúdo do anúncio.")
        .setMaxLength(3500)
        .setRequired(true)
    )
    .addChannelOption(o =>
      o.setName("canal")
        .setDescription("Canal onde será publicado.")
        .addChannelTypes(ChannelType.GuildText)
        .setRequired(false)
    ),

  // TICKETS
  new SlashCommandBuilder()
    .setName("ticket")
    .setDescription("Abra um canal privado de atendimento."),

  new SlashCommandBuilder()
    .setName("fecharticket")
    .setDescription("Feche o ticket atual."),
];

// ==========================================
// CLIENTE DO DISCORD
// ==========================================

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
  ],
});

// ==========================================
// REGISTRAR COMANDOS
// ==========================================

client.once("ready", async () => {
  console.log(`✅ ${client.user.tag} está online!`);

  try {
    const rest = new REST({ version: "10" }).setToken(TOKEN);

    await rest.put(
      Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID),
      { body: comandos.map(c => c.toJSON()) }
    );

    console.log(`✅ ${comandos.length} comandos registrados.`);
  } catch (error) {
    console.error("Erro ao registrar comandos:", error);
  }
});

// ==========================================
// BOAS-VINDAS E DESPEDIDA
// ==========================================

client.on("guildMemberAdd", async membro => {
  try {
    const canal =
      (WELCOME_CHANNEL_ID &&
        membro.guild.channels.cache.get(WELCOME_CHANNEL_ID)) ||
      membro.guild.systemChannel;

    if (!canal || !canal.isTextBased()) return;

    const embed = criarEmbed(
      "👋 Bem-vindo ao YSIS MC!",
      `Olá, ${membro}! Seja bem-vindo(a) ao **${membro.guild.name}**!\n\n` +
      `🎮 Entre no nosso Minecraft: **${IP}:${PORT}**\n` +
      `🌐 Site: ${SITE}\n` +
      `📜 Leia as regras e divirta-se!`
    ).setThumbnail(membro.user.displayAvatarURL());

    await canal.send({ embeds: [embed] });
  } catch (error) {
    console.error("Erro na mensagem de boas-vindas:", error);
  }
});

client.on("guildMemberRemove", async membro => {
  try {
    const canal =
      (GOODBYE_CHANNEL_ID &&
        membro.guild.channels.cache.get(GOODBYE_CHANNEL_ID)) ||
      membro.guild.systemChannel;

    if (!canal || !canal.isTextBased()) return;

    await canal.send(
      `👋 **${membro.user.username}** saiu do servidor. Até a próxima!`
    );
  } catch (error) {
    console.error("Erro na mensagem de despedida:", error);
  }
});

// ==========================================
// XP AUTOMÁTICO POR MENSAGENS
// ==========================================

client.on("messageCreate", async message => {
  if (!message.guild || message.author.bot) return;

  const user = obterUsuario(message.author.id);
  const agora = Date.now();

  // Só ganha XP uma vez a cada 60 segundos.
  if (agora - user.lastXP < 60000) return;

  const nivelAntigo = nivelDo(user.xp);

  user.xp += numeroAleatorio(8, 15);
  user.lastXP = agora;

  const nivelNovo = nivelDo(user.xp);

  salvarDados();

  if (nivelNovo > nivelAntigo) {
    try {
      await message.channel.send(
        `🎉 Parabéns, ${message.author}! Você alcançou o **nível ${nivelNovo}**!`
      );
    } catch (error) {
      console.error("Erro ao enviar mensagem de nível:", error);
    }
  }
});

// ==========================================
// INTERAÇÕES DOS COMANDOS
// ==========================================

client.on("interactionCreate", async interaction => {
  if (!interaction.isChatInputCommand()) return;

  const cmd = interaction.commandName;
  const agora = Date.now();

  try {
    // --------------------------------------
    // AJUDA
    // --------------------------------------

    if (cmd === "ajuda") {
      const embed = criarEmbed(
        "📚 Central de comandos — YSIS MC",
        "Veja as funções disponíveis para você."
      )
        .addFields(
          {
            name: "🌐 Geral",
            value:
              "`/ip` `/site` `/servidor` `/avatar` `/perfil` `/ajuda`",
          },
          {
            name: "💰 Economia",
            value:
              "`/daily` `/saldo` `/trabalhar` `/pagar` `/top` `/apostar`",
          },
          {
            name: "🛒 Loja e aventuras",
            value:
              "`/loja` `/comprar` `/inventario` `/vender` `/pescar` `/aventura`",
          },
          {
            name: "🎉 Diversão",
            value:
              "`/moeda` `/dado` `/pergunta` `/ship` `/banho`",
          },
          {
            name: "🛡️ Moderação",
            value:
              "`/limpar` `/expulsar` `/banir` `/timeout` `/avisar` `/avisos` `/limparavisos` `/lock` `/unlock` `/dizer` `/anunciar`",
          },
          {
            name: "🎫 Atendimento",
            value: "`/ticket` `/fecharticket`",
          }
        );

      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    // --------------------------------------
    // INFORMAÇÕES
    // --------------------------------------

    if (cmd === "ip") {
      const embed = criarEmbed(
        "⛏️ IP do YSIS MC",
        `**Endereço:** \`${IP}\`\n**Porta:** \`${PORT}\`\n\n` +
        `📌 Se o servidor não estiver disponível, confira o painel do Aternos:\n${ATERNOS}`
      );

      return interaction.reply({ embeds: [embed] });
    }

    if (cmd === "site") {
      return interaction.reply({
        embeds: [
          criarEmbed(
            "🌐 Site do YSIS MC",
            `Acesse nosso site:\n${SITE}`
          ),
        ],
      });
    }

    if (cmd === "servidor") {
      const guild = interaction.guild;

      const embed = criarEmbed(
        `🌍 ${guild.name}`,
        `**Membros:** ${guild.memberCount}\n` +
        `**Criado em:** <t:${Math.floor(guild.createdTimestamp / 1000)}:D>\n` +
        `**Dono:** <@${guild.ownerId}>`
      );

      if (guild.iconURL()) {
        embed.setThumbnail(guild.iconURL());
      }

      return interaction.reply({ embeds: [embed] });
    }

    if (cmd === "avatar") {
      const usuario =
        interaction.options.getUser("usuario") || interaction.user;
