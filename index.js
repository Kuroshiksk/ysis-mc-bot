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

// ============================================================
// YSIS MC — BOT MULTIFUNÇÕES
// Créditos: Kuroshi
// ============================================================

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
  console.error('Configure DISCORD_TOKEN, CLIENT_ID e GUILD_ID no Railway.');
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
  if (!data.users[userId]) data.users[userId] = defaultUser();
  return data.users[userId];
}

let saveQueue = Promise.resolve();

async function loadData() {
  try {
    await fs.mkdir(DATA_DIR, { recursive: true });
    const raw = await fs.readFile(DATA_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    data = { ...data, ...parsed };
  } catch (error) {
    if (error.code !== 'ENOENT') {
      console.error('Erro ao ler dados:', error.message);
    }
    await saveData();
  }
}

function saveData() {
  saveQueue = saveQueue
    .then(async () => {
      await fs.mkdir(DATA_DIR, { recursive: true });
      const tempFile = `${DATA_FILE}.tmp`;

      await fs.writeFile(
        tempFile,
        JSON.stringify(data, null, 2),
        'utf8'
      );

      await fs.rename(tempFile, DATA_FILE);
    })
    .catch(error => {
      console.error('Erro ao salvar dados:', error.message);
    });

  return saveQueue;
}

function makeEmbed(title, description, color = COR) {
  return new EmbedBuilder()
    .setColor(color)
    .setTitle(title)
    .setDescription(description)
    .setFooter({ text: `YSIS MC • Créditos: ${CREDITOS}` })
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
    console.error(`Erro no canal ${channelId}:`, error.message);
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
          value: `${interaction.user.tag} (\`${interaction.user.id}\`)`
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

function safeReason(text, fallback = 'Não informado') {
  return text?.trim() || fallback;
}

// ============================================================
// COMANDOS
// ============================================================

const commands = [
  new SlashCommandBuilder()
    .setName('ajuda')
    .setDescription('Veja todos os comandos do YSIS MC'),

  new SlashCommandBuilder()
    .setName('ip')
    .setDescription('Veja o endereço do servidor Minecraft'),

  new SlashCommandBuilder()
    .setName('site')
    .setDescription('Acesse o site oficial do YSIS MC'),

  new SlashCommandBuilder()
    .setName('ping')
    .setDescription('Veja a latência do bot'),

  new SlashCommandBuilder()
    .setName('avatar')
    .setDescription('Mostra o avatar de alguém')
    .addUserOption(o =>
      o.setName('membro')
        .setDescription('Pessoa (opcional)')
        .setRequired(false)
    ),

  new SlashCommandBuilder()
    .setName('usuario')
    .setDescription('Veja informações de um membro')
    .addUserOption(o =>
      o.setName('membro')
        .setDescription('Pessoa (opcional)')
        .setRequired(false)
    ),

  new SlashCommandBuilder()
    .setName('servidor')
    .setDescription('Veja informações deste servidor'),

  new SlashCommandBuilder()
    .setName('perfil')
    .setDescription('Veja seu perfil social e nível')
    .addUserOption(o =>
      o.setName('membro')
        .setDescription('Pessoa (opcional)')
        .setRequired(false)
    ),

  new SlashCommandBuilder()
    .setName('rank')
    .setDescription('Veja seu nível e progresso')
    .addUserOption(o =>
      o.setName('membro')
        .setDescription('Pessoa (opcional)')
        .setRequired(false)
    ),

  new SlashCommandBuilder()
    .setName('daily')
    .setDescription('Resgate sua recompensa diária'),

  new SlashCommandBuilder()
    .setName('saldo')
    .setDescription('Veja seu saldo ou o de alguém')
    .addUserOption(o =>
      o.setName('membro')
        .setDescription('Pessoa (opcional)')
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
        .setDescription('Motivo (opcional)')
        .setRequired(false)
        .setMaxLength(200)
    ),

  new SlashCommandBuilder()
    .setName('banho')
    .setDescription('Mande alguém tomar um banho 😂')
    .addUserOption(o =>
      o.setName('membro')
        .setDescription('Quem precisa de um banho?')
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
        .setRequired(true)
        .setMaxLength(300)
    ),

  new SlashCommandBuilder()
    .setName('abraco')
    .setDescription('Mande um abraço para alguém')
    .addUserOption(o =>
      o.setName('membro')
        .setDescription('Quem vai receber?')
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName('ship')
    .setDescription('Calcule a compatibilidade de duas pessoas')
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
    .setDescription('Crie uma enquete com duas opções')
    .addStringOption(o =>
      o.setName('pergunta')
        .setDescription('Pergunta da enquete')
        .setRequired(true)
        .setMaxLength(250)
    )
    .addStringOption(o =>
      o.setName('opcao1')
        .setDescription('Primeira opção')
        .setRequired(true)
        .setMaxLength(80)
    )
    .addStringOption(o =>
      o.setName('opcao2')
        .setDescription('Segunda opção')
        .setRequired(true)
        .setMaxLength(80)
    ),

  new SlashCommandBuilder()
    .setName('anunciar')
    .setDescription('Envie um anúncio no canal atual')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addStringOption(o =>
      o.setName('mensagem')
        .setDescription('Texto do anúncio')
        .setRequired(true)
        .setMaxLength(1800)
    ),

  new SlashCommandBuilder()
    .setName('dizer')
    .setDescription('Faça o bot enviar uma mensagem no canal atual')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .addStringOption(o =>
      o.setName('mensagem')
        .setDescription('Mensagem a enviar')
        .setRequired(true)
        .setMaxLength(1800)
    ),

  new SlashCommandBuilder()
    .setName('aviso')
    .setDescription('Registre um aviso para um membro')
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addUserOption(o =>
      o.setName('membro')
        .setDescription('Membro que receberá o aviso')
        .setRequired(true)
    )
    .addStringOption(o =>
      o.setName('motivo')
        .setDescription('Motivo do aviso')
        .setRequired(true)
        .setMaxLength(500)
    ),

  new SlashCommandBuilder()
    .setName('avisos')
    .setDescription('Veja os avisos de um membro')
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addUserOption(o =>
      o.setName('membro')
        .setDescription('Membro consultado')
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName('limpar')
    .setDescription('Apague mensagens recentes')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .addIntegerOption(o =>
      o.setName('quantidade')
        .setDescription('Quantidade entre 1 e 100')
        .setRequired(true)
        .setMinValue(1)
        .setMaxValue(100)
    ),

  new SlashCommandBuilder()
    .setName('kick')
    .setDescription('Expulse um membro')
    .setDefaultMemberPermissions(PermissionFlagsBits.KickMembers)
    .addUserOption(o =>
      o.setName('membro')
        .setDescription('Membro a expulsar')
        .setRequired(true)
    )
    .addStringOption(o =>
      o.setName('motivo')
        .setDescription('Motivo')
        .setRequired(false)
        .setMaxLength(500)
    ),

  new SlashCommandBuilder()
    .setName('ban')
    .setDescription('Bane um membro')
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
    .addUserOption(o =>
      o.setName('membro')
        .setDescription('Membro a banir')
        .setRequired(true)
    )
    .addStringOption(o =>
      o.setName('motivo')
        .setDescription('Motivo')
        .setRequired(false)
        .setMaxLength(500)
    ),

  new SlashCommandBuilder()
    .setName('timeout')
    .setDescription('Silencie temporariamente um membro')
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addUserOption(o =>
      o.setName('membro')
        .setDescription('Membro a silenciar')
        .setRequired(true)
    )
    .addIntegerOption(o =>
      o.setName('minutos')
        .setDescription('Duração em minutos (1 a 40320)')
        .setRequired(true)
        .setMinValue(1)
        .setMaxValue(40320)
    )
    .addStringOption(o =>
      o.setName('motivo')
        .setDescription('Motivo')
        .setRequired(false)
        .setMaxLength(500)
    ),

  new SlashCommandBuilder()
    .setName('untimeout')
    .setDescription('Retire o silêncio temporário de um membro')
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addUserOption(o =>
      o.setName('membro')
        .setDescription('Membro a liberar')
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName('slowmode')
    .setDescription('Configure o modo lento do canal')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
    .addIntegerOption(o =>
      o.setName('segundos')
        .setDescription('0 a 21600 segundos')
        .setRequired(true)
        .setMinValue(0)
        .setMaxValue(21600)
    )
].map(command => command.toJSON());

// ============================================
// INICIALIZAÇÃO E REGISTRO DOS COMANDOS
// ============================================

client.once('ready', async () => {
  console.log(`✅ YSIS MC online como ${client.user.tag}`);

  try {
    const rest = new REST({ version: '10' }).setToken(DISCORD_TOKEN);

    await rest.put(
      Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID),
      { body: commands }
    );

    console.log(`✅ ${commands.length} comandos registrados.`);
  } catch (error) {
    console.error('Erro ao registrar comandos:', error);
  }
});

// ============================================
// BOAS-VINDAS E DESPEDIDAS
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

  await sendToChannel(
    LOG_CHANNEL_ID,
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

  await sendToChannel(
    LOG_CHANNEL_ID,
    `📤 Saída: **${member.user.tag}** (\`${member.id}\`)`
  );
});

// ============================================
// XP, NÍVEIS, AFK E DETECÇÃO SIMPLES DE SPAM
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

    const u = getUser(message.author.id);
    u.xp += 5 + Math.floor(Math.random() * 11);

    let leveledUp = false;

    while (u.xp >= xpRequired(u.level)) {
      u.xp -= xpRequired(u.level);
      u.level += 1;
      u.coins += 50;
      leveledUp = true;
    }

    await saveData();

    if (leveledUp) {
      await message.channel.send(
        `✨ Parabéns ${message.author}! Você subiu para o ` +
        `**nível ${u.level}** e ganhou 🪙 50 moedas!`
      ).catch(() => {});
    }
  }

  const list = (spamTracker.get(message.author.id) || [])
    .filter(timestamp => now - timestamp < 6000);

  list.push(now);
  spamTracker.set(message.author.id, list);

  if (list.length === 7) {
    await sendToChannel(
      LOG_CHANNEL_ID,
      `🚨 Possível spam de ${message.author.tag} em ${message.channel} ` +
      '(7 mensagens em 6 segundos).'
    );
  }
});

// ============================================
// COMANDOS DO BOT
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
            '**🛡️ MODERAÇÃO — EQUIPE**\n' +
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
            `Acesse o site e confira o projeto!\n\n` +
            `[**Abrir site**](${SITE})\n\n` +
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
            `Tempo de resposta: **${Date.now() - interaction.createdTimestamp} ms**`
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

      if (member && member.joinedTimestamp) {
        fields.push({
          name: 'Entrou no servidor',
          value: `<t:${Math.floor(member.joinedTimestamp / 1000)}:D>`,
          inline: true
        });
      }

      return interaction.reply({
        embeds: [
          makeEmbed(
            '👤 Informações do usuário',
            `Informações de ${target}.`
          )
            .addFields(fields)
            .setThumbnail(target.displayAvatarURL())
        ]
      });
    }

    if (cmd === 'servidor') {
      const g = interaction.guild;
      const embed = makeEmbed(
        `🏰 ${g.name}`,
        `**Dono:** <@${g.ownerId}>\n` +
        `**Membros:** ${g.memberCount}\n` +
        `**Canais:** ${g.channels.cache.size}\n` +
        `**Criado em:** <t:${Math.floor(g.createdTimestamp / 1000)}:D>`,
        0x5865f2
      );

      const icon = g.iconURL({ size: 512 });
      if (icon) embed.setThumbnail(icon);

      return interaction.reply({ embeds: [embed] });
    }

    if (cmd === 'perfil' || cmd === 'rank') {
      const target = interaction.options.getUser('membro') || user;
      const u = getUser(target.id);
      const need = xpRequired(u.level);

      const embed = makeEmbed(
        cmd === 'rank'
          ? `🏆 Nível de ${target.username}`
          : `👤 Perfil de ${target.username}`,
        `**Nível:** ${u.level}\n` +
        `**XP:** ${u.xp}/${need}\n` +
        `**Progresso:** ${Math.floor((u.xp / need) * 100)}%\n` +
        `**Moedas:** 🪙 ${u.coins}\n` +
        `**Reputação:** ⭐ ${u.rep}`
      ).setThumbnail(target.displayAvatarURL());

      await saveData();

      return interaction.reply({ embeds: [embed] });
    }

    if (cmd === 'saldo') {
      const target = interaction.options.getUser('membro') || user;
      const u = getUser(target.id);

      await saveData();

      return interaction.reply({
        embeds: [
          makeEmbed(
            '🪙 Carteira',
            `${target} tem **${u.coins} moedas**.`
          )
        ]
      });
    }

    if (cmd === 'daily') {
      const u = getUser(user.id);
      const now = Date.now();
      const wait = 86400000 - (now - u.lastDaily);

      if (wait > 0) {
        return interaction.reply({
          content: `⏳ Você já recebeu sua recompensa. Volte em **${prettyDuration(wait)}**.`,
          flags: MessageFlags.Ephemeral
        });
      }

      const reward = 100 + Math.floor(Math.random() * 101);
      u.coins += reward;
      u.lastDaily = now;

      await saveData();

      return interaction.reply({
        embeds: [
          makeEmbed(
            '🎁 Recompensa diária',
            `Você recebeu **🪙 ${reward} moedas**!\n` +
            `Seu saldo agora é **${u.coins}**.`
          )
        ]
      });
    }

    if (cmd === 'trabalhar') {
      const u = getUser(user.id);
      const now = Date.now();
      const wait = 3600000 - (now - u.lastWork);

      if (wait > 0) {
        return interaction.reply({
          content: `🛠️ Você está cansado. Tente novamente em **${prettyDuration(wait)}**.`,
          flags: MessageFlags.Ephemeral
        });
      }

      const jobs = [
        'minerou diamantes',
        'plantou uma fazenda',
        'construiu uma base',
        'negociou com aldeões',
        'explorou uma caverna'
      ];

      const reward = 25 + Math.floor(Math.random() * 76);
      u.coins += reward;
      u.lastWork = now;

      await saveData();

      return interaction.reply({
        embeds: [
          makeEmbed(
            '🛠️ Trabalho concluído',
            `Você ${jobs[Math.floor(Math.random() * jobs.length)]} ` +
            `e recebeu **🪙 ${reward} moedas**!`
          )
        ]
      });
    }

    if (cmd === 'rep') {
      const target = interaction.options.getUser('membro');

      if (target.id === user.id || target.bot) {
        return interaction.reply({
          content: '❌ Você não pode dar reputação a si mesmo ou a um bot.',
          flags: MessageFlags.Ephemeral
        });
      }

      const key = `${user.id}:${target.id}`;
      const last = data.repCooldowns[key] || 0;
      const wait = 43200000 - (Date.now() - last);

      if (wait > 0) {
        return interaction.reply({
          content: `⏳ Você já deu reputação a essa pessoa. Aguarde **${prettyDuration(wait)}**.`,
          flags: MessageFlags.Ephemeral
        });
      }

      getUser(target.id).rep += 1;
      data.repCooldowns[key] = Date.now();

      await saveData();

      return interaction.reply({
        embeds: [
          makeEmbed(
            '⭐ Reputação enviada',
            `${user} deu +1 de reputação para ${target}!`
          )
        ]
      });
    }

    if (cmd === 'afk') {
      const reason = interaction.options.getString('motivo') ||
        'Não informou um motivo';

      data.afk[user.id] = {
        reason,
        since: Date.now()
      };

      await saveData();

      return interaction.reply({
        content: `💤 ${user}, seu AFK foi ativado. Motivo: ${reason}`
      });
    }

    if (cmd === 'banho') {
      const target = interaction.options.getUser('membro');

      return interaction.reply({
        embeds: [
          makeEmbed(
            '🧼 OPERAÇÃO BANHO',
            `🚿 ${target}, chegou a hora do banho!\n` +
            '🧽 Sabão equipado. Água ativada. Sem desculpas!',
            0x00bcd4
          )
        ]
      });
    }

    if (cmd === 'moeda') {
      const result = Math.random() < 0.5 ? '🪙 Cara' : '🪙 Coroa';

      return interaction.reply({
        embeds: [
          makeEmbed(
            '🪙 Cara ou coroa',
            `${user} jogou a moeda...\n\n**${result}!**`
          )
        ]
      });
    }

    if (cmd === 'bolamagica') {
      const q = interaction.options.getString('pergunta');

      const answers = [
        'Com certeza!',
        'É muito provável.',
        'Pode ser...',
        'Não conte com isso.',
        'As estrelas dizem que sim.',
        'Melhor perguntar novamente depois.',
        'Minhas fontes dizem que não.',
        'Impossível saber agora.'
      ];

      return interaction.reply({
        embeds: [
          makeEmbed(
            '🔮 Bola mágica',
            `**Pergunta:** ${q}\n\n` +
            `**Resposta:** ${answers[Math.floor(Math.random() * answers.length)]}`
          )
        ]
      });
    }

    if (cmd === 'abraco') {
      const target = interaction.options.getUser('membro');

      return interaction.reply({
        embeds: [
          makeEmbed(
            '🫂 Abraço virtual',
            `${user} mandou um abraço apertado para ${target}! 💚`
          )
        ]
      });
    }

    if (cmd === 'ship') {
      const a = interaction.options.getUser('pessoa1');
      const b = interaction.options.getUser('pessoa2');
      const score = Math.floor(Math.random() * 101);

      const result = score >= 80
        ? '💍 Casamento no Nether!'
        : score >= 50
          ? '💚 Tem potencial!'
          : '💀 Só amizade por enquanto...';

      return interaction.reply({
        embeds: [
          makeEmbed(
            '💞 Calculadora de ship',
            `**${a.username} + ${b.username}**\n\n` +
            `Compatibilidade: **${score}%**\n${result}`
          )
        ]
      });
    }

    if (cmd === 'enquete') {
      const question = interaction.options.getString('pergunta');
      const a = interaction.options.getString('opcao1');
      const b = interaction.options.getString('opcao2');

      const poll = await interaction.reply({
        embeds: [
          makeEmbed(
            `📊 Enquete: ${question}`,
            `🇦 **${a}**\n🇧 **${b}**\n\nVote usando as reações abaixo!`
          )
        ],
        fetchReply: true
      });

      await poll.react('🇦');
      await poll.react('🇧');

      return;
    }

    if (cmd === 'anunciar') {
      const text = interaction.options.getString('mensagem');

      await interaction.reply({
        content: '✅ Anúncio enviado.',
        flags: MessageFlags.Ephemeral
      });

      await interaction.channel.send({
        embeds: [makeEmbed('📢 Anúncio oficial', text)]
      });

      await logAction(interaction, '📢 Publicou um anúncio.');
      return;
    }

    if (cmd === 'dizer') {
      const text = interaction.options.getString('mensagem');

      await interaction.reply({
        content: '✅ Mensagem enviada.',
        flags: MessageFlags.Ephemeral
      });

      await interaction.channel.send({ content: text });
      await logAction(interaction, '💬 Usou o comando /dizer.');
      return;
    }

    // ========================================
    // MODERAÇÃO
    // ========================================

    if (cmd === 'aviso') {
      const target = interaction.options.getUser('membro');
      const reason = interaction.options.getString('motivo');

      if (!data.warnings[target.id]) {
        data.warnings[target.id] = [];
      }

      data.warnings[target.id].push({
        by: user.id,
        reason,
        at: Date.now()
      });

      await saveData();

      await interaction.reply({
        content:
          `⚠️ Aviso registrado para ${target}. ` +
          `Total de avisos: **${data.warnings[target.id].length}**.`,
        flags: MessageFlags.Ephemeral
      });

      await logAction(
        interaction,
        `⚠️ Aviso para ${target.tag} (\`${target.id}\`)\n` +
        `**Motivo:** ${reason}`
      );

      return;
    }

    if (cmd === 'avisos') {
      const target = interaction.options.getUser('membro');
      const list = data.warnings[target.id] || [];

      const text = list.length
        ? list.slice(-10).map((w, i) =>
            `**${i + 1}.** ${w.reason} — <@${w.by}> — ` +
            `<t:${Math.floor(w.at / 1000)}:d>`
          ).join('\n')
        : 'Nenhum aviso registrado.';

      return interaction.reply({
        embeds: [
          makeEmbed(`⚠️ Avisos de ${target.tag}`, text)
        ],
        flags: MessageFlags.Ephemeral
      });
    }

    if (cmd === 'limpar') {
      const amount = interaction.options.getInteger('quantidade');

      if (
        !interaction.channel ||
        !interaction.channel.isTextBased() ||
        typeof interaction.channel.bulkDelete !== 'function'
      ) {
        return interaction.reply({
          content: '❌ Não é possível limpar mensagens neste canal.',
          flags: MessageFlags.Ephemeral
        });
      }

      await interaction.deferReply({
        flags: MessageFlags.Ephemeral
      });

      const deleted = await interaction.channel.bulkDelete(amount, true);

      await interaction.editReply(
        `🧹 Foram apagadas ${deleted.size} mensagens. ` +
        'Mensagens com mais de 14 dias não são removidas por este comando.'
      );

      await logAction(
        interaction,
        `🧹 Limpou ${deleted.size} mensagens em ${interaction.channel}.`
      );

      return;
    }

    if (cmd === 'kick') {
      const target = interaction.options.getUser('membro');
      const reason = safeReason(
        interaction.options.getString('motivo')
      );

      const member = await interaction.guild.members.fetch(target.id);

      if (!member.kickable) {
        return interaction.reply({
          content: '❌ Não posso expulsar esse membro. Confira as permissões e a hierarquia dos cargos.',
          flags: MessageFlags.Ephemeral
        });
      }

      await member.kick(reason);

      await interaction.reply({
        content: `👢 ${target.tag} foi expulso. Motivo: ${reason}`,
        flags: MessageFlags.Ephemeral
      });

      await logAction(
        interaction,
        `👢 Expulsão de ${target.tag} (\`${target.id}\`)\n` +
        `**Motivo:** ${reason}`
      );

      return;
    }

    if (cmd === 'ban') {
      const target = interaction.options.getUser('membro');
      const reason = safeReason(
        interaction.options.getString('motivo')
      );

      const member = await interaction.guild.members.fetch(target.id);

      if (!member.bannable) {
        return interaction.reply({
          content: '❌ Não posso banir esse membro. Confira as permissões e a hierarquia dos cargos.',
          flags: MessageFlags.Ephemeral
        });
      }

      await member.ban({ reason });

      await interaction.reply({
        content: `🔨 ${target.tag} foi banido. Motivo: ${reason}`,
        flags: MessageFlags.Ephemeral
      });

      await logAction(
        interaction,
        `🔨 Banimento de ${target.tag} (\`${target.id}\`)\n` +
        `**Motivo:** ${reason}`
      );

      return;
    }

    if (cmd === 'timeout') {
      const target = interaction.options.getUser('membro');
      const mins = interaction.options.getInteger('minutos');
      const reason = safeReason(
        interaction.options.getString('motivo')
      );

      const member = await interaction.guild.members.fetch(target.id);

      if (!member.moderatable) {
        return interaction.reply({
          content: '❌ Não consigo aplicar timeout nesse membro. Confira a hierarquia e as permissões.',
          flags: MessageFlags.Ephemeral
        });
      }

      await member.timeout(mins * 60000, reason);

      await interaction.reply({
        content: `🔇 ${target.tag} recebeu timeout por ${mins} minuto(s). Motivo: ${reason}`,
        flags: MessageFlags.Ephemeral
      });

      await logAction(
        interaction,
        `🔇 Timeout: ${target.tag} (\`${target.id}\`) por ${mins} minuto(s).\n` +
        `**Motivo:** ${reason}`
      );

      return;
    }

    if (cmd === 'untimeout') {
      const target = interaction.options.getUser('membro');
      const member = await interaction.guild.members.fetch(target.id);

      if (!member.moderatable) {
        return interaction.reply({
          content: '❌ Não consigo alterar o timeout desse membro.',
          flags: MessageFlags.Ephemeral
        });
      }

      await member.timeout(null, `Timeout removido por ${user.tag}`);

      await interaction.reply({
        content: `🔊 Timeout removido de ${target.tag}.`,
        flags: MessageFlags.Ephemeral
      });

      await logAction(
        interaction,
        `🔊 Timeout removido de ${target.tag} (\`${target.id}\`).`
      );

      return;
    }

    if (cmd === 'slowmode') {
      const secs = interaction.options.getInteger('segundos');

      if (
        !interaction.channel ||
        !interaction.channel.isTextBased() ||
        typeof interaction.channel.setRateLimitPerUser !== 'function'
      ) {
        return interaction.reply({
          content: '❌ Este canal não permite configurar modo lento.',
          flags: MessageFlags.Ephemeral
        });
      }

      await interaction.channel.setRateLimitPerUser(
        secs,
        `Alterado por ${user.tag}`
      );

      await interaction.reply({
        content: secs === 0
          ? '✅ Modo lento desativado.'
          : `✅ Modo lento definido para ${secs} segundos.`,
        flags: MessageFlags.Ephemeral
      });

      await logAction(
        interaction,
        `🐢 Modo lento configurado para ${secs} segundos em ${interaction.channel}.`
      );

      return;
    }
  } catch (error) {
    console.error(`Erro no comando /${cmd}:`, error);

    const response = {
      content: '❌ Ocorreu um erro. Confira as permissões do bot e os Logs do Railway.',
      flags: MessageFlags.Ephemeral
    };

    if (interaction.deferred) {
      await interaction.editReply({
        content: response.content
      }).catch(() => {});
    } else if (interaction.replied) {
      await interaction.followUp(response).catch(() => {});
    } else {
      await interaction.reply(response).catch(() => {});
    }
  }
});

// ============================================
// CONEXÃO COM O DISCORD
// ============================================

(async () => {
  await loadData();

  client.login(DISCORD_TOKEN).catch(error => {
    console.error('❌ Não foi possível ligar o bot:', error.message);
    process.exit(1);
  });
})();
