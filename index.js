const {
  Client,
  GatewayIntentBits,
  SlashCommandBuilder,
  REST,
  Routes,
  EmbedBuilder,
  PermissionFlagsBits,
  ChannelType
} = require("discord.js");

const fs = require("node:fs");
const path = require("node:path");

const TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const GUILD_ID = process.env.GUILD_ID;
const IP = process.env.MINECRAFT_IP || "YSISmc.aternos.me";
const PORT = process.env.MINECRAFT_PORT || "50061";
const SITE = process.env.SITE_URL || "https://bit.ly/YsisMc";
const ATERNOS = process.env.ATERNOS_URL || "https://aternos.org/server/";
const LOG_CHANNEL_ID = process.env.LOG_CHANNEL_ID || "";
const WELCOME_CHANNEL_ID = process.env.WELCOME_CHANNEL_ID || "";
const GOODBYE_CHANNEL_ID = process.env.GOODBYE_CHANNEL_ID || "";

if (!TOKEN || !CLIENT_ID || !GUILD_ID) {
  console.error("Configure DISCORD_TOKEN, CLIENT_ID e GUILD_ID no Railway.");
  process.exit(1);
}

const DATA_FILE = path.join(process.cwd(), "ysis-data.json");
const freshData = () => ({
  users: {},
  warns: {},
  marriages: {},
  configs: {},
  gameOrders: []
});
let data = freshData();

try {
  if (fs.existsSync(DATA_FILE)) {
    data = {
      ...freshData(),
      ...JSON.parse(fs.readFileSync(DATA_FILE, "utf8"))
    };
  }
} catch (e) {
  console.error("Erro lendo dados:", e);
}
if (!data.configs || typeof data.configs !== "object") data.configs = {};
if (!Array.isArray(data.gameOrders)) data.gameOrders = [];

function guildConfig(guildId) {
  if (!data.configs[guildId] || typeof data.configs[guildId] !== "object") data.configs[guildId] = {};
  const c = data.configs[guildId];
  if (!Object.prototype.hasOwnProperty.call(c, "welcomeChannelId")) c.welcomeChannelId = WELCOME_CHANNEL_ID || null;
  if (!Object.prototype.hasOwnProperty.call(c, "welcomeMessage")) c.welcomeMessage = "Olá {user}! Seja bem-vindo(a) ao **{server}**!\n\n⛏️ **IP:** `{ip}`\n🌐 **Site:** {site}\n📜 Leia as regras e divirta-se!";
  if (!Object.prototype.hasOwnProperty.call(c, "goodbyeChannelId")) c.goodbyeChannelId = GOODBYE_CHANNEL_ID || null;
  if (!Object.prototype.hasOwnProperty.call(c, "goodbyeMessage")) c.goodbyeMessage = "👋 **{username}** saiu do servidor. Até a próxima!";
  if (!Object.prototype.hasOwnProperty.call(c, "logChannelId")) c.logChannelId = LOG_CHANNEL_ID || null;
  if (!c.roleShop || typeof c.roleShop !== "object" || Array.isArray(c.roleShop)) c.roleShop = {};
  return c;
}

function renderMemberTemplate(template, member) {
  return String(template || "")
    .replaceAll("{user}", `<@${member.id}>`)
    .replaceAll("{username}", member.user.username)
    .replaceAll("{server}", member.guild.name)
    .replaceAll("{memberCount}", String(member.guild.memberCount))
    .replaceAll("{ip}", `${IP}:${PORT}`)
    .replaceAll("{site}", SITE);
}

function save() {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), "utf8");
  } catch (e) {
    console.error("Erro salvando dados:", e);
  }
}

function user(id) {
  if (!data.users[id]) {
    data.users[id] = {
      coins: 150,
      bank: 0,
      inventory: {},
      xp: 0,
      lastDaily: 0,
      dailyStreak: 0,
      lastWork: 0,
      lastAdventure: 0,
      lastFish: 0,
      lastMine: 0,
      lastXP: 0
    };
  }

  const u = data.users[id];

  for (const [k, v] of Object.entries({
    coins: 150,
    bank: 0,
    xp: 0,
    lastDaily: 0,
    dailyStreak: 0,
    lastWork: 0,
    lastAdventure: 0,
    lastFish: 0,
    lastMine: 0,
    lastXP: 0
  })) {
    if (typeof u[k] !== "number" || !Number.isFinite(u[k])) {
      u[k] = v;
    }
  }

  if (!u.inventory || typeof u.inventory !== "object" || Array.isArray(u.inventory)) {
    u.inventory = {};
  }

  return u;
}

const rand = (a, b) => Math.floor(Math.random() * (b - a + 1)) + a;
const fmt = n => Number(n || 0).toLocaleString("pt-BR");
const level = xp => Math.floor(Math.sqrt(Math.max(0, xp) / 100));

const bar = (n, max) => {
  const f = Math.max(0, Math.min(10, Math.floor((max ? n / max : 0) * 10)));
  return "🟦".repeat(f) + "⬛".repeat(10 - f);
};

function em(title, desc = "", color = 0x2878ff) {
  const e = new EmbedBuilder()
    .setColor(color)
    .setTitle(title)
    .setTimestamp()
    .setFooter({ text: "YSIS MC • Sua lenda, seu império" });

  if (desc) e.setDescription(desc);
  return e;
}

const shop = {
  bloco_diamante: { name: "Bloco de Diamante", emoji: "💎", price: 900, sell: 400, desc: "Bloco valioso para construção." },
  picareta: { name: "Picareta de Diamante", emoji: "⛏️", price: 200, sell: 100, desc: "Ferramenta para mineração." },
  obsidiana: { name: "Obsidiana (8 blocos)", emoji: "🟪", price: 180, sell: 80, desc: "Material de construção." },
  diamante: { name: "Diamante", emoji: "💎", price: 180, sell: 100, desc: "Material valioso." },
  peixe: { name: "Peixe", emoji: "🐟", price: 25, sell: 15, desc: "Peixe fresco." },
  esmeralda: { name: "Esmeralda", emoji: "💚", price: 300, sell: 160, desc: "Gema valiosa." },
  netherite: { name: "Fragmento de Netherite", emoji: "🔥", price: 500, sell: 280, desc: "Material raro." },
  elytra: { name: "Elytra", emoji: "🪽", price: 1200, sell: 600, desc: "Item raro." },
  totem: { name: "Totem da Imortalidade", emoji: "☠️", price: 800, sell: 400, desc: "Item raro." },
  maca_dourada: { name: "Maçã Dourada", emoji: "🍎", price: 140, sell: 70, desc: "Comida especial." },
  ender_pearl: { name: "Pérola do Ender", emoji: "🟣", price: 160, sell: 65, desc: "Item de exploração." },
  xp_bottles: { name: "Frascos de Experiência (16)", emoji: "🧪", price: 220, sell: 90, desc: "Frascos para ganhar experiência." },
  foguetes: { name: "Pilha de Fogos de Artifício", emoji: "🎆", price: 90, sell: 40, desc: "Pilha para entrega no Minecraft." }
};

const itemName = k => shop[k] ? `${shop[k].emoji} ${shop[k].name}` : k;
const choices = Object.entries(shop).map(([value, v]) => ({
  name: `${v.emoji} ${v.name}`.slice(0, 100),
  value
}));

const cmd = [];
const add = c => cmd.push(c.toJSON());

add(new SlashCommandBuilder().setName("ajuda").setDescription("Veja os comandos do YSIS MC."));
add(new SlashCommandBuilder().setName("ip").setDescription("Veja o IP do Minecraft."));
add(new SlashCommandBuilder().setName("site").setDescription("Veja o site do YSIS MC."));
add(new SlashCommandBuilder().setName("servidor").setDescription("Informações do servidor Discord."));
add(new SlashCommandBuilder().setName("avatar").setDescription("Veja um avatar.").addUserOption(o => o.setName("usuario").setDescription("Pessoa").setRequired(false)));
add(new SlashCommandBuilder().setName("perfil").setDescription("Veja seu perfil pessoal."));
add(new SlashCommandBuilder().setName("daily").setDescription("Receba moedas diárias."));
add(new SlashCommandBuilder().setName("saldo").setDescription("Veja seu saldo privado."));
add(new SlashCommandBuilder().setName("trabalhar").setDescription("Trabalhe e ganhe moedas."));
add(new SlashCommandBuilder().setName("pagar").setDescription("Envie moedas.").addUserOption(o => o.setName("usuario").setDescription("Destinatário").setRequired(true)).addIntegerOption(o => o.setName("quantia").setDescription("Quantidade").setMinValue(1).setRequired(true)));
add(new SlashCommandBuilder().setName("depositar").setDescription("Deposite moedas no banco.").addIntegerOption(o => o.setName("quantia").setDescription("Quantidade").setMinValue(1).setRequired(true)));
add(new SlashCommandBuilder().setName("sacar").setDescription("Saque moedas do banco.").addIntegerOption(o => o.setName("quantia").setDescription("Quantidade").setMinValue(1).setRequired(true)));
add(new SlashCommandBuilder().setName("top").setDescription("Ranking de moedas."));
add(new SlashCommandBuilder().setName("loja").setDescription("Veja a loja de cargos do servidor."));
add(new SlashCommandBuilder().setName("comprarcargo").setDescription("Compre um cargo da loja do Discord.").addStringOption(o => o.setName("item").setDescription("Cargo disponível na loja").setAutocomplete(true).setRequired(true)));
add(new SlashCommandBuilder().setName("lojajogo").setDescription("Veja a loja de itens do Minecraft."));
add(new SlashCommandBuilder().setName("comprarjogo").setDescription("Faça um pedido de item para o Minecraft.").addStringOption(o => o.setName("item").setDescription("Item do jogo").setRequired(true).addChoices(...choices)).addStringOption(o => o.setName("nick").setDescription("Seu nick exato no Minecraft").setRequired(true).setMaxLength(32)).addIntegerOption(o => o.setName("quantidade").setDescription("Quantidade, de 1 a 10").setMinValue(1).setMaxValue(10).setRequired(false)));
add(new SlashCommandBuilder().setName("configloja").setDescription("Configure os cargos vendidos na loja do Discord.").setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild).addStringOption(o => o.setName("acao").setDescription("Adicionar ou remover uma oferta").setRequired(true).addChoices({ name: "Adicionar/atualizar", value: "adicionar" }, { name: "Remover", value: "remover" })).addRoleOption(o => o.setName("cargo").setDescription("Cargo da oferta").setRequired(true)).addIntegerOption(o => o.setName("preco").setDescription("Preço em moedas (necessário para adicionar)").setMinValue(1).setMaxValue(10000000).setRequired(false)));
add(new SlashCommandBuilder().setName("configurar").setDescription("Configure canais e mensagens automáticas.").setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild).addStringOption(o => o.setName("tipo").setDescription("Qual configuração alterar").setRequired(true).addChoices({ name: "Boas-vindas", value: "boasvindas" }, { name: "Despedida", value: "saida" }, { name: "Canal de logs", value: "logs" })).addChannelOption(o => o.setName("canal").setDescription("Canal de texto destino").addChannelTypes(ChannelType.GuildText).setRequired(false)).addStringOption(o => o.setName("mensagem").setDescription("Modelo de mensagem (use {user}, {server}, {username}, {memberCount}, {ip}, {site})").setMaxLength(1500).setRequired(false)));
add(new SlashCommandBuilder().setName("cargo").setDescription("Adicione ou remova um cargo de um membro.").setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles).addStringOption(o => o.setName("acao").setDescription("Ação desejada").setRequired(true).addChoices({ name: "Dar cargo", value: "dar" }, { name: "Remover cargo", value: "remover" })).addUserOption(o => o.setName("usuario").setDescription("Membro").setRequired(true)).addRoleOption(o => o.setName("cargo").setDescription("Cargo atual do servidor").setRequired(true)));
add(new SlashCommandBuilder().setName("pedidosjogo").setDescription("Veja os pedidos pendentes da loja Minecraft.").setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild));
add(new SlashCommandBuilder().setName("concluirpedido").setDescription("Marque um pedido como entregue no Minecraft.").setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild).addStringOption(o => o.setName("id").setDescription("ID do pedido").setRequired(true).setMaxLength(20)));
add(new SlashCommandBuilder().setName("cancelarpedido").setDescription("Cancele um pedido e devolva as moedas.").setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild).addStringOption(o => o.setName("id").setDescription("ID do pedido").setRequired(true).setMaxLength(20)));
add(new SlashCommandBuilder().setName("inventario").setDescription("Veja seu inventário privado."));
add(new SlashCommandBuilder().setName("vender").setDescription("Venda um item.").addStringOption(o => o.setName("item").setDescription("Item").setRequired(true).addChoices(...choices)).addIntegerOption(o => o.setName("quantidade").setDescription("Quantidade").setMinValue(1).setRequired(false)));

for (const [name, desc] of [
  ["pescar", "Pesque recompensas."],
  ["aventura", "Explore e encontre tesouros."],
  ["minerar", "Mine recursos."]
]) add(new SlashCommandBuilder().setName(name).setDescription(desc));

add(new SlashCommandBuilder().setName("moeda").setDescription("Jogue cara ou coroa."));
add(new SlashCommandBuilder().setName("dado").setDescription("Role um dado."));
add(new SlashCommandBuilder().setName("pergunta").setDescription("Pergunte à bola mágica.").addStringOption(o => o.setName("texto").setDescription("Pergunta").setMaxLength(300).setRequired(true)));
add(new SlashCommandBuilder().setName("ship").setDescription("Compatibilidade divertida.").addUserOption(o => o.setName("pessoa1").setDescription("Pessoa 1").setRequired(true)).addUserOption(o => o.setName("pessoa2").setDescription("Pessoa 2").setRequired(true)));

for (const [name, desc] of [
  ["abracar", "Dê um abraço."],
  ["beijar", "Mande um beijo."],
  ["tapa", "Tapa de brincadeira."]
]) add(new SlashCommandBuilder().setName(name).setDescription(desc).addUserOption(o => o.setName("usuario").setDescription("Pessoa").setRequired(true)));

add(new SlashCommandBuilder().setName("casar").setDescription("Peça alguém em casamento.").addUserOption(o => o.setName("usuario").setDescription("Pessoa").setRequired(true)));
add(new SlashCommandBuilder().setName("divorciar").setDescription("Termine seu casamento no bot."));
add(new SlashCommandBuilder().setName("rate").setDescription("Avalie algo de 0 a 10.").addStringOption(o => o.setName("texto").setDescription("O que avaliar").setRequired(true)));

add(new SlashCommandBuilder().setName("limpar").setDescription("Apague mensagens.").setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages).addIntegerOption(o => o.setName("quantidade").setDescription("1 a 100").setMinValue(1).setMaxValue(100).setRequired(true)));
add(new SlashCommandBuilder().setName("expulsar").setDescription("Expulse um membro.").setDefaultMemberPermissions(PermissionFlagsBits.KickMembers).addUserOption(o => o.setName("usuario").setDescription("Membro").setRequired(true)).addStringOption(o => o.setName("motivo").setDescription("Motivo").setMaxLength(500).setRequired(false)));
add(new SlashCommandBuilder().setName("banir").setDescription("Bane um membro.").setDefaultMemberPermissions(PermissionFlagsBits.BanMembers).addUserOption(o => o.setName("usuario").setDescription("Membro").setRequired(true)).addStringOption(o => o.setName("motivo").setDescription("Motivo").setMaxLength(500).setRequired(false)));
add(new SlashCommandBuilder().setName("timeout").setDescription("Silencie temporariamente.").setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers).addUserOption(o => o.setName("usuario").setDescription("Membro").setRequired(true)).addIntegerOption(o => o.setName("minutos").setDescription("Minutos").setMinValue(1).setMaxValue(40320).setRequired(true)).addStringOption(o => o.setName("motivo").setDescription("Motivo").setMaxLength(500).setRequired(false)));
add(new SlashCommandBuilder().setName("avisar").setDescription("Registre advertência.").setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers).addUserOption(o => o.setName("usuario").setDescription("Membro").setRequired(true)).addStringOption(o => o.setName("motivo").setDescription("Motivo").setRequired(true).setMaxLength(500)));

for (const [name, desc] of [
  ["avisos", "Veja advertências."],
  ["limparavisos", "Apague advertências."]
]) add(new SlashCommandBuilder().setName(name).setDescription(desc).setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers).addUserOption(o => o.setName("usuario").setDescription("Membro").setRequired(true)));

add(new SlashCommandBuilder().setName("lock").setDescription("Bloqueie o canal.").setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels));
add(new SlashCommandBuilder().setName("unlock").setDescription("Desbloqueie o canal.").setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels));
add(new SlashCommandBuilder().setName("dizer").setDescription("Envie uma mensagem do bot em um canal escolhido.").setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages).addStringOption(o => o.setName("texto").setDescription("Mensagem").setRequired(true).setMaxLength(1800)).addChannelOption(o => o.setName("canal").setDescription("Canal de destino (opcional)").addChannelTypes(ChannelType.GuildText).setRequired(false)));
add(new SlashCommandBuilder().setName("anunciar").setDescription("Publique anúncio.").setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages).addStringOption(o => o.setName("titulo").setDescription("Título").setRequired(true).setMaxLength(200)).addStringOption(o => o.setName("texto").setDescription("Conteúdo").setRequired(true).setMaxLength(3500)).addChannelOption(o => o.setName("canal").setDescription("Canal destino").addChannelTypes(ChannelType.GuildText).setRequired(false)));
add(new SlashCommandBuilder().setName("ticket").setDescription("Abra ticket privado."));
add(new SlashCommandBuilder().setName("fecharticket").setDescription("Feche o ticket atual."));

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

async function log(guild, title, desc) {
  try {
    const cfg = guildConfig(guild.id);
    const ch = cfg.logChannelId
      ? await guild.channels.fetch(cfg.logChannelId).catch(() => null)
      : guild.channels.cache.find(c => c.name === "logs-moderação");

    if (ch?.isTextBased()) {
      await ch.send({ embeds: [em(title, desc, 0xf39c12)] });
    }
  } catch (e) {
    console.error("Log:", e.message);
  }
}

client.once("ready", async () => {
  console.log(`Online como ${client.user.tag}`);

  try {
    const rest = new REST({ version: "10" }).setToken(TOKEN);
    await rest.put(
      Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID),
      { body: cmd }
    );
    console.log(`${cmd.length} comandos registrados.`);
  } catch (e) {
    console.error("Registro dos comandos:", e);
  }
});

client.on("guildMemberAdd", async m => {
  try {
    const cfg = guildConfig(m.guild.id);
    const ch = (cfg.welcomeChannelId && await m.guild.channels.fetch(cfg.welcomeChannelId).catch(() => null)) || m.guild.systemChannel;
    if (ch?.isTextBased()) {
      await ch.send({
        embeds: [em("👋 Bem-vindo(a) ao YSIS MC!", renderMemberTemplate(cfg.welcomeMessage, m)).setThumbnail(m.user.displayAvatarURL())],
        allowedMentions: { parse: [] }
      });
    }
  } catch (e) {
    console.error("Boas-vindas:", e.message);
  }
});

client.on("guildMemberRemove", async m => {
  try {
    const cfg = guildConfig(m.guild.id);
    const ch = (cfg.goodbyeChannelId && await m.guild.channels.fetch(cfg.goodbyeChannelId).catch(() => null)) || m.guild.systemChannel;
    if (ch?.isTextBased()) {
      await ch.send({ content: renderMemberTemplate(cfg.goodbyeMessage, m), allowedMentions: { parse: [] } });
    }
  } catch (e) {
    console.error("Despedida:", e.message);
  }
});

const spamMap = new Map();

client.on("messageCreate", async m => {
  if (!m.guild || m.author.bot) return;

  const u = user(m.author.id);
  const now = Date.now();

  if (now - u.lastXP >= 60000) {
    const old = level(u.xp);
    u.xp += rand(10, 18);
    u.lastXP = now;
    save();

    if (level(u.xp) > old) {
      m.channel.send(`🎉 Parabéns ${m.author}, você chegou ao nível **${level(u.xp)}**!`).catch(() => {});
    }
  }

  const k = `${m.guild.id}:${m.author.id}`;
  const arr = (spamMap.get(k) || []).filter(t => now - t < 7000);
  arr.push(now);
  spamMap.set(k, arr);

  if (arr.length >= 7 || (m.mentions.users.size >= 6 && arr.length >= 3)) {
    try {
      if (m.deletable) await m.delete();

      await log(
        m.guild,
        "🚨 Possível flood",
        `Membro: ${m.author} (\`${m.author.id}\`)\nCanal: ${m.channel}\nMensagens recentes: ${arr.length}`
      );

      spamMap.set(k, []);
    } catch (e) {
      console.error("Antispam:", e.message);
    }
  }
});

async function actionGif(kind) {
  const endpoint = {
    abracar: "https://api.waifu.pics/sfw/hug",
    beijar: "https://api.waifu.pics/sfw/kiss",
    tapa: "https://api.waifu.pics/sfw/slap"
  }[kind];
  if (!endpoint) return null;
  try {
    const res = await fetch(endpoint, { signal: AbortSignal.timeout(4500) });
    if (!res.ok) return null;
    const body = await res.json();
    return typeof body.url === "string" && body.url.startsWith("https://") ? body.url : null;
  } catch {
    return null;
  }
}

function cooldown(u, key, ms) {
  const left = ms - (Date.now() - (u[key] || 0));
  if (left > 0) return left;
  u[key] = Date.now();
  return 0;
}

client.on("interactionCreate", async i => {
  if (i.isAutocomplete()) {
    if (i.commandName === "comprarcargo" && i.guild) {
      const cfg = guildConfig(i.guild.id);
      const typed = i.options.getFocused().toLocaleLowerCase("pt-BR");
      const offers = Object.entries(cfg.roleShop)
        .map(([roleId, offer]) => {
          const role = i.guild.roles.cache.get(roleId);
          if (!role) return null;
          return { name: `${role.name} — ${fmt(offer.price)} moedas`.slice(0, 100), value: roleId, search: `${role.name} ${roleId}`.toLocaleLowerCase("pt-BR") };
        })
        .filter(Boolean)
        .filter(o => o.search.includes(typed))
        .slice(0, 25)
        .map(({ name, value }) => ({ name, value }));
      await i.respond(offers).catch(() => {});
    }
    return;
  }
  if (!i.isChatInputCommand()) return;

  const name = i.commandName;
  const me = i.user;
  const u = user(me.id);
  const reply = (content, ephemeral = false) => i.reply({ content, ephemeral });

  try {
    const requiredPermissions = {
      configurar: PermissionFlagsBits.ManageGuild,
      configloja: PermissionFlagsBits.ManageGuild,
      cargo: PermissionFlagsBits.ManageRoles,
      pedidosjogo: PermissionFlagsBits.ManageGuild,
      concluirpedido: PermissionFlagsBits.ManageGuild,
      cancelarpedido: PermissionFlagsBits.ManageGuild,
      limpar: PermissionFlagsBits.ManageMessages,
      expulsar: PermissionFlagsBits.KickMembers,
      banir: PermissionFlagsBits.BanMembers,
      timeout: PermissionFlagsBits.ModerateMembers,
      avisar: PermissionFlagsBits.ModerateMembers,
      avisos: PermissionFlagsBits.ModerateMembers,
      limparavisos: PermissionFlagsBits.ModerateMembers,
      lock: PermissionFlagsBits.ManageChannels,
      unlock: PermissionFlagsBits.ManageChannels,
      dizer: PermissionFlagsBits.ManageMessages,
      anunciar: PermissionFlagsBits.ManageMessages
    };
    const needed = requiredPermissions[name];
    if (needed && !i.memberPermissions?.has(needed) && !i.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
      return reply("⛔ Você não tem permissão para usar este comando.", true);
    }
    if (name === "ajuda") {
      return i.reply({
        ephemeral: true,
        embeds: [
          em(
            "📚 Comandos YSIS MC",
            "**Geral:** `/ip` `/site` `/servidor` `/avatar` `/perfil`\n" +
            "**Economia privada:** `/daily` `/saldo` `/trabalhar` `/pagar` `/depositar` `/sacar` `/top`\n" +
            "**Lojas:** `/loja` `/comprarcargo` (cargos do Discord), `/lojajogo` `/comprarjogo` (pedidos Minecraft)\n" +
            "**Inventário:** `/inventario` `/vender` `/pescar` `/aventura` `/minerar`\n" +
            "**Diversão:** `/moeda` `/dado` `/pergunta` `/ship` `/abracar` `/beijar` `/tapa` `/casar` `/divorciar` `/rate`\n" +
            "**Configuração ADM:** `/configurar` `/configloja` `/cargo` `/dizer` `/anunciar`\n" +
            "**Equipe:** `/limpar` `/expulsar` `/banir` `/timeout` `/avisar` `/avisos` `/limparavisos` `/lock` `/unlock` `/pedidosjogo` `/concluirpedido` `/cancelarpedido`\n" +
            "**Tickets:** `/ticket` `/fecharticket`\n\nRespostas de economia são privadas. Os pedidos Minecraft ficam pendentes até a equipe entregar o item no jogo."
          )
        ]
      });
    }

    if (name === "ip") {
      return i.reply({
        embeds: [em("⛏️ IP do YSIS MC", `**Endereço:** \`${IP}\`\n**Porta:** \`${PORT}\`\n**Painel:** ${ATERNOS}`)]
      });
    }

    if (name === "site") {
      return i.reply({ embeds: [em("🌐 Site do YSIS MC", SITE)] });
    }

    if (name === "servidor") {
      return i.reply({
        embeds: [
          em(
            `🌍 ${i.guild.name}`,
            `**Membros:** ${i.guild.memberCount}\n**Criado:** <t:${Math.floor(i.guild.createdTimestamp / 1000)}:D>\n**Dono:** <@${i.guild.ownerId}>`
          )
        ]
      });
    }

    if (name === "avatar") {
      const t = i.options.getUser("usuario") || me;
      return i.reply({
        embeds: [em(`🖼️ Avatar de ${t.username}`).setImage(t.displayAvatarURL({ size: 1024 }))]
      });
    }

    if (name === "perfil") {
      const t = me;
      const p = user(t.id);
      const lv = level(p.xp);
      return i.reply({
        ephemeral: true,
        embeds: [
          em(
            `👤 Seu perfil — ${t.username}`,
            `**Nível:** ${lv} ${bar(p.xp - lv * lv * 100, (lv + 1) ** 2 * 100 - lv * lv * 100)}\n` +
            `**XP:** ${fmt(p.xp)}\n**Carteira:** 💰 ${fmt(p.coins)}\n**Banco:** 🏦 ${fmt(p.bank)}\n` +
            `**Casamento:** ${data.marriages[t.id] ? `<@${data.marriages[t.id]}>` : "Solteiro(a)"}`
          ).setThumbnail(t.displayAvatarURL())
        ]
      });
    }

    if (name === "daily") {
      const elapsed = Date.now() - u.lastDaily;
      if (elapsed < 86400000) {
        return reply(`⏳ Volte em ${Math.ceil((86400000 - elapsed) / 3600000)} hora(s).`, true);
      }

      u.dailyStreak = elapsed < 172800000 ? u.dailyStreak + 1 : 1;
      const reward = 100 + Math.min(u.dailyStreak - 1, 7) * 25;
      u.coins += reward;
      u.lastDaily = Date.now();
      save();

      return reply(`🎁 Você recebeu **${reward} moedas**! Sequência: **${u.dailyStreak} dia(s)**.`, true);
    }

    if (name === "saldo") {
      return reply(`💰 **Seu saldo — ${me.username}**\nCarteira: **${fmt(u.coins)}**\nBanco: **${fmt(u.bank)}**\nTotal: **${fmt(u.coins + u.bank)}**`, true);
    }

    if (name === "trabalhar") {
      const left = cooldown(u, "lastWork", 3600000);
      if (left) return reply(`⏳ Tente novamente em ${Math.ceil(left / 60000)} min.`, true);

      const n = rand(40, 120);
      u.coins += n;
      save();
      return reply(`🧰 Você ganhou **${n} moedas** trabalhando.`, true);
    }

    if (name === "pagar") {
      const t = i.options.getUser("usuario");
      const n = i.options.getInteger("quantia");

      if (t.bot || t.id === me.id) return reply("❌ Escolha outra pessoa.", true);
      if (u.coins < n) return reply("❌ Saldo insuficiente na carteira.", true);

      u.coins -= n;
      user(t.id).coins += n;
      save();
      return reply(`💸 Você enviou **${fmt(n)} moedas** para ${t}.`, true);
    }

    if (name === "depositar" || name === "sacar") {
      const n = i.options.getInteger("quantia");

      if (name === "depositar") {
        if (u.coins < n) return reply("❌ Saldo insuficiente.", true);
        u.coins -= n;
        u.bank += n;
      } else {
        if (u.bank < n) return reply("❌ Saldo bancário insuficiente.", true);
        u.bank -= n;
        u.coins += n;
      }

      save();
      return reply(`🏦 Operação concluída: **${fmt(n)} moedas**.`, true);
    }

    if (name === "top") {
      const rows = Object.entries(data.users)
        .sort((a, b) => (b[1].coins + b[1].bank) - (a[1].coins + a[1].bank))
        .slice(0, 10);

      return i.reply({
        embeds: [
          em(
            "🏆 Ranking YSIS MC",
            rows.map(([id, p], n) => `**${n + 1}.** <@${id}> — 💰 ${fmt(p.coins + p.bank)} | Nível ${level(p.xp)}`).join("\n") ||
            "Ainda sem jogadores no ranking."
          )
        ]
      });
    }

    if (name === "loja") {
      const cfg = guildConfig(i.guild.id);
      const offers = Object.entries(cfg.roleShop).map(([roleId, offer]) => {
        const role = i.guild.roles.cache.get(roleId);
        if (!role) return null;
        return `🎖️ **${role.name}** — ${fmt(offer.price)} moedas\nUse \`/comprarcargo\` e selecione este cargo.`;
      }).filter(Boolean);
      return i.reply({
        ephemeral: true,
        embeds: [em("🏷️ Loja de cargos do YSIS MC", offers.join("\n\n") || "A loja ainda não tem cargos. Um ADM pode cadastrar ofertas com `/configloja`.", 0x9b59b6)]
      });
    }

    if (name === "lojajogo") {
      return i.reply({
        ephemeral: true,
        embeds: [em("⛏️ Loja Minecraft — pedidos", Object.entries(shop).map(([k, v]) => `${v.emoji} **${v.name}** — ${fmt(v.price)} moedas\n${v.desc}`).join("\n\n") + "\n\n📦 A compra cria um pedido. A equipe precisa entregar o item no Minecraft e confirmar com `/concluirpedido`.", 0x2ecc71)]
      });
    }

    if (name === "comprarjogo") {
      const k = i.options.getString("item");
      const nick = i.options.getString("nick").trim();
      const quantity = i.options.getInteger("quantidade") || 1;
      const it = shop[k];
      if (!it) return reply("❌ Esse item não existe na loja.", true);
      if (!/^[A-Za-z0-9_]{1,32}$/.test(nick)) return reply("❌ O nick do Minecraft deve ter de 1 a 32 caracteres (letras, números e _).", true);
      const total = it.price * quantity;
      if (u.coins < total) return reply(`❌ Você precisa de ${fmt(total)} moedas; seu saldo é ${fmt(u.coins)}.`, true);
      const order = {
        id: `MC${Date.now().toString(36).toUpperCase().slice(-7)}`,
        guildId: i.guild.id,
        userId: me.id,
        username: me.username,
        minecraftNick: nick,
        item: k,
        quantity,
        total,
        status: "pendente",
        createdAt: Date.now(),
        deliveredAt: null
      };
      u.coins -= total;
      data.gameOrders.push(order);
      save();
      return reply(`✅ Pedido **${order.id}** registrado: ${it.emoji} **${quantity}× ${it.name}** para **${nick}**. Foram debitadas **${fmt(total)} moedas**. O pedido está pendente; a equipe ainda precisa entregar o item no jogo.`, true);
    }

    if (name === "comprarcargo") {
      const roleId = i.options.getString("item");
      const cfg = guildConfig(i.guild.id);
      const offer = cfg.roleShop[roleId];
      const role = i.guild.roles.cache.get(roleId);
      if (!offer || !role) return reply("❌ Essa oferta não está mais disponível. Abra `/loja` novamente.", true);
      if (role.id === i.guild.id || role.managed || !role.editable) return reply("❌ O bot não consegue atribuir esse cargo. Confira a hierarquia dos cargos.", true);
      const buyer = await i.guild.members.fetch(me.id).catch(() => null);
      if (!buyer) return reply("Não consegui localizar seu membro no servidor.", true);
      if (buyer.roles.cache.has(role.id)) return reply("Você já tem esse cargo.", true);
      if (u.coins < offer.price) return reply(`❌ Você precisa de ${fmt(offer.price)} moedas.`, true);
      try {
        await buyer.roles.add(role, "Compra na loja de cargos YSIS MC");
        u.coins -= offer.price;
        save();
        return reply(`✅ Você comprou o cargo **${role.name}** por ${fmt(offer.price)} moedas.`, true);
      } catch (e) {
        console.error("Compra de cargo:", e.message);
        return reply("❌ Não consegui atribuir o cargo. Confira se o cargo do bot está acima do cargo vendido e se ele tem Gerenciar Cargos.", true);
      }
    }

    if (name === "inventario") {
      return i.reply({
        ephemeral: true,
        embeds: [em(`🎒 Seu inventário — ${me.username}`, Object.entries(u.inventory).map(([k, n]) => `${itemName(k)} × **${n}**`).join("\n") || "Inventário vazio.")]
      });
    }

    if (name === "vender") {
      const k = i.options.getString("item");
      const n = i.options.getInteger("quantidade") || 1;
      const it = shop[k];

      if ((u.inventory[k] || 0) < n) return reply("❌ Você não tem essa quantidade.", true);

      u.inventory[k] -= n;
      if (!u.inventory[k]) delete u.inventory[k];

      const total = it.sell * n;
      u.coins += total;
      save();

      return reply(`💰 Você vendeu **${n}× ${it.name}** por **${fmt(total)} moedas**.`, true);
    }

    if (["pescar", "aventura", "minerar"].includes(name)) {
      const key = {
        pescar: "lastFish",
        aventura: "lastAdventure",
        minerar: "lastMine"
      }[name];

      const left = cooldown(u, key, name === "aventura" ? 3600000 : 300000);
      if (left) return reply(`⏳ Aguarde ${Math.ceil(left / 60000)} min.`, true);

      const reward = rand(20, 100);
      u.coins += reward;
      let found = "🧭 recursos";
      if (name === "minerar") {
        found = Math.random() < 0.25 ? "💎 um diamante" : "⛏️ minérios";
        if (found.includes("diamante")) {
          u.inventory.diamante = (u.inventory.diamante || 0) + 1;
        }
      }

      if (name === "aventura") {
        found = Math.random() < 0.2 ? "🔥 um fragmento de netherite" : "🧭 recursos";
        if (found.includes("netherite")) {
          u.inventory.netherite = (u.inventory.netherite || 0) + 1;
        }
      }

      save();
      return reply(`✨ Você encontrou ${found} e ganhou **${reward} moedas**.`, true);
    }

    if (name === "moeda") {
      return reply(Math.random() < 0.5 ? "🪙 Deu **cara**!" : "🪙 Deu **coroa**!");
    }

    if (name === "dado") {
      return reply(`🎲 Você tirou **${rand(1, 6)}**.`);
    }

    if (name === "pergunta") {
      const answers = [
        "Sim, com certeza.",
        "Não conte com isso.",
        "Os sinais apontam que sim.",
        "Pergunte novamente depois.",
        "As chances são boas.",
        "Não parece provável."
      ];

      return reply(`🔮 **${i.options.getString("texto")}**\n${answers[rand(0, answers.length - 1)]}`);
    }

    if (name === "ship") {
      const a = i.options.getUser("pessoa1");
      const b = i.options.getUser("pessoa2");
      const n = rand(0, 100);

      return reply(`💞 **${a.username} + ${b.username}**\n${bar(n, 100)} **${n}%**`);
    }

    if (["abracar", "beijar", "tapa"].includes(name)) {
      const t = i.options.getUser("usuario");
      if (t.bot || t.id === me.id) return reply("😅 Escolha outra pessoa.", true);
      const messages = {
        abracar: `🤗 ${me} abraçou ${t}!`,
        beijar: `😘 ${me} mandou um beijo para ${t}!`,
        tapa: `🖐️ ${me} deu um tapa de brincadeira em ${t}!`
      };
      const colors = { abracar: 0xff8eb2, beijar: 0xf48fb1, tapa: 0xf1c40f };
      const embed = em(messages[name], "", colors[name]);
      const gif = await actionGif(name);
      if (gif) embed.setImage(gif);
      return i.reply({ embeds: [embed], allowedMentions: { parse: ["users"] } });
    }

    if (name === "casar") {
      const t = i.options.getUser("usuario");

      if (t.bot || t.id === me.id) return reply("❌ Escolha outra pessoa.", true);
      if (data.marriages[me.id] || data.marriages[t.id]) {
        return reply("💍 Uma das pessoas já está casada no bot.", true);
      }

      data.marriages[me.id] = t.id;
      data.marriages[t.id] = me.id;
      save();

      return reply(`💍 ${me} e ${t} agora estão casados no YSIS MC!`);
    }

    if (name === "divorciar") {
      const p = data.marriages[me.id];
      if (!p) return reply("Você não tem casamento registrado.", true);

      delete data.marriages[me.id];
      delete data.marriages[p];
      save();

      return reply("💔 Casamento encerrado.");
    }

    if (name === "rate") {
      return reply(`⭐ **${i.options.getString("texto")}** recebeu **${rand(0, 10)}/10**.`);
    }

    if (name === "limpar") {
      const n = i.options.getInteger("quantidade");
      const del = await i.channel.bulkDelete(n, true);

      await i.reply({ content: `🧹 Apaguei ${del.size} mensagens.`, ephemeral: true });
      await log(i.guild, "🧹 Mensagens apagadas", `${me} apagou ${del.size} mensagens em ${i.channel}.`);
      return;
    }

    if (["expulsar", "banir", "timeout"].includes(name)) {
      const t = i.options.getUser("usuario");
      const m = await i.guild.members.fetch(t.id).catch(() => null);
      const reason = i.options.getString("motivo") || `Ação de moderação por ${me.tag}`;

      if (!m) return reply("❌ Membro não encontrado.", true);
      if (t.id === me.id || t.id === client.user.id) return reply("❌ Alvo inválido.", true);

      if (name === "expulsar") {
        if (!m.kickable) return reply("❌ Não consigo expulsar; confira hierarquia/permissões.", true);
        await m.kick(reason);
      }

      if (name === "banir") {
        if (!m.bannable) return reply("❌ Não consigo banir; confira hierarquia/permissões.", true);
        await m.ban({ reason });
      }

      if (name === "timeout") {
        if (!m.moderatable) return reply("❌ Não consigo aplicar timeout; confira hierarquia/permissões.", true);
        await m.timeout(i.options.getInteger("minutos") * 60000, reason);
      }

      await i.reply(`✅ **${name}** aplicado a ${t}.\nMotivo: ${reason}`);
      await log(i.guild, `🛡️ ${name}`, `Moderador: ${me}\nAlvo: ${t}\nMotivo: ${reason}`);
      return;
    }

    if (["avisar", "avisos", "limparavisos"].includes(name)) {
      const t = i.options.getUser("usuario");

      if (name === "avisar") {
        const reason = i.options.getString("motivo");
        (data.warns[t.id] ||= []).push({ by: me.id, reason, at: Date.now() });
        save();

        await i.reply(`⚠️ ${t} recebeu advertência: **${reason}**`);
        await log(i.guild, "⚠️ Advertência", `Membro: ${t}\nEquipe: ${me}\nMotivo: ${reason}`);
        return;
      }

      const list = data.warns[t.id] || [];

      if (name === "avisos") {
        return reply(
          list.length
            ? `⚠️ Advertências de ${t}:\n${list.slice(-10).map((w, n) => `${n + 1}. ${w.reason} — <@${w.by}> — <t:${Math.floor(w.at / 1000)}:R>`).join("\n")}`
            : `${t} não tem advertências.`,
          true
        );
      }

      delete data.warns[t.id];
      save();

      return reply(`✅ Advertências de ${t} removidas.`, true);
    }

    if (name === "lock" || name === "unlock") {
      await i.channel.permissionOverwrites.edit(i.guild.roles.everyone, {
        SendMessages: name === "unlock" ? null : false
      });

      return reply(name === "lock" ? "🔒 Canal bloqueado." : "🔓 Canal desbloqueado.");
    }

    if (name === "dizer") {
      const target = i.options.getChannel("canal") || i.channel;
      if (!target?.isTextBased()) return reply("❌ Escolha um canal de texto.", true);
      await target.send({ content: i.options.getString("texto"), allowedMentions: { parse: [] } });
      return reply(`✅ Mensagem enviada em ${target}.`, true);
    }

    if (name === "anunciar") {
      const ch = i.options.getChannel("canal") || i.channel;

      await ch.send({
        embeds: [
          em(
            `📢 ${i.options.getString("titulo")}`,
            i.options.getString("texto"),
            0x3498db
          )
        ]
      });

      return reply(`✅ Anúncio enviado em ${ch}.`, true);
    }

    if (name === "configurar") {
      const type = i.options.getString("tipo");
      const channel = i.options.getChannel("canal");
      const message = i.options.getString("mensagem");
      const cfg = guildConfig(i.guild.id);
      if (!channel && !message) return reply("Informe um canal e/ou uma mensagem para salvar.", true);
      if (type === "boasvindas") {
        if (channel) cfg.welcomeChannelId = channel.id;
        if (message) cfg.welcomeMessage = message;
      } else if (type === "saida") {
        if (channel) cfg.goodbyeChannelId = channel.id;
        if (message) cfg.goodbyeMessage = message;
      } else if (type === "logs") {
        if (!channel) return reply("Para configurar os logs, selecione o canal.", true);
        cfg.logChannelId = channel.id;
      }
      save();
      const labels = { boasvindas: "Boas-vindas", saida: "Despedida", logs: "Logs" };
      return reply(`✅ Configuração **${labels[type]}** salva.${channel ? ` Canal: ${channel}.` : ""}${message ? " Mensagem personalizada atualizada." : ""}`, true);
    }

    if (name === "configloja") {
      const action = i.options.getString("acao");
      const role = i.options.getRole("cargo");
      const price = i.options.getInteger("preco");
      const cfg = guildConfig(i.guild.id);
      if (role.id === i.guild.id || role.managed) return reply("❌ Esse cargo não pode ser vendido.", true);
      if (action === "adicionar") {
        if (!price) return reply("Informe `preco` para cadastrar ou atualizar a oferta.", true);
        if (!role.editable) return reply("❌ Coloque o cargo do bot acima do cargo que será vendido.", true);
        cfg.roleShop[role.id] = { price, updatedAt: Date.now() };
        save();
        return reply(`✅ Cargo **${role.name}** cadastrado na loja por **${fmt(price)} moedas**. A oferta aparece/atualiza automaticamente em \`/loja\`.`, true);
      }
      if (!cfg.roleShop[role.id]) return reply("Esse cargo não estava cadastrado na loja.", true);
      delete cfg.roleShop[role.id];
      save();
      return reply(`✅ Oferta do cargo **${role.name}** removida da loja.`, true);
    }

    if (name === "cargo") {
      const action = i.options.getString("acao");
      const targetUser = i.options.getUser("usuario");
      const role = i.options.getRole("cargo");
      if (role.id === i.guild.id || role.managed || !role.editable) return reply("❌ Não posso administrar esse cargo. Confira a hierarquia e se ele é gerenciado por integração.", true);
      if (targetUser.bot && targetUser.id === client.user.id) return reply("Não posso administrar meus próprios cargos por esse comando.", true);
      const targetMember = await i.guild.members.fetch(targetUser.id).catch(() => null);
      if (!targetMember) return reply("Membro não encontrado no servidor.", true);
      if (action === "dar") {
        await targetMember.roles.add(role, `Comando /cargo por ${me.tag}`);
        return reply(`✅ Cargo ${role} atribuído a ${targetUser}.`, true);
      }
      if (!targetMember.roles.cache.has(role.id)) return reply("Esse membro não possui esse cargo.", true);
      await targetMember.roles.remove(role, `Comando /cargo por ${me.tag}`);
      return reply(`✅ Cargo ${role} removido de ${targetUser}.`, true);
    }

    if (name === "pedidosjogo") {
      const pending = data.gameOrders.filter(o => o.guildId === i.guild.id && o.status === "pendente").slice(-15).reverse();
      const desc = pending.map(o => `**${o.id}** · <@${o.userId}> → **${o.minecraftNick}** · ${itemName(o.item)} ×${o.quantity} · ${fmt(o.total)} moedas · <t:${Math.floor(o.createdAt / 1000)}:R>`).join("\n") || "Não há pedidos pendentes.";
      return i.reply({ ephemeral: true, embeds: [em("📦 Pedidos Minecraft pendentes", desc + "\n\nDepois de entregar o item dentro do jogo, use `/concluirpedido id`. ", 0xe67e22)] });
    }

    if (name === "concluirpedido") {
      const id = i.options.getString("id").trim().toUpperCase();
      const order = data.gameOrders.find(o => o.guildId === i.guild.id && o.id.toUpperCase() === id);
      if (!order) return reply("❌ Pedido não encontrado.", true);
      if (order.status !== "pendente") return reply(`Esse pedido já está marcado como **${order.status}**.`, true);
      order.status = "entregue";
      order.deliveredAt = Date.now();
      order.deliveredBy = me.id;
      save();
      return reply(`✅ Pedido **${order.id}** marcado como entregue. Lembre-se: só use esse comando depois de entregar o item no Minecraft.`, true);
    }

    if (name === "cancelarpedido") {
      const id = i.options.getString("id").trim().toUpperCase();
      const order = data.gameOrders.find(o => o.guildId === i.guild.id && o.id.toUpperCase() === id);
      if (!order) return reply("❌ Pedido não encontrado.", true);
      if (order.status !== "pendente") return reply("Só pedidos pendentes podem ser cancelados.", true);
      order.status = "cancelado";
      order.cancelledAt = Date.now();
      order.cancelledBy = me.id;
      user(order.userId).coins += order.total;
      save();
      return reply(`✅ Pedido **${order.id}** cancelado e ${fmt(order.total)} moedas devolvidas a <@${order.userId}>.`, true);
    }

    if (name === "ticket") {
      const existing = i.guild.channels.cache.find(
        c => c.type === ChannelType.GuildText && c.topic === `ticket:${me.id}`
      );

      if (existing) return reply(`Você já tem um ticket: ${existing}`, true);

      const safe = me.username.toLowerCase().replace(/[^a-z0-9-]/g, "").slice(0, 16) || "membro";

      const ch = await i.guild.channels.create({
        name: `ticket-${safe}`.slice(0, 90),
        type: ChannelType.GuildText,
        topic: `ticket:${me.id}`,
        permissionOverwrites: [
          {
            id: i.guild.roles.everyone.id,
            deny: [PermissionFlagsBits.ViewChannel]
          },
          {
            id: me.id,
            allow: [
              PermissionFlagsBits.ViewChannel,
              PermissionFlagsBits.SendMessages,
              PermissionFlagsBits.ReadMessageHistory
            ]
          },
          {
            id: client.user.id,
            allow: [
              PermissionFlagsBits.ViewChannel,
              PermissionFlagsBits.SendMessages,
              PermissionFlagsBits.ReadMessageHistory,
              PermissionFlagsBits.ManageChannels
            ]
          }
        ]
      });

      await ch.send(`${me}, descreva seu problema. Use \`/fecharticket\` para fechar.`);
      return reply(`🎫 Ticket criado: ${ch}`, true);
    }

    if (name === "fecharticket") {
      if (
        i.channel.type !== ChannelType.GuildText ||
        !i.channel.topic?.startsWith("ticket:")
      ) {
        return reply("Este comando só funciona em tickets.", true);
      }

      const owner = i.channel.topic.slice(7);
      const mod = i.memberPermissions.has(PermissionFlagsBits.ManageChannels);

      if (me.id !== owner && !mod) {
        return reply("Só o autor ou a equipe pode fechar.", true);
      }

      await reply("🔒 Ticket será fechado em 3 segundos.");
      setTimeout(() => i.channel.delete("Ticket fechado").catch(() => {}), 3000);
      return;
    }
  } catch (e) {
    console.error(`Erro no comando ${name}:`, e);

    const msg = "❌ Ocorreu um erro. Confira as permissões do bot e os logs do Railway.";

    if (i.replied || i.deferred) {
      await i.followUp({ content: msg, ephemeral: true }).catch(() => {});
    } else {
      await i.reply({ content: msg, ephemeral: true }).catch(() => {});
    }
  }
});

client.login(TOKEN);
