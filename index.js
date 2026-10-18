const {
  Client,
  GatewayIntentBits,
  REST,
  Routes,
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags
} = require('discord.js');

const fs = require('node:fs/promises');
const path = require('node:path');

// ============================================
// YSIS MC — BOT MULTIFUNÇÕES
// Créditos: Kuroshi
// ============================================

const {
  DISCORD_TOKEN,
  CLIENT_ID,
  GUILD_ID,
  MINECRAFT_IP,
  WELCOME_CHANNEL_ID,
  GOODBYE_CHANNEL_ID,
  LOG_CHANNEL_ID,
  DATA_DIR = './data'
} = process.env;

const SITE = 'https://bit.ly/YsisMc';
const CREDITOS = 'Kuroshi';
const COR = 0x39a852;
const IP_MINECRAFT = MINECRAFT_IP || 'YSISmc.aternos.me:50061';
const DATA_FILE = path.join(DATA_DIR, 'ysis-data.json');

if (!DISCORD_TOKEN || !CLIENT_ID || !GUILD_ID) {
  console.error(
    'Configure DISCORD_TOKEN, CLIENT_ID e GUILD_ID no Railway.'
  );
  process.exit(1);
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

let data = {
  users: {},
  afk: {},
  repCooldowns: {},
  warnings: {}
};

const xpCooldowns = new Map();
const spamTracker = new Map();

function defaultUser() {
  return {
    xp: 0,
    level: 0,
    coins: 0,
    rep: 0,
    lastDaily: 0,
    lastWork: 0
  };
}

function getUser(userId) {
  if (!data.users[userId]) {
    data.users[userId] = defaultUser();
  }

  return data.users[userId];
}

let saveQueue = Promise.resolve();

async function saveData() {
  saveQueue = saveQueue.then(async () => {
    await fs.mkdir(DATA_DIR, { recursive: true });

    const tempFile = `${DATA_FILE}.tmp`;

    await fs.writeFile(
      tempFile,
      JSON.stringify(data, null, 2),
      'utf8'
    );

    await fs.rename(tempFile, DATA_FILE);
  }).catch(error => {
    console.error('Erro ao salvar os dados:', error.message);
  });

  return saveQueue;
}

async function loadData() {
  try {
    await fs.mkdir(DATA_DIR, { recursive: true });

    const raw = await fs.readFile(DATA_FILE, 'utf8');
    const parsed = JSON.parse(raw);

    data = { ...data, ...parsed };
  } catch (error) {
    if (error.code !== 'ENOENT') {
      console.error('Erro ao carregar dados:', error.message);
    }

    await saveData();
  }
}

function makeEmbed(title, description, color = COR) {
  return new EmbedBuilder()
    .setColor(color)
    .setTitle(title)
    .setDescription(description)
    .setFooter({
      text: `YSIS MC • Créditos: ${CREDITOS}`
    })
    .setTimestamp();
}

function siteButton() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setLabel('Visitar site')
      .setStyle(ButtonStyle.Link)
      .setURL(SITE)
      .setEmoji('🌐')
  );
}

async function sendToChannel(channelId, payload) {
  if (!channelId) return;

  try {
    const channel = await client.channels.fetch(channelId);

    if (
      channel &&
      channel.isTextBased() &&
      typeof channel.send === 'function'
    ) {
      await channel.send(payload);
    }
  } catch (error) {
    console.error('Erro ao enviar mensagem:', error.message);
  }
}

async function logAction(interaction, description) {
  await sendToChannel(LOG_CHANNEL_ID, {
    embeds: [
      makeEmbed(
        '📋 Registro da equipe',
        description,
        0x5865f2
      ).addFields(
        {
          name: 'Responsável',
          value: `${interaction.user.tag} (${interaction.user.id})`
        },
        {
          name: 'Canal',
          value: interaction.channel
            ? `${interaction.channel}`
            : 'Não informado'
        }
      )
    ]
  });
}

function xpRequired(level) {
  return 100 + level * 25;
}

function prettyDuration(ms) {
  const minutes = Math.max(1, Math.ceil(ms / 60000));

  if (minutes < 60) return `${minutes} min`;

  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;

  return rest ? `${hours} h ${rest} min` : `${hours} h`;
}

function safeReason(text) {
  return text?.trim() || 'Não informado';
}

// ============================================
// COMANDOS
// ============================================

const commands = [
  new SlashCommandBuilder()
    .setName('ajuda')
    .setDescription('Veja todos os comandos do YSIS MC'),

  new SlashCommandBuilder()
    .setName('ip')
    .setDescription('Veja o endereço do Minecraft'),

  new SlashCommandBuilder()
    .setName('site')
    .setDescription('Acesse o site oficial'),

  new SlashCommandBuilder()
    .setName('ping')
    .setDescription('Veja a latência do bot'),

  new SlashCommandBuilder()
    .setName('avatar')
    .setDescription('Mostre o avatar de alguém')
    .addUserOption(o =>
      o.setName('membro')
        .setDescription('Pessoa')
        .setRequired(false)
    ),

  new SlashCommandBuilder()
    .setName('usuario')
    .setDescription('Informações de um membro')
    .addUserOption(o =>
      o.setName('membro')
        .setDescription('Pessoa')
        .setRequired(false)
    ),

  new SlashCommandBuilder()
    .setName('servidor')
    .setDescription('Informações do servidor Discord'),

  new SlashCommandBuilder()
    .setName('perfil')
    .setDescription('Veja seu perfil social')
    .addUserOption(o =>
      o.setName('membro')
        .setDescription('Pessoa')
        .setRequired(false)
    ),

  new SlashCommandBuilder()
    .setName('rank')
    .setDescription('Veja seu nível')
    .addUserOption(o =>
      o.setName('membro')
        .setDescription('Pessoa')
        .setRequired(false)
    ),

  new SlashCommandBuilder()
    .setName('daily')
    .setDescription('Resgate moedas diariamente'),

  new SlashCommandBuilder()
    .setName('saldo')
    .setDescription('Veja seu saldo')
    .addUserOption(o =>
      o.setName('membro')
        .setDescription('Pessoa')
        .setRequired(false)
    ),

  new SlashCommandBuilder()
    .setName('trabalhar')
    .setDescription('Trabalhe para ganhar moedas'),

  new SlashCommandBuilder()
    .setName('rep')
    .setDescription('Dê reputação a alguém')
    .addUserOption(o =>
      o.setName('membro')
        .setDescription('Quem merece reputação?')
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName('afk')
    .setDescription('Defina seu status AFK')
    .addStringOption(o =>
      o.setName('motivo')
        .setDescription('Motivo')
        .setMaxLength(200)
        .setRequired(false)
    ),

  new SlashCommandBuilder()
    .setName('banho')
    .setDescription('Mande alguém tomar banho')
    .addUserOption(o =>
      o.setName('membro')
        .setDescription('Quem precisa de banho?')
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName('moeda')
    .setDescription('Jogue cara ou coroa'),

  new SlashCommandBuilder()
    .setName('bolamagica')
    .setDescription('Pergunte à bola mágica')
    .addStringOption(o =>
      o.setName('pergunta')
        .setDescription('Sua pergunta')
        .setMaxLength(300)
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName('abraco')
    .setDescription('Mande um abraço')
    .addUserOption(o =>
      o.setName('membro')
        .setDescription('Quem vai receber?')
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName('ship')
    .setDescription('Calcule a compatibilidade')
    .addUserOption(o =>
      o.setName('pessoa1')
        .setDescription('Primeira pessoa')
        .setRequired(true)
    )
    .addUserOption(o =>
      o.setName('pessoa2')
        .setDescription('Segunda pessoa')
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName('enquete')
    .setDescription('Crie uma enquete')
    .addStringOption(o =>
      o.setName('pergunta')
        .setDescription('Pergunta')
        .setMaxLength(250)
        .setRequired(true)
    )
    .addStringOption(o =>
      o.setName('opcao1')
        .setDescription('Primeira opção')
        .setMaxLength(80)
        .setRequired(true)
    )
    .addStringOption(o =>
      o.setName('opcao2')
        .setDescription('Segunda opção')
        .setMaxLength(80)
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName('anunciar')
    .setDescription('Envie um anúncio')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addStringOption(o =>
      o.setName('mensagem')
        .setDescription('Texto do anúncio')
        .setMaxLength(1800)
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName('dizer')
    .setDescription('Envie uma mensagem pelo bot')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .addStringOption(o =>
      o.setName('mensagem')
        .setDescription('Mensagem')
        .setMaxLength(1800)
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName('aviso')
    .setDescription('Registre um aviso')
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addUserOption(o =>
      o.setName('membro')
        .setDescription('Membro')
        .setRequired(true)
    )
    .addStringOption(o =>
      o.setName('motivo')
        .setDescription('Motivo')
        .setMaxLength(500)
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName('avisos')
    .setDescription('Veja os avisos de um membro')
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addUserOption(o =>
      o.setName('membro')
        .setDescription('Membro')
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName('limpar')
    .setDescription('Apague mensagens recentes')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .addIntegerOption(o =>
      o.setName('quantidade')
        .setDescription('Quantidade entre 1 e 100')
        .setMinValue(1)
        .setMaxValue(100)
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName('kick')
    .setDescription('Expulse um membro')
    .setDefaultMemberPermissions(PermissionFlagsBits.KickMembers)
    .addUserOption(o =>
      o.setName('membro')
        .setDescription('Membro')
        .setRequired(true)
    )
    .addStringOption(o =>
      o.setName('motivo')
        .setDescription('Motivo')
        .setMaxLength(500)
        .setRequired(false)
    ),

  new SlashCommandBuilder()
    .setName('ban')
    .setDescription('Bane um membro')
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
    .addUserOption(o =>
      o.setName('membro')
        .setDescription('Membro')
        .setRequired(true)
    )
    .addStringOption(o =>
      o.setName('motivo')
        .setDescription('Motivo')
        .setMaxLength(500)
        .setRequired(false)
    ),

  new SlashCommandBuilder()
    .setName('timeout')
    .setDescription('Silencie temporariamente um membro')
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addUserOption(o =>
      o.setName('membro')
        .setDescription('Membro')
        .setRequired(true)
    )
    .addIntegerOption(o =>
      o.setName('minutos')
        .setDescription('Duração em minutos')
        .setMinValue(1)
        .setMaxValue(40320)
        .setRequired(true)
    )
    .addStringOption(o =>
      o.setName('motivo')
        .setDescription('Motivo')
        .setMaxLength(500)
        .setRequired(false)
    ),

  new SlashCommandBuilder()
    .setName('untimeout')
    .setDescription('Retire o silêncio de um membro')
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addUserOption(o =>
      o.setName('membro')
        .setDescription('Membro')
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName('slowmode')
    .setDescription('Configure o modo lento do canal')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
    .addIntegerOption(o =>
      o.setName('segundos')
        .setDescription('0 a 21600 segundos')
        .setMinValue(0)
        .setMaxValue(21600)
        .setRequired(true)
    )
].map(command => command.toJSON());

// ============================================
// INICIALIZAÇÃO
// ============================================

client.once('ready', async () => {
  console.log(`YSIS MC online como ${client.user.tag}`);

  try {
    const rest = new REST({ version: '10' }).setToken(DISCORD_TOKEN);

    await rest.put(
      Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID),
      { body: commands }
    );

    console.log(`${commands.length} comandos registrados.`);
  } catch (error) {
    console.error('Erro ao registrar comandos:', error);
  }
});

// ============================================
// ENTRADAS E SAÍDAS
// ============================================

client.on('guildMemberAdd', async member => {
  await sendToChannel(WELCOME_CHANNEL_ID, {
    embeds: [
      makeEmbed(
        '🌌 Um novo jogador chegou!',
        `Bem-vindo ao **YSIS MC**, ${member}!\n\n` +
        '⛏️ Explore, construa sua base e faça história!\n' +
        `🎮 Você é o membro número **${member.guild.memberCount}**.`
      ).setThumbnail(member.user.displayAvatarURL())
    ],
    components: [siteButton()]
  });

  await sendToChannel(LOG_CHANNEL_ID,
    `📥 Entrada: **${member.user.tag}** (\`${member.id}\`)`
  );
});

client.on('guildMemberRemove', async member => {
  await sendToChannel(GOODBYE_CHANNEL_ID, {
    embeds: [
      makeEmbed(
        '🚪 Um jogador saiu do mundo',
        `**${member.user.tag}** saiu do servidor YSIS MC.`,
        0xe67e22
      )
    ]
  });

  await sendToChannel(LOG_CHANNEL_ID,
    `📤 Saída: **${member.user.tag}** (\`${member.id}\`)`
  );
});

// ============================================
// XP, NÍVEIS, AFK E ALERTA DE SPAM
// ============================================

client.on('messageCreate', async message => {
  if (!message.guild || message.author.bot) return;

  const now = Date.now();

  if (data.afk[message.author.id]) {
    delete data.afk[message.author.id];
    await saveData();

    await message.reply(
      '👋 Seu status AFK foi removido. Bem-vindo de volta!'
    ).catch(() => {});
  }

  for (const mentioned of message.mentions.users.values()) {
    if (mentioned.bot || mentioned.id === message.author.id) continue;

    const afk = data.afk[mentioned.id];

    if (afk) {
      await message.reply(
        `💤 **${mentioned.username}** está AFK: ${afk.reason}\n` +
        `Desde: <t:${Math.floor(afk.since / 1000)}:R>`
      ).catch(() => {});

      break;
    }
  }

  const lastXp = xpCooldowns.get(message.author.id) || 0;

  if (now - lastXp >= 60000) {
    xpCooldowns.set(message.author.id, now);

    const memberData = getUser(message.author.id);

    memberData.xp += 5 + Math.floor(Math.random() * 11);

    let leveledUp = false;

    while (memberData.xp >= xpRequired(memberData.level)) {
      memberData.xp -= xpRequired(memberData.level);
      memberData.level += 1;
      memberData.coins += 50;
      leveledUp = true;
    }

    await saveData();

    if (leveledUp) {
      await message.channel.send(
        `✨ Parabéns ${message.author}! Você chegou ao ` +
        `**nível ${memberData.level}** e ganhou 🪙 50 moedas!`
      ).catch(() => {});
    }
  }

  const recent = (spamTracker.get(message.author.id) || [])
    .filter(timestamp => now - timestamp < 6000);

  recent.push(now);
  spamTracker.set(message.author.id, recent);

  if (recent.length === 7) {
    await sendToChannel(
      LOG_CHANNEL_ID,
      `🚨 Possível spam de ${message.author.tag} em ${message.channel} ` +
      '(7 mensagens em 6 segundos).'
    );
  }
});

// ============================================
// INTERAÇÕES
// ============================================

client.on('interactionCreate', async interaction => {
  if (!interaction.isChatInputCommand()) return;

  const cmd = interaction.commandName;
  const user = interaction.user;

  try {
    if (cmd === 'ajuda') {
      return interaction.reply({
        embeds: [
          makeEmbed(
            '⛏️ YSIS MC | Central de comandos',
            '**🌐 SERVIDOR**\n' +
            '`/ip` `/site` `/ajuda` `/ping`\n\n' +
            '**👤 PERFIL E UTILIDADES**\n' +
            '`/perfil` `/rank` `/saldo` `/daily` `/trabalhar` ' +
            '`/rep` `/afk` `/avatar` `/usuario` `/servidor`\n\n' +
            '**😂 DIVERSÃO**\n' +
            '`/banho` `/moeda` `/bolamagica` `/abraco` `/ship` `/enquete`\n\n' +
            '**🛡️ MODERAÇÃO**\n' +
            '`/aviso` `/avisos` `/limpar` `/kick` `/ban` ' +
            '`/timeout` `/untimeout` `/slowmode` `/anunciar` `/dizer`'
          )
        ],
        components: [siteButton()],
        flags: MessageFlags.Ephemeral
      });
    }

    if (cmd === 'ip') {
      return interaction.reply({
        embeds: [
          makeEmbed(
            '🎮 Servidor Minecraft YSIS MC',
            `**Endereço:** \`${IP_MINECRAFT}\`\n\n` +
            '⛏️ Prepare sua picareta e venha jogar!'
          )
        ],
        components: [siteButton()],
        flags: MessageFlags.Ephemeral
      });
    }

    if (cmd === 'site') {
      return interaction.reply({
        embeds: [
          makeEmbed(
            '🌐 Site oficial do YSIS MC',
            `Acesse o site do projeto!\n\n[**Abrir site**](${SITE})\n\n` +
            `✍️ **Créditos:** ${CREDITOS}`
          )
        ],
        components: [siteButton()]
      });
    }

    if (cmd === 'ping') {
      return interaction.reply({
        embeds: [
          makeEmbed(
            '🏓 Pong!',
            `Latência do bot: **${client.ws.ping} ms**\n` +
            `Resposta: **${Date.now() - interaction.createdTimestamp} ms**`
          )
        ],
        flags: MessageFlags.Ephemeral
      });
    }

    if (cmd === 'avatar') {
      const target = interaction.options.getUser('membro') || user;
      const url = target.displayAvatarURL({ size: 1024 });

      return interaction.reply({
        embeds: [
          makeEmbed(
            `🖼️ Avatar de ${target.username}`,
            `[Abrir imagem](${url})`
          ).setImage(url)
        ]
      });
    }

    if (cmd === 'usuario') {
      const target = interaction.options.getUser('membro') || user;
      const member = await interaction.guild.members
        .fetch(target.id).catch(() => null);

      const fields = [
        { name: 'Nome', value: target.tag, inline: true },
        { name: 'ID', value: target.id, inline: true },
        {
          name: 'Conta criada',
          value: `<t:${Math.floor(target.createdTimestamp / 1000)}:D>`,
          inline: true
        }
      ];

      if (member?.joinedTimestamp) {
        fields.push({
          name: 'Entrou no servidor',
          value: `<t:${Math.floor(member.joinedTimestamp / 1000)}:D>`,
          inline: true
        });
      }

      return interaction.reply({
        embeds: [
          makeEmbed('👤 Informações do usuário', `Informações de ${target}.`)
            .addFields(fields)
            .setThumbnail(target.displayAvatarURL())
        ]
      });
    }

    if (cmd === 'servidor') {
      const guild = interaction.guild;
      const embed = makeEmbed(
        `🏰 ${guild.name}`,
        `**Dono:** <@${guild.ownerId}>\n` +
        `**Membros:** ${guild.memberCount}\n` +
        `**Canais:** ${guild.channels.cache.size}\n` +
        `**Criado em:** <t:${Math.floor(guild.createdTimestamp / 1000)}:D>`,
        0x5865f2
      );

      const icon = guild.iconURL({ size: 512 });
      if (icon) embed.setThumbnail(icon);

      return interaction.reply({ embeds: [embed] });
    }

    if (cmd === 'perfil' || cmd === 'rank') {
      const target = interaction.options.getUser('membro') || user;
      const memberData = getUser(target.id);
      const needed = xpRequired(memberData.level);
      const progress = Math.floor((memberData.xp / needed) * 100);

      await saveData();

      return interaction.reply({
        embeds: [
          makeE
