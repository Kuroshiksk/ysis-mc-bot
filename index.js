const {
  Client,
  GatewayIntentBits,
  SlashCommandBuilder,
  REST,
  Routes,
  EmbedBuilder,
  PermissionFlagsBits,
  ChannelType,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  AttachmentBuilder
} = require("discord.js");
const {
  joinVoiceChannel, createAudioPlayer, createAudioResource,
  AudioPlayerStatus, VoiceConnectionStatus, entersState,
  NoSubscriberBehavior
} = require("@discordjs/voice");
const play = require("play-dl");
const { createCanvas, loadImage } = require("@napi-rs/canvas");

const fs = require("node:fs");
const path = require("node:path");

const TOKEN = process.env.DISCORD_TOKEN;
const OWNER_USER_ID = process.env.OWNER_USER_ID || "";
const OWNER_USERNAME = (process.env.OWNER_USERNAME || "kuroshikk").toLowerCase();
const CLIENT_ID = process.env.CLIENT_ID;
const GUILD_ID = process.env.GUILD_ID;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || "";
const AI_MODEL = process.env.AI_MODEL || "gpt-4o-mini";
const IMAGE_MODEL = process.env.IMAGE_MODEL || "gpt-image-1";
const MUSIC_AUTOPLAY_URL = process.env.MUSIC_AUTOPLAY_URL || "";
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
  gameOrders: [],
  promotions: []
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
if (!Array.isArray(data.promotions)) data.promotions = [];

function guildConfig(guildId) {
  if (!data.configs[guildId] || typeof data.configs[guildId] !== "object") data.configs[guildId] = {};
  const c = data.configs[guildId];
  if (!Object.prototype.hasOwnProperty.call(c, "welcomeChannelId")) c.welcomeChannelId = WELCOME_CHANNEL_ID || null;
  if (!Object.prototype.hasOwnProperty.call(c, "welcomeMessage")) c.welcomeMessage = "Olá {user}! Seja bem-vindo(a) ao **{server}**!\n\n⛏️ **IP:** `{ip}`\n🌐 **Site:** {site}\n📜 Leia as regras e divirta-se!";
  if (!Object.prototype.hasOwnProperty.call(c, "goodbyeChannelId")) c.goodbyeChannelId = GOODBYE_CHANNEL_ID || null;
  if (!Object.prototype.hasOwnProperty.call(c, "goodbyeMessage")) c.goodbyeMessage = "👋 **{username}** saiu do servidor. Até a próxima!";
  if (!Object.prototype.hasOwnProperty.call(c, "logChannelId")) c.logChannelId = LOG_CHANNEL_ID || null;
  if (!c.roleShop || typeof c.roleShop !== "object" || Array.isArray(c.roleShop)) c.roleShop = {};
  if (!c.currencyName) c.currencyName = "moedas";
  if (!c.currencyEmoji) c.currencyEmoji = "🪙";
  if (!Object.prototype.hasOwnProperty.call(c, "storeChannelId")) c.storeChannelId = null;
  if (!Object.prototype.hasOwnProperty.call(c, "promotionsChannelId")) c.promotionsChannelId = null;
  if (!Array.isArray(c.promotionRoles)) c.promotionRoles = [];
  if (!Array.isArray(c.supportRoles)) c.supportRoles = [];
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
      lastXP: 0,
      bio: "Ainda escrevendo minha história no YSIS MC.",
      frame: "azul",
      ownedFrames: ["azul"],
      featuredUntil: 0,
      reputation: 0,
      lastRep: 0,
      lastHunt: 0
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
    lastXP: 0,
    reputation: 0,
    lastRep: 0,
    lastHunt: 0
  })) {
    if (typeof u[k] !== "number" || !Number.isFinite(u[k])) {
      u[k] = v;
    }
  }

  if (!u.inventory || typeof u.inventory !== "object" || Array.isArray(u.inventory)) {
    u.inventory = {};
  }
  if (typeof u.bio !== "string") u.bio = "Ainda escrevendo minha história no YSIS MC.";
  if (typeof u.frame !== "string") u.frame = "azul";
  if (!Array.isArray(u.ownedFrames)) u.ownedFrames = ["azul"];
  if (!u.ownedFrames.includes("azul")) u.ownedFrames.unshift("azul");
  if (typeof u.featuredUntil !== "number") u.featuredUntil = 0;

  return u;
}

const achievementCatalog = [
  { id: "primeiros_passos", name: "Primeiros Passos", icon: "🌱", desc: "Alcance o nível 1.", test: p => level(p.xp) >= 1 },
  { id: "veterano", name: "Veterano", icon: "🎖️", desc: "Alcance o nível 10.", test: p => level(p.xp) >= 10 },
  { id: "lenda", name: "Lenda do YSIS", icon: "👑", desc: "Alcance o nível 25.", test: p => level(p.xp) >= 25 },
  { id: "rico", name: "Mão de Ouro", icon: "💰", desc: "Junte 10.000 moedas na carteira e no banco.", test: p => p.coins + p.bank >= 10000 },
  { id: "colecionador", name: "Colecionador", icon: "🎒", desc: "Tenha 5 tipos de itens no inventário.", test: p => Object.keys(p.inventory || {}).filter(k => p.inventory[k] > 0).length >= 5 },
  { id: "sequencia", name: "Constância", icon: "🔥", desc: "Consiga uma sequência diária de 7 dias.", test: p => p.dailyStreak >= 7 },
  { id: "estiloso", name: "Estiloso", icon: "🖼️", desc: "Desbloqueie uma moldura além da clássica.", test: p => (p.ownedFrames || []).some(f => f !== "azul") },
  { id: "social", name: "Perfil Completo", icon: "✨", desc: "Escreva uma biografia personalizada.", test: p => Boolean(p.bio && !p.bio.startsWith("Ainda escrevendo")) },
  { id: "popular", name: "Queridinho da Comunidade", icon: "💖", desc: "Receba 10 pontos de reputação.", test: p => (p.reputation || 0) >= 10 }
];
function unlockedAchievements(profile) { return achievementCatalog.filter(a => a.test(profile)); }
function isOwner(interaction) {
  const id = interaction?.user?.id;
  const username = String(interaction?.user?.username || "").toLowerCase();
  return Boolean((OWNER_USER_ID && id === OWNER_USER_ID) || username === OWNER_USERNAME);
}
const rand = (a, b) => Math.floor(Math.random() * (b - a + 1)) + a;
const fmt = n => Number(n || 0).toLocaleString("pt-BR");
const level = xp => Math.floor(Math.sqrt(Math.max(0, xp) / 100));

const bar = (n, max) => {
  const f = Math.max(0, Math.min(10, Math.floor((max ? n / max : 0) * 10)));
  return "🟦".repeat(f) + "⬛".repeat(10 - f);
};

async function renderProfileCard(target, profile, guild) {
  // Cartão intencionalmente simples, inspirado em cartões de perfil de bots:
  // banner discreto, avatar/nome, XP, poucas insígnias, bio e estatísticas.
  const W = 1200, H = 620;
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext("2d");
  const bg = ctx.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, "#08111f"); bg.addColorStop(1, "#111b2b");
  ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);

  const rounded = (x,y,w,h,r,fill,stroke=null) => {
    ctx.beginPath(); ctx.roundRect(x,y,w,h,r); ctx.fillStyle=fill; ctx.fill();
    if (stroke) { ctx.strokeStyle=stroke; ctx.lineWidth=1.2; ctx.stroke(); }
  };
  const txt = (value,x,y,size,color="#edf4ff",weight="500") => {
    ctx.font = `${weight} ${size}px Arial`;
    ctx.fillStyle = color;
    ctx.fillText(String(value), x, y);
  };
  const line = (x1,y1,x2,y2,color="#27364a") => {
    ctx.beginPath(); ctx.moveTo(x1,y1); ctx.lineTo(x2,y2); ctx.strokeStyle=color; ctx.lineWidth=1; ctx.stroke();
  };
  const clipText = (value, maxWidth, size, weight="500") => {
    ctx.font = `${weight} ${size}px Arial`;
    let out = String(value || "");
    while (out.length && ctx.measureText(out).width > maxWidth) out = out.slice(0,-2);
    return out.length < String(value || "").length ? `${out.trimEnd()}…` : out;
  };

  // Banner de perfil sem excesso de efeitos; cores consistentes com a marca YSIS MC.
  rounded(18,18,W-36,174,22,"#10294a","#284d78");
  ctx.save(); ctx.beginPath(); ctx.roundRect(18,18,W-36,174,22); ctx.clip();
  const banner = ctx.createLinearGradient(18,18,W-18,192);
  banner.addColorStop(0,"#102448"); banner.addColorStop(.55,"#164b79"); banner.addColorStop(1,"#20264b");
  ctx.fillStyle=banner; ctx.fillRect(18,18,W-36,174);
  // Formas geométricas suaves no banner, sem poluir o perfil.
  ctx.strokeStyle="rgba(130,190,255,.10)"; ctx.lineWidth=2;
  for (let i=0;i<7;i++) { ctx.beginPath(); ctx.moveTo(620+i*90,18); ctx.lineTo(520+i*90,192); ctx.stroke(); }
  ctx.restore();
  txt("YSIS MC",52,72,30,"#ffffff","700");
  txt("SEU ESPAÇO, SEU ESTILO",54,101,14,"#b9d9f5","500");
  rounded(1000,42,150,38,19,"rgba(4,15,31,.65)","#35516e");
  ctx.beginPath(); ctx.arc(1021,61,5,0,Math.PI*2); ctx.fillStyle="#59d69b"; ctx.fill();
  txt("PERFIL",1035,67,14,"#e7f0ff","600");

  // Avatar e identificação.
  ctx.save(); ctx.beginPath(); ctx.arc(112,190,66,0,Math.PI*2); ctx.fillStyle="#0b1626"; ctx.fill();
  ctx.strokeStyle="#b9d6f5"; ctx.lineWidth=4; ctx.stroke();
  try {
    const avatar = await loadImage(target.displayAvatarURL({ extension:"png", size:256 }));
    ctx.beginPath(); ctx.arc(112,190,60,0,Math.PI*2); ctx.clip(); ctx.drawImage(avatar,52,130,120,120);
  } catch {}
  ctx.restore();
  txt(clipText(target.username,540,32,"700"),202,159,32,"#ffffff","700");
  txt(`@${clipText(target.username,450,17)}`,204,188,17,"#9fc5ed","500");
  const isOwner = Boolean(OWNER_USER_ID && target.id === OWNER_USER_ID);
  if (isOwner) {
    rounded(203,204,145,28,14,"#29233b","#705a9b");
    txt("♛ Dono do servidor",215,223,13,"#e5d7ff","600");
  }
  const frame = frameCatalog[profile.frame] || frameCatalog.azul;
  txt(`${frame.emoji || "◈"} ${frame.name || "Azul"}`,203,253,13,"#9db7d6","500");

  // Nível e XP: um painel só, com espaço e leitura clara.
  rounded(28,286,550,190,18,"#0b1626","#263d58");
  txt("NÍVEL",52,322,15,"#9fb8d5","700");
  const lv = level(profile.xp || 0);
  const currentXP = Math.max(0,(profile.xp||0) - lv*lv*100);
  const neededXP = Math.max(1,(lv+1)**2*100 - lv*lv*100);
  const pct = Math.max(0,Math.min(1,currentXP/neededXP));
  txt(lv,52,408,72,"#67c9ff","700");
  txt(`${fmt(profile.xp||0)} XP`,160,359,22,"#f1f6ff","600");
  txt(`${fmt(currentXP)} / ${fmt(neededXP)} XP para o próximo nível`,160,386,14,"#9db6d4","500");
  rounded(160,405,365,15,8,"#1b2b40");
  if (pct > 0) rounded(160,405,Math.max(14,365*pct),15,8,"#4ab8ee");
  txt(`${Math.round(pct*100)}%`,482,445,14,"#91dcff","600");

  // Insígnias compactas: mostrar apenas as desbloqueadas, no máximo cinco.
  rounded(598,286,574,190,18,"#0b1626","#263d58");
  txt("INSÍGNIAS",622,322,15,"#9fb8d5","700");
  const badges = unlockedAchievements(profile).slice(0,5);
  const colors = ["#d9b66d","#69c9ed","#b99be8","#72d9b4","#e99dbd"];
  for (let i=0;i<Math.max(1,badges.length);i++) {
    const b = badges[i]; const x=665+i*103;
    ctx.beginPath(); ctx.arc(x,377,27,0,Math.PI*2); ctx.fillStyle="#111f32"; ctx.fill();
    ctx.strokeStyle=colors[i%colors.length]; ctx.lineWidth=2; ctx.stroke();
    txt(b?.icon || "✦",x-10,385,22,colors[i%colors.length],"600");
    if (b) txt(clipText(b.name,88,11,"600"),x-42,425,11,"#d9e5f4","600");
  }
  if (!badges.length) txt("Conquiste insígnias participando do servidor",622,434,13,"#8fa5bf","500");
  else txt(`${unlockedAchievements(profile).length} conquista(s) desbloqueada(s)`,622,453,12,"#8fa5bf","500");

  // Bio em painel discreto, semelhante ao modelo de referência.
  rounded(28,494,1144,96,16,"#0b1626","#263d58");
  txt("SOBRE MIM",50,523,14,"#9fb8d5","700");
  const bio = String(profile.bio || "Ainda estou escrevendo minha história no YSIS MC.").replace(/\s+/g," ");
  txt(clipText(bio,1080,17,"500"),50,553,17,"#edf4ff","500");
  const stats = `Moedas ${fmt(profile.coins||0)}   ·   Banco ${fmt(profile.bank||0)}   ·   Reputação ${fmt(profile.reputation||0)}`;
  txt(clipText(stats,1080,13,"500"),50,576,13,"#9db6d4","500");
  txt("YSIS MC",28,610,12,"#6d8eaf","700");
  txt("Um perfil simples, com a sua cara.",1060,610,11,"#6d8eaf","500");
  return canvas.toBuffer("image/png");
}

function em(title, desc = "", color = 0x2878ff) {
  const e = new EmbedBuilder()
    .setColor(color)
    .setTitle(title)
    .setTimestamp()
    .setFooter({ text: "YSIS MC • Sua lenda, seu império" });

  if (desc) e.setDescription(desc);
  return e;
}

const frameCatalog = {
  azul: { name: "Azul clássico", emoji: "🔹", color: 0x2878ff, price: 0 },
  roxo: { name: "Roxo neon", emoji: "🟣", color: 0x9b59b6, price: 500 },
  vermelho: { name: "Vermelho rubi", emoji: "🔴", color: 0xe74c3c, price: 800 },
  dourado: { name: "Dourado lendário", emoji: "🌟", color: 0xf1c40f, price: 1500 },
  verde: { name: "Verde esmeralda", emoji: "🟢", color: 0x2ecc71, price: 350 }
};

const currencyName = guildId => guildConfig(guildId).currencyName || "moedas";
const currencyEmoji = guildId => guildConfig(guildId).currencyEmoji || "🪙";
const moneyText = (guildId, amount) => `${currencyEmoji(guildId)} **${fmt(amount)} ${currencyName(guildId)}**`;
const hasPerm = (memberPermissions, permission) => Boolean(memberPermissions?.has(PermissionFlagsBits.Administrator) || memberPermissions?.has(permission));
function canPromote(member, cfg, memberPermissions) {
  if (!member) return false;
  if (memberPermissions?.has(PermissionFlagsBits.Administrator) || memberPermissions?.has(PermissionFlagsBits.ManageRoles)) return true;
  if (member.permissions?.has?.(PermissionFlagsBits.Administrator) || member.permissions?.has?.(PermissionFlagsBits.ManageRoles)) return true;
  const roleIds = member.roles?.cache ? [...member.roles.cache.keys()] : (Array.isArray(member.roles) ? member.roles : []);
  return (cfg.promotionRoles || []).some(roleId => roleIds.includes(roleId));
}
function panelCanUse(memberPermissions, member, commandName, cfg) {
  const permissions = {
    configurar: PermissionFlagsBits.ManageGuild, configloja: PermissionFlagsBits.ManageGuild,
    configmoeda: PermissionFlagsBits.ManageGuild, configcanais: PermissionFlagsBits.ManageGuild,
    configequipe: PermissionFlagsBits.ManageGuild, pedidosjogo: PermissionFlagsBits.ManageGuild,
    concluirpedido: PermissionFlagsBits.ManageGuild, cancelarpedido: PermissionFlagsBits.ManageGuild,
    adicionarmoedas: PermissionFlagsBits.ManageGuild, removermoedas: PermissionFlagsBits.ManageGuild,
    setarmoedas: PermissionFlagsBits.ManageGuild, cargo: PermissionFlagsBits.ManageRoles,
    limpar: PermissionFlagsBits.ManageMessages, dizer: PermissionFlagsBits.ManageMessages,
    anunciar: PermissionFlagsBits.ManageMessages, anunciarloja: PermissionFlagsBits.ManageMessages,
    promocao: PermissionFlagsBits.ManageMessages, expulsar: PermissionFlagsBits.KickMembers,
    banir: PermissionFlagsBits.BanMembers, timeout: PermissionFlagsBits.ModerateMembers,
    avisar: PermissionFlagsBits.ModerateMembers, avisos: PermissionFlagsBits.ModerateMembers,
    limparavisos: PermissionFlagsBits.ModerateMembers, lock: PermissionFlagsBits.ManageChannels,
    unlock: PermissionFlagsBits.ManageChannels
  };
  if (["promover", "rebaixar"].includes(commandName)) return canPromote(member, cfg, memberPermissions);
  const needed = permissions[commandName];
  return !needed || hasPerm(memberPermissions, needed);
}

const panelSections = {
  geral: { title: "🏠 Central do YSIS MC", intro: "Comandos essenciais para conhecer e usar o servidor.", commands: ["/ajuda — abre esta central", "/ip — endereço e porta do Minecraft", "/site — links oficiais", "/servidor — informações do Discord", "/avatar — veja um avatar", "/perfil — seu perfil personalizado"] },
  economia: { title: "💰 Economia", intro: "Ganhe, guarde e movimente seu saldo. Os valores são salvos pelo bot.", commands: ["/daily — recompensa diária e sequência", "/trabalhar — receba pelo trabalho", "/saldo — carteira e banco", "/pagar — transfira para outro membro", "/depositar — guarde no banco", "/sacar — retire do banco", "/top — ranking de riqueza", "/rankxp — ranking de XP", "/cacar — caça por recompensas", "/pescar — procure recompensas", "/aventura — exploração com recompensa", "/minerar — encontre recursos", "/moeda — cara ou coroa", "/dado — role um dado"] },
  loja: { title: "🛍️ Lojas e pedidos", intro: "Use a economia para adquirir cargos e itens. Pedidos Minecraft precisam ser entregues pela equipe no jogo.", commands: ["/loja — ofertas de cargos do Discord", "/comprarcargo — compre um cargo", "/lojajogo — catálogo Minecraft", "/comprarjogo — abra um pedido de item", "/inventario — seus itens", "/vender — venda itens do inventário", "/anunciarloja — publicar no canal configurado", "/promocao — publicar promoção no canal configurado"] },
  social: { title: "🎮 Social e diversão", intro: "Comandos leves para interagir com a comunidade.", commands: ["/pergunta — consulte a bola mágica", "/ship — compatibilidade divertida", "/abracar — envie um abraço", "/beijar — mande um beijo", "/tapa — tapa de brincadeira", "/casar — peça em casamento", "/divorciar — encerre o casamento", "/rate — avaliação aleatória", "/ticket — abra atendimento privado"] },
  perfil: { title: "✨ Perfil e personalização", intro: "Deixe seu perfil com a sua cara. Molduras podem ser compradas com a moeda do servidor.", commands: ["/perfil — veja seu perfil", "/conquistas — acompanhe suas conquistas", "/insignias — veja suas insígnias", "/biografia — edite sua descrição", "/molduras — veja a coleção", "/comprarmoldura — desbloqueie uma moldura", "/usarmoldura — equipe uma moldura", "/destacarperfil — destaque por 24 horas", "/destaques — veja os perfis destacados", "/rep — dê reputação a um membro"] },
  equipe: { title: "🛡️ Painel da equipe", intro: "Estas opções aparecem aqui conforme as permissões do seu cargo. Use sempre os comandos de moderação com responsabilidade.", commands: ["/promover — atribua um cargo autorizado", "/rebaixar — remova um cargo autorizado", "/cargo — administre cargos", "/configequipe — configure cargos de promoção/suporte", "/configmoeda — defina o nome e emoji da moeda", "/adicionarmoedas — credite saldo", "/removermoedas — retire saldo", "/setarmoedas — defina saldo exato", "/configcanais — selecione canais da loja/promoções", "/configurar — boas-vindas, saídas e logs", "/configloja — edite a loja de cargos", "/anunciar — anúncio geral", "/limpar — apague mensagens", "/expulsar — expulse um membro", "/banir — bane um membro", "/timeout — timeout temporário", "/avisar — registre advertência", "/avisos — consulte advertências", "/limparavisos — limpe advertências", "/lock e /unlock — bloqueie/libere um canal", "/pedidosjogo — veja pedidos pendentes", "/concluirpedido — confirme entrega", "/cancelarpedido — cancele e devolva saldo", "/dizer — envie texto como bot", "/fecharticket — feche um ticket"] }
};

function buildPanelEmbed(sectionKey, interaction) {
  const section = panelSections[sectionKey] || panelSections.geral;
  const cfg = interaction.guild ? guildConfig(interaction.guild.id) : { promotionRoles: [] };
  const member = interaction.member;
  const visible = section.commands.filter(line => {
    const match = line.match(/^\/(\w+)/);
    if (!match) return true;
    return isOwner(interaction) || panelCanUse(interaction.memberPermissions, member, match[1], cfg);
  });
  return em(section.title, `${section.intro}

${visible.join("\n") || "Nenhum comando desta categoria está liberado para seu cargo."}

${currencyEmoji(interaction.guild?.id)} Moeda atual: **${currencyName(interaction.guild?.id)}**`, sectionKey === "equipe" ? 0xe67e22 : 0x2878ff);
}
function panelButtons() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("ysispanel:geral").setLabel("Geral").setEmoji("🏠").setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId("ysispanel:economia").setLabel("Economia").setEmoji("💰").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId("ysispanel:loja").setLabel("Lojas").setEmoji("🛍️").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId("ysispanel:social").setLabel("Social").setEmoji("🎮").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId("ysispanel:perfil").setLabel("Perfil").setEmoji("✨").setStyle(ButtonStyle.Secondary)
  );
}
function panelStaffButtons() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("ysispanel:equipe").setLabel("Equipe").setEmoji("🛡️").setStyle(ButtonStyle.Danger)
  );
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

add(new SlashCommandBuilder().setName("ajuda").setDescription("Abra o painel de comandos por categoria."));
add(new SlashCommandBuilder().setName("painel").setDescription("Abra o painel visual de funções disponíveis."));
add(new SlashCommandBuilder().setName("ip").setDescription("Veja o IP do Minecraft."));
add(new SlashCommandBuilder().setName("site").setDescription("Veja o site do YSIS MC."));
add(new SlashCommandBuilder().setName("servidor").setDescription("Informações do servidor Discord."));
add(new SlashCommandBuilder().setName("avatar").setDescription("Veja um avatar.").addUserOption(o => o.setName("usuario").setDescription("Pessoa").setRequired(false)));
add(new SlashCommandBuilder().setName("perfil").setDescription("Veja seu perfil personalizado.").addUserOption(o => o.setName("usuario").setDescription("Perfil para consultar").setRequired(false)));
add(new SlashCommandBuilder().setName("conquistas").setDescription("Veja suas conquistas desbloqueadas.").addUserOption(o => o.setName("usuario").setDescription("Pessoa para consultar").setRequired(false)));
add(new SlashCommandBuilder().setName("insignias").setDescription("Veja as insígnias do perfil.").addUserOption(o => o.setName("usuario").setDescription("Pessoa para consultar").setRequired(false)));
add(new SlashCommandBuilder().setName("biografia").setDescription("Edite a descrição do seu perfil.").addStringOption(o => o.setName("texto").setDescription("Descrição curta do perfil").setMaxLength(180).setRequired(true)));
add(new SlashCommandBuilder().setName("molduras").setDescription("Veja molduras de perfil disponíveis."));
add(new SlashCommandBuilder().setName("destaques").setDescription("Veja os perfis que estão em destaque."));
add(new SlashCommandBuilder().setName("comprarmoldura").setDescription("Compre uma moldura de perfil.").addStringOption(o => o.setName("moldura").setDescription("Moldura para desbloquear").setRequired(true).addChoices(...Object.entries(frameCatalog).filter(([k]) => k !== "azul").map(([value, f]) => ({ name: `${f.emoji} ${f.name} — ${f.price} moedas`.slice(0, 100), value })))));
add(new SlashCommandBuilder().setName("usarmoldura").setDescription("Equipe uma moldura que você possui.").addStringOption(o => o.setName("moldura").setDescription("Moldura desbloqueada").setRequired(true).addChoices(...Object.entries(frameCatalog).map(([value, f]) => ({ name: `${f.emoji} ${f.name}`.slice(0, 100), value })))));
add(new SlashCommandBuilder().setName("destacarperfil").setDescription("Destaque seu perfil por 24 horas."));
add(new SlashCommandBuilder().setName("daily").setDescription("Receba moedas diárias."));
add(new SlashCommandBuilder().setName("saldo").setDescription("Veja seu saldo privado."));
add(new SlashCommandBuilder().setName("trabalhar").setDescription("Trabalhe e ganhe moedas."));
add(new SlashCommandBuilder().setName("pagar").setDescription("Envie moedas.").addUserOption(o => o.setName("usuario").setDescription("Destinatário").setRequired(true)).addIntegerOption(o => o.setName("quantia").setDescription("Quantidade").setMinValue(1).setRequired(true)));
add(new SlashCommandBuilder().setName("depositar").setDescription("Deposite moedas no banco.").addIntegerOption(o => o.setName("quantia").setDescription("Quantidade").setMinValue(1).setRequired(true)));
add(new SlashCommandBuilder().setName("sacar").setDescription("Saque moedas do banco.").addIntegerOption(o => o.setName("quantia").setDescription("Quantidade").setMinValue(1).setRequired(true)));
add(new SlashCommandBuilder().setName("top").setDescription("Ranking de saldo total."));
add(new SlashCommandBuilder().setName("rankxp").setDescription("Veja o ranking de experiência e níveis."));
add(new SlashCommandBuilder().setName("rep").setDescription("Dê reputação a alguém (uma vez a cada 24 horas). ").addUserOption(o => o.setName("usuario").setDescription("Pessoa que merece reputação").setRequired(true)));
add(new SlashCommandBuilder().setName("cacar").setDescription("Vá caçar e tente encontrar moedas e XP."));
for (const [name, desc] of [["adicionarmoedas", "Adicione saldo a um membro."], ["removermoedas", "Retire saldo da carteira de um membro."], ["setarmoedas", "Defina o saldo exato da carteira de um membro."]]) {
  add(new SlashCommandBuilder().setName(name).setDescription(desc).setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addUserOption(o => o.setName("usuario").setDescription("Membro alvo").setRequired(true))
    .addIntegerOption(o => o.setName("quantia").setDescription("Quantidade").setMinValue(0).setMaxValue(1000000000).setRequired(true))
    .addStringOption(o => o.setName("motivo").setDescription("Motivo do ajuste (opcional)").setMaxLength(300).setRequired(false)));
}
add(new SlashCommandBuilder().setName("configmoeda").setDescription("Defina o nome e emoji da moeda do servidor.").setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
  .addStringOption(o => o.setName("nome").setDescription("Nome da moeda, ex.: YCoins").setMinLength(2).setMaxLength(20).setRequired(true))
  .addStringOption(o => o.setName("emoji").setDescription("Emoji para representar a moeda").setMaxLength(30).setRequired(true)));
add(new SlashCommandBuilder().setName("loja").setDescription("Veja a loja de cargos do servidor."));
add(new SlashCommandBuilder().setName("comprarcargo").setDescription("Compre um cargo da loja do Discord.").addStringOption(o => o.setName("item").setDescription("Cargo disponível na loja").setAutocomplete(true).setRequired(true)));
add(new SlashCommandBuilder().setName("lojajogo").setDescription("Veja a loja de itens do Minecraft."));
add(new SlashCommandBuilder().setName("comprarjogo").setDescription("Faça um pedido de item para o Minecraft.").addStringOption(o => o.setName("item").setDescription("Item do jogo").setRequired(true).addChoices(...choices)).addStringOption(o => o.setName("nick").setDescription("Seu nick exato no Minecraft").setRequired(true).setMaxLength(32)).addIntegerOption(o => o.setName("quantidade").setDescription("Quantidade, de 1 a 10").setMinValue(1).setMaxValue(10).setRequired(false)));
add(new SlashCommandBuilder().setName("configloja").setDescription("Configure os cargos vendidos na loja do Discord.").setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild).addStringOption(o => o.setName("acao").setDescription("Adicionar ou remover uma oferta").setRequired(true).addChoices({ name: "Adicionar/atualizar", value: "adicionar" }, { name: "Remover", value: "remover" })).addRoleOption(o => o.setName("cargo").setDescription("Cargo da oferta").setRequired(true)).addIntegerOption(o => o.setName("preco").setDescription("Preço em moedas (necessário para adicionar)").setMinValue(1).setMaxValue(10000000).setRequired(false)));
add(new SlashCommandBuilder().setName("configurar").setDescription("Configure canais e mensagens automáticas.").setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild).addStringOption(o => o.setName("tipo").setDescription("Qual configuração alterar").setRequired(true).addChoices({ name: "Boas-vindas", value: "boasvindas" }, { name: "Despedida", value: "saida" }, { name: "Canal de logs", value: "logs" })).addChannelOption(o => o.setName("canal").setDescription("Canal de texto destino").addChannelTypes(ChannelType.GuildText).setRequired(false)).addStringOption(o => o.setName("mensagem").setDescription("Modelo de mensagem (use {user}, {server}, {username}, {memberCount}, {ip}, {site})").setMaxLength(1500).setRequired(false)));
add(new SlashCommandBuilder().setName("configcanais").setDescription("Configure os canais de loja e promoções.").setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
  .addStringOption(o => o.setName("tipo").setDescription("Qual canal configurar").setRequired(true).addChoices({ name: "Canal da loja", value: "loja" }, { name: "Canal de promoções", value: "promocoes" }))
  .addChannelOption(o => o.setName("canal").setDescription("Canal de texto destino").addChannelTypes(ChannelType.GuildText).setRequired(true)));
add(new SlashCommandBuilder().setName("configequipe").setDescription("Defina quais cargos podem promover ou atender tickets.").setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
  .addStringOption(o => o.setName("tipo").setDescription("Grupo de equipe").setRequired(true).addChoices({ name: "Equipe de promoção", value: "promocao" }, { name: "Equipe de suporte/tickets", value: "suporte" }))
  .addStringOption(o => o.setName("acao").setDescription("Adicionar ou remover cargo do grupo").setRequired(true).addChoices({ name: "Adicionar", value: "adicionar" }, { name: "Remover", value: "remover" }))
  .addRoleOption(o => o.setName("cargo").setDescription("Cargo da equipe").setRequired(true)));
add(new SlashCommandBuilder().setName("promover").setDescription("Promova um membro para um cargo autorizado.")
  .addUserOption(o => o.setName("usuario").setDescription("Membro que será promovido").setRequired(true))
  .addRoleOption(o => o.setName("cargo").setDescription("Cargo que será atribuído").setRequired(true))
  .addStringOption(o => o.setName("motivo").setDescription("Motivo da promoção").setMaxLength(500).setRequired(false)));
add(new SlashCommandBuilder().setName("rebaixar").setDescription("Remova um cargo de um membro autorizado.")
  .addUserOption(o => o.setName("usuario").setDescription("Membro que será rebaixado").setRequired(true))
  .addRoleOption(o => o.setName("cargo").setDescription("Cargo que será removido").setRequired(true))
  .addStringOption(o => o.setName("motivo").setDescription("Motivo do rebaixamento").setMaxLength(500).setRequired(false)));
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
add(new SlashCommandBuilder().setName("anunciar").setDescription("Publique um anúncio geral.").setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages).addStringOption(o => o.setName("titulo").setDescription("Título").setRequired(true).setMaxLength(200)).addStringOption(o => o.setName("texto").setDescription("Conteúdo").setRequired(true).setMaxLength(3500)).addChannelOption(o => o.setName("canal").setDescription("Canal destino (opcional)").addChannelTypes(ChannelType.GuildText).setRequired(false)));
add(new SlashCommandBuilder().setName("anunciarloja").setDescription("Publique novidade no canal configurado da loja.").setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages).addStringOption(o => o.setName("titulo").setDescription("Título da novidade").setRequired(true).setMaxLength(200)).addStringOption(o => o.setName("texto").setDescription("Detalhes da loja/oferta").setRequired(true).setMaxLength(3500)).addChannelOption(o => o.setName("canal").setDescription("Sobrescrever canal configurado (opcional)").addChannelTypes(ChannelType.GuildText).setRequired(false)));
add(new SlashCommandBuilder().setName("promocao").setDescription("Publique uma promoção no canal configurado.").setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages).addStringOption(o => o.setName("titulo").setDescription("Título da promoção").setRequired(true).setMaxLength(200)).addStringOption(o => o.setName("texto").setDescription("Descreva a promoção").setRequired(true).setMaxLength(3500)).addChannelOption(o => o.setName("canal").setDescription("Sobrescrever canal configurado (opcional)").addChannelTypes(ChannelType.GuildText).setRequired(false)));
add(new SlashCommandBuilder().setName("ticket").setDescription("Abra ticket privado."));
add(new SlashCommandBuilder().setName("fecharticket").setDescription("Feche o ticket atual."));

add(new SlashCommandBuilder().setName("falar").setDescription("Converse com a inteligência artificial do YSIS MC.").addStringOption(o => o.setName("mensagem").setDescription("O que você quer perguntar ou conversar?").setMaxLength(1800).setRequired(true)));
add(new SlashCommandBuilder().setName("imagem").setDescription("Peça à IA para criar uma imagem a partir de uma descrição.").addStringOption(o => o.setName("pedido").setDescription("Descreva a imagem que deseja criar").setMaxLength(900).setRequired(true)));
add(new SlashCommandBuilder().setName("music").setDescription("Toque música em um canal de voz pelo nome ou link.").addStringOption(o => o.setName("musica").setDescription("Nome da música ou link compatível").setMaxLength(500).setRequired(true)));
add(new SlashCommandBuilder().setName("pararmusic").setDescription("Pare a música e desconecte o bot do canal de voz."));

// O Discord não deve esconder comandos administrativos: as permissões são verificadas pelo bot, com exceção do dono configurado.
for (const command of cmd) command.default_member_permissions = null;

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildVoiceStates
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

const musicSessions = new Map();
const aiHistory = new Map();

async function askAI(userId, prompt) {
  if (!OPENAI_API_KEY) throw new Error("A IA não está configurada. Adicione OPENAI_API_KEY nas variáveis da Railway.");
  const history = aiHistory.get(userId) || [];
  const messages = [
    { role: "system", content: "Você é YSIS, assistente amigável e divertido de um servidor Discord brasileiro. Responda em português brasileiro, com clareza e sem fingir ter ferramentas que não possui. Se não souber, diga." },
    ...history.slice(-8),
    { role: "user", content: prompt }
  ];
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST", headers: { "Authorization": `Bearer ${OPENAI_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: AI_MODEL, messages, temperature: 0.8, max_tokens: 700 })
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json?.error?.message || `API de IA respondeu ${res.status}`);
  const answer = json.choices?.[0]?.message?.content?.trim();
  if (!answer) throw new Error("A IA não retornou uma resposta.");
  aiHistory.set(userId, [...history.slice(-8), { role: "user", content: prompt }, { role: "assistant", content: answer }]);
  return answer.slice(0, 1900);
}

async function generateAIImage(prompt) {
  if (!OPENAI_API_KEY) throw new Error("A geração de imagens não está configurada. Adicione OPENAI_API_KEY na Railway.");
  const res = await fetch("https://api.openai.com/v1/images/generations", {
    method: "POST", headers: { "Authorization": `Bearer ${OPENAI_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: IMAGE_MODEL, prompt, size: "1024x1024", n: 1 })
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json?.error?.message || `API de imagem respondeu ${res.status}`);
  const item = json.data?.[0];
  if (item?.b64_json) return new AttachmentBuilder(Buffer.from(item.b64_json, "base64"), { name: "ysis-imagem.png" });
  if (item?.url) {
    const imageRes = await fetch(item.url);
    if (!imageRes.ok) throw new Error("Não consegui baixar a imagem gerada.");
    return new AttachmentBuilder(Buffer.from(await imageRes.arrayBuffer()), { name: "ysis-imagem.png" });
  }
  throw new Error("A API não retornou uma imagem. Confira acesso e cobrança da API.");
}

async function startMusic(interaction, query) {
  const voiceChannel = interaction.member?.voice?.channel;
  if (!voiceChannel) throw new Error("Entre em um canal de voz primeiro para eu tocar música.");
  if (!interaction.guild.members.me.permissionsIn(voiceChannel).has(["Connect", "Speak"])) throw new Error("Preciso das permissões Conectar e Falar nesse canal.");
  let tracks = [];
  if (/^https?:\/\//i.test(query)) {
    if (!play.yt_validate(query) && !play.sp_validate(query)) throw new Error("Esse link não parece ser de uma fonte compatível. Tente um link do YouTube ou SoundCloud.");
    tracks = [{ url: query, title: query }];
  } else {
    tracks = await play.search(query, { limit: 1 });
    if (!tracks.length) throw new Error("Não encontrei essa música. Tente outro nome ou envie um link compatível.");
  }
  const track = tracks[0];
  const source = track.url || track.url;
  const stream = await play.stream(source);
  let session = musicSessions.get(interaction.guildId);
  if (session?.player) session.player.stop(true);
  const connection = joinVoiceChannel({ channelId: voiceChannel.id, guildId: interaction.guildId, adapterCreator: interaction.guild.voiceAdapterCreator, selfDeaf: true });
  await entersState(connection, VoiceConnectionStatus.Ready, 20_000);
  const player = createAudioPlayer({ behaviors: { noSubscriber: NoSubscriberBehavior.Pause } });
  const resource = createAudioResource(stream.stream, { inputType: stream.type });
  player.play(resource);
  connection.subscribe(player);
  musicSessions.set(interaction.guildId, { connection, player, track, textChannelId: interaction.channelId });
  player.once(AudioPlayerStatus.Idle, () => {
    const current = musicSessions.get(interaction.guildId);
    if (current?.player === player) { current.connection.destroy(); musicSessions.delete(interaction.guildId); }
  });
  connection.on("error", err => console.error("Erro de conexão de voz:", err));
  return track;
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
  if (i.isButton() && i.customId.startsWith("ysispanel:")) {
    const section = i.customId.split(":")[1];
    if (section === "equipe" && !isOwner(i) && !canPromote(i.member, guildConfig(i.guild.id), i.memberPermissions) && !i.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
      return i.reply({ content: "🔒 Esta categoria é exclusiva da equipe autorizada.", ephemeral: true });
    }
    const rows = [panelButtons()];
    if (isOwner(i) || canPromote(i.member, guildConfig(i.guild.id), i.memberPermissions) || i.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) rows.push(panelStaffButtons());
    return i.update({ embeds: [buildPanelEmbed(section, i)], components: rows }).catch(() => {});
  }
  if (i.isAutocomplete()) {
    if (i.commandName === "comprarcargo" && i.guild) {
      const cfg = guildConfig(i.guild.id);
      const typed = i.options.getFocused().toLocaleLowerCase("pt-BR");
      const offers = Object.entries(cfg.roleShop)
        .map(([roleId, offer]) => {
          const role = i.guild.roles.cache.get(roleId);
          if (!role) return null;
          return { name: `${role.name} — ${fmt(offer.price)} ${currencyName(i.guild.id)}`.slice(0, 100), value: roleId, search: `${role.name} ${roleId}`.toLocaleLowerCase("pt-BR") };
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
      configmoeda: PermissionFlagsBits.ManageGuild,
      configcanais: PermissionFlagsBits.ManageGuild,
      configequipe: PermissionFlagsBits.ManageGuild,
      adicionarmoedas: PermissionFlagsBits.ManageGuild,
      removermoedas: PermissionFlagsBits.ManageGuild,
      setarmoedas: PermissionFlagsBits.ManageGuild,
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
      anunciar: PermissionFlagsBits.ManageMessages,
      anunciarloja: PermissionFlagsBits.ManageMessages,
      promocao: PermissionFlagsBits.ManageMessages
    };
    const needed = requiredPermissions[name];
    if (needed && !isOwner(i) && !i.memberPermissions?.has(needed) && !i.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
      return reply("⛔ Você não tem permissão para usar este comando.", true);
    }
    if (name === "falar") {
      await i.deferReply();
      const prompt = i.options.getString("mensagem", true);
      const answer = await askAI(me.id, prompt);
      return i.editReply({ content: `🤖 **YSIS IA**\n${answer}` });
    }
    if (name === "imagem") {
      await i.deferReply();
      const prompt = i.options.getString("pedido", true);
      const file = await generateAIImage(prompt);
      return i.editReply({ content: `🎨 **Imagem criada!**\n**Pedido:** ${prompt}`, files: [file] });
    }
    if (name === "music") {
      await i.deferReply();
      const query = i.options.getString("musica", true);
      const track = await startMusic(i, query);
      return i.editReply(`🎶 Tocando agora: **${track.title || track.name || query}**\nPedido por ${me}.`);
    }
    if (name === "pararmusic") {
      const session = musicSessions.get(i.guildId);
      if (!session) return reply("Não tem música tocando agora.", true);
      session.player.stop(true);
      session.connection.destroy();
      musicSessions.delete(i.guildId);
      return reply("⏹️ Música parada e desconectei do canal de voz.");
    }

    if (name === "ajuda" || name === "painel") {
      const rows = [panelButtons()];
      if (isOwner(i) || canPromote(i.member, guildConfig(i.guild.id), i.memberPermissions) || i.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) rows.push(panelStaffButtons());
      return i.reply({ ephemeral: true, embeds: [buildPanelEmbed("geral", i)], components: rows });
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
      const target = i.options.getUser("usuario") || me;
      const p = user(target.id);
      const lv = level(p.xp);
      const currentFrame = frameCatalog[p.frame] || frameCatalog.azul;
      const marriedTo = data.marriages[target.id] ? `<@${data.marriages[target.id]}>` : "Solteiro(a)";
      const featured = p.featuredUntil > Date.now() ? `🌟 Em destaque até <t:${Math.floor(p.featuredUntil / 1000)}:R>` : "Perfil comum";
      const embed = em(`${currentFrame.emoji} PERFIL • ${target.username}`, p.bio || "Sem biografia.", currentFrame.color)
        .setThumbnail(target.displayAvatarURL({ size: 512 }))
        .setAuthor({ name: `YSIS MC • Nível ${lv}`, iconURL: i.guild.iconURL() || undefined })
        .addFields(
          { name: "⭐ Progressão", value: `**Nível ${lv}**
${bar(p.xp - lv * lv * 100, (lv + 1) ** 2 * 100 - lv * lv * 100)}
${fmt(p.xp)} XP`, inline: true },
          { name: "💰 Carteira", value: moneyText(i.guild.id, p.coins), inline: true },
          { name: "🏦 Banco", value: moneyText(i.guild.id, p.bank), inline: true },
          { name: "💍 Relacionamento", value: marriedTo, inline: true },
          { name: "💖 Reputação", value: fmt(p.reputation || 0), inline: true },
          { name: "🖼️ Moldura", value: currentFrame.name, inline: true },
          { name: "✨ Status", value: featured, inline: true },
          { name: `🏅 Conquistas (${unlockedAchievements(p).length}/${achievementCatalog.length})`, value: unlockedAchievements(p).map(a => `${a.icon} ${a.name}`).join(" • ") || "Nenhuma ainda — use os comandos e evolua para desbloquear!", inline: false }
        )
        .setFooter({ text: `YSIS MC • ID ${target.id}` });
      try {
        const card = await renderProfileCard(target, p, i.guild);
        const attachment = new AttachmentBuilder(card, { name: "ysis-perfil.png" });
        return i.reply({ embeds: [embed], files: [attachment], ephemeral: target.id === me.id });
      } catch (error) {
        console.error("Falha ao renderizar perfil:", error);
        return i.reply({ embeds: [embed], ephemeral: target.id === me.id });
      }
    }

    if (name === "conquistas" || name === "insignias") {
      const target = i.options.getUser("usuario") || me;
      const p = user(target.id);
      const unlocked = unlockedAchievements(p);
      const description = achievementCatalog.map(a => `${a.test(p) ? "🏅" : "🔒"} ${a.icon} **${a.name}** — ${a.desc}${a.test(p) ? " *(desbloqueada)*" : ""}`).join("\n");
      const embed = em(`${name === "insignias" ? "🏵️ Insígnias" : "🏆 Conquistas"} • ${target.username}`, `**Desbloqueadas:** ${unlocked.length}/${achievementCatalog.length}\n\n${description}`, 0xf1c40f).setThumbnail(target.displayAvatarURL({ size: 512 }));
      return i.reply({ embeds: [embed], ephemeral: target.id === me.id });
    }

    if (name === "destaques") {
      const list = Object.entries(data.users)
        .filter(([id, p]) => p.featuredUntil > Date.now() && i.guild.members.cache.has(id))
        .sort((a, b) => b[1].featuredUntil - a[1].featuredUntil)
        .slice(0, 10);
      const desc = list.map(([id, p], index) => `**${index + 1}.** <@${id}> — Nível ${level(p.xp)} · termina <t:${Math.floor(p.featuredUntil / 1000)}:R>`).join("\n");
      return i.reply({ embeds: [em("✨ Perfis em destaque", desc || "Ainda não há perfis destacados. Use `/destacarperfil` para destacar o seu por 24 horas.", 0xf1c40f)] });
    }

    if (name === "biografia") {
      u.bio = i.options.getString("texto").trim();
      save();
      return reply("✅ Biografia atualizada. Veja como ficou com `/perfil`.", true);
    }

    if (name === "molduras") {
      const desc = Object.entries(frameCatalog).map(([key, f]) => `${f.emoji} **${f.name}** — ${key === "azul" ? "Grátis (padrão)" : `${fmt(f.price)} ${currencyName(i.guild.id)}`}\n${u.ownedFrames.includes(key) ? "✅ Desbloqueada" : "🔒 Ainda bloqueada"}`).join("\n\n");
      return i.reply({ ephemeral: true, embeds: [em("🖼️ Coleção de molduras", `${desc}\n\nCompre com \`/comprarmoldura\` e equipe com \`/usarmoldura\`.`, 0x9b59b6)] });
    }

    if (name === "comprarmoldura") {
      const key = i.options.getString("moldura");
      const frame = frameCatalog[key];
      if (!frame) return reply("❌ Essa moldura não existe.", true);
      if (u.ownedFrames.includes(key)) return reply("Você já desbloqueou essa moldura.", true);
      if (u.coins < frame.price) return reply(`Saldo insuficiente. Você precisa de ${moneyText(i.guild.id, frame.price)}.`, true);
      u.coins -= frame.price;
      u.ownedFrames.push(key);
      save();
      return reply(`✅ Você desbloqueou ${frame.emoji} **${frame.name}** por ${moneyText(i.guild.id, frame.price)}. Use o comando /usarmoldura com essa moldura para equipá-la.`, true);
    }

    if (name === "usarmoldura") {
      const key = i.options.getString("moldura");
      if (!frameCatalog[key] || !u.ownedFrames.includes(key)) return reply("🔒 Você ainda não possui essa moldura. Consulte `/molduras`.", true);
      u.frame = key;
      save();
      return reply(`✅ Moldura ${frameCatalog[key].emoji} **${frameCatalog[key].name}** equipada!`, true);
    }

    if (name === "destacarperfil") {
      const cost = 1000;
      if (u.featuredUntil > Date.now()) return reply(`🌟 Seu perfil já está em destaque até <t:${Math.floor(u.featuredUntil / 1000)}:R>.`, true);
      if (u.coins < cost) return reply(`Você precisa de ${moneyText(i.guild.id, cost)} para destacar o perfil por 24 horas.`, true);
      u.coins -= cost;
      u.featuredUntil = Date.now() + 86400000;
      save();
      return reply(`🌟 Perfil destacado por 24 horas! Custo: ${moneyText(i.guild.id, cost)}.`, true);
    }

    if (["adicionarmoedas", "removermoedas", "setarmoedas"].includes(name)) {
      const target = i.options.getUser("usuario");
      const amount = i.options.getInteger("quantia");
      const reason = i.options.getString("motivo") || "Sem motivo informado";
      if (target.bot) return reply("❌ Não é possível ajustar o saldo de um bot.", true);
      const targetData = user(target.id);
      if (name === "adicionarmoedas") targetData.coins += amount;
      else if (name === "removermoedas") {
        if (targetData.coins < amount) return reply(`O membro só tem ${moneyText(i.guild.id, targetData.coins)} na carteira.`, true);
        targetData.coins -= amount;
      } else targetData.coins = amount;
      save();
      await log(i.guild, "💰 Ajuste de economia", `Equipe: ${me}
Membro: ${target}
Ação: ${name}
Quantidade: ${amount} ${currencyName(i.guild.id)}
Motivo: ${reason}`);
      return reply(`✅ Saldo atualizado para ${target}: carteira agora em ${moneyText(i.guild.id, targetData.coins)}.
Motivo: ${reason}`, true);
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

      return reply(`🎁 Você recebeu ${moneyText(i.guild.id, reward)}! Sequência: **${u.dailyStreak} dia(s)**.`, true);
    }

    if (name === "saldo") {
      return reply(`💰 **Seu saldo — ${me.username}**\nCarteira: ${moneyText(i.guild.id, u.coins)}\nBanco: ${moneyText(i.guild.id, u.bank)}\nTotal: ${moneyText(i.guild.id, u.coins + u.bank)}`, true);
    }

    if (name === "trabalhar") {
      const left = cooldown(u, "lastWork", 3600000);
      if (left) return reply(`⏳ Tente novamente em ${Math.ceil(left / 60000)} min.`, true);

      const n = rand(40, 120);
      u.coins += n;
      save();
      return reply(`🧰 Você ganhou ${moneyText(i.guild.id, n)} trabalhando.`, true);
    }

    if (name === "pagar") {
      const t = i.options.getUser("usuario");
      const n = i.options.getInteger("quantia");

      if (t.bot || t.id === me.id) return reply("❌ Escolha outra pessoa.", true);
      if (u.coins < n) return reply("❌ Saldo insuficiente na carteira.", true);

      u.coins -= n;
      user(t.id).coins += n;
      save();
      return reply(`💸 Você enviou ${moneyText(i.guild.id, n)} para ${t}.`, true);
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
      return reply(`🏦 Operação concluída: ${moneyText(i.guild.id, n)}.`, true);
    }

    if (name === "top") {
      const rows = Object.entries(data.users)
        .sort((a, b) => (b[1].coins + b[1].bank) - (a[1].coins + a[1].bank))
        .slice(0, 10);

      return i.reply({
        embeds: [
          em(
            "🏆 Ranking YSIS MC",
            rows.map(([id, p], n) => `**${n + 1}.** ${p.featuredUntil > Date.now() ? "🌟 " : ""}<@${id}> — ${moneyText(i.guild.id, p.coins + p.bank)} | Nível ${level(p.xp)}`).join("\n") ||
            "Ainda sem jogadores no ranking."
          )
        ]
      });
    }

    if (name === "rankxp") {
      const rows = Object.entries(data.users)
        .sort((a, b) => (b[1].xp || 0) - (a[1].xp || 0))
        .slice(0, 10);
      const desc = rows.map(([id, profile], idx) => `**${idx + 1}.** <@${id}> — nível **${level(profile.xp || 0)}** · ${fmt(profile.xp || 0)} XP`).join("\n");
      return i.reply({ embeds: [em("🌠 Ranking de experiência", desc || "Ainda não há jogadores no ranking.", 0x9b59b6)] });
    }

    if (name === "rep") {
      const target = i.options.getUser("usuario");
      if (target.bot || target.id === me.id) return reply("❌ Escolha outra pessoa, não você mesmo nem um bot.", true);
      const targetProfile = user(target.id);
      const wait = 86400000 - (Date.now() - u.lastRep);
      if (wait > 0) return reply(`⏳ Você já deu reputação hoje. Tente novamente em ${Math.ceil(wait / 3600000)} hora(s).`, true);
      targetProfile.reputation = (targetProfile.reputation || 0) + 1;
      u.lastRep = Date.now();
      save();
      return i.reply({ embeds: [em("💖 Reputação enviada!", `${me} deu +1 de reputação para ${target}.\nReputação atual de ${target.username}: **${targetProfile.reputation}**.`, 0xe84393)] });
    }

    if (name === "cacar") {
      const left = cooldown(u, "lastHunt", 1800000);
      if (left) return reply(`🏹 Você precisa descansar. Volte em ${Math.ceil(left / 60000)} minuto(s).`, true);
      u.lastHunt = Date.now();
      const roll = rand(1, 100);
      let reward = 0;
      let xpGain = rand(8, 18);
      let result;
      if (roll <= 12) {
        reward = 0;
        result = "A caça escapou! Você ganhou XP pela experiência, mas não encontrou moedas.";
      } else if (roll >= 92) {
        reward = rand(180, 280);
        result = `🏆 Caça lendária! Você encontrou ${moneyText(i.guild.id, reward)}.`;
      } else {
        reward = rand(35, 100);
        result = `🐇 Boa caçada! Você encontrou ${moneyText(i.guild.id, reward)}.`;
      }
      u.coins += reward;
      u.xp += xpGain;
      save();
      return i.reply({ embeds: [em("🏹 Expedição de caça", `${result}\n✨ Você ganhou **${xpGain} XP**.\n💰 Carteira: ${moneyText(i.guild.id, u.coins)}`, 0x27ae60)] });
    }

    if (name === "loja") {
      const cfg = guildConfig(i.guild.id);
      const offers = Object.entries(cfg.roleShop).map(([roleId, offer]) => {
        const role = i.guild.roles.cache.get(roleId);
        if (!role) return null;
        return `🎖️ **${role.name}** — ${currencyEmoji(i.guild.id)} ${fmt(offer.price)} ${currencyName(i.guild.id)}\nUse \`/comprarcargo\` e selecione este cargo.`;
      }).filter(Boolean);
      return i.reply({
        ephemeral: true,
        embeds: [em("🏷️ Loja de cargos do YSIS MC", offers.join("\n\n") || "A loja ainda não tem cargos. Um ADM pode cadastrar ofertas com `/configloja`.", 0x9b59b6)]
      });
    }

    if (name === "lojajogo") {
      return i.reply({
        ephemeral: true,
        embeds: [em("⛏️ Loja Minecraft — pedidos", Object.entries(shop).map(([k, v]) => `${v.emoji} **${v.name}** — ${currencyEmoji(i.guild.id)} ${fmt(v.price)} ${currencyName(i.guild.id)}\n${v.desc}`).join("\n\n") + "\n\n📦 A compra cria um pedido. A equipe precisa entregar o item no Minecraft e confirmar com `/concluirpedido`.", 0x2ecc71)]
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
      if (u.coins < total) return reply(`❌ Você precisa de ${moneyText(i.guild.id, total)}; seu saldo é ${moneyText(i.guild.id, u.coins)}.`, true);
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
      return reply(`✅ Pedido **${order.id}** registrado: ${it.emoji} **${quantity}× ${it.name}** para **${nick}**. Foram debitadas ${moneyText(i.guild.id, total)}. O pedido está pendente; a equipe ainda precisa entregar o item no jogo.`, true);
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
      if (u.coins < offer.price) return reply(`❌ Você precisa de ${moneyText(i.guild.id, offer.price)}.`, true);
      try {
        await buyer.roles.add(role, "Compra na loja de cargos YSIS MC");
        u.coins -= offer.price;
        save();
        return reply(`✅ Você comprou o cargo **${role.name}** por ${moneyText(i.guild.id, offer.price)}.`, true);
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
      if (!it) return reply("❌ Esse item não existe na loja.", true);

      if ((u.inventory[k] || 0) < n) return reply("❌ Você não tem essa quantidade.", true);

      u.inventory[k] -= n;
      if (!u.inventory[k]) delete u.inventory[k];

      const total = it.sell * n;
      u.coins += total;
      save();

      return reply(`💰 Você vendeu **${n}× ${it.name}** por ${moneyText(i.guild.id, total)}.`, true);
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
      return reply(`✨ Você encontrou ${found} e ganhou ${moneyText(i.guild.id, reward)}.`, true);
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

    if (["anunciar", "anunciarloja", "promocao"].includes(name)) {
      const cfg = guildConfig(i.guild.id);
      const configuredId = name === "anunciarloja" ? cfg.storeChannelId : name === "promocao" ? cfg.promotionsChannelId : cfg.promotionsChannelId;
      const configured = configuredId ? await i.guild.channels.fetch(configuredId).catch(() => null) : null;
      const ch = i.options.getChannel("canal") || configured || (name === "anunciar" ? i.channel : null);
      if (!ch?.isTextBased()) {
        const wanted = name === "anunciarloja" ? "loja" : "promoções";
        return reply(`⚙️ Configure primeiro o canal de ${wanted} com /configcanais, ou informe um canal no comando.`, true);
      }
      const titlePrefix = name === "anunciarloja" ? "🛍️ LOJA • " : name === "promocao" ? "🔥 PROMOÇÃO • " : "📢 ";
      const color = name === "promocao" ? 0xe67e22 : name === "anunciarloja" ? 0x9b59b6 : 0x3498db;
      await ch.send({ embeds: [em(`${titlePrefix}${i.options.getString("titulo")}`, i.options.getString("texto"), color)] });
      await log(i.guild, "📢 Anúncio publicado", `Autor: ${me}
Tipo: ${name}
Canal: ${ch}
Título: ${i.options.getString("titulo")}`);
      return reply(`✅ Publicação enviada em ${ch}.`, true);
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

    if (name === "configmoeda") {
      const nameValue = i.options.getString("nome").trim();
      const emojiValue = i.options.getString("emoji").trim();
      if (!nameValue || nameValue.length > 20) return reply("O nome da moeda deve ter de 1 a 20 caracteres.", true);
      if (/@everyone|@here/.test(emojiValue)) return reply("Use um emoji, não uma menção.", true);
      const cfg = guildConfig(i.guild.id);
      cfg.currencyName = nameValue;
      cfg.currencyEmoji = emojiValue || "🪙";
      save();
      return reply(`✅ Moeda configurada: ${cfg.currencyEmoji} **${cfg.currencyName}**. Os saldos existentes foram mantidos.`, true);
    }

    if (name === "configcanais") {
      const type = i.options.getString("tipo");
      const channel = i.options.getChannel("canal");
      const cfg = guildConfig(i.guild.id);
      if (type === "loja") cfg.storeChannelId = channel.id;
      else cfg.promotionsChannelId = channel.id;
      save();
      return reply(`✅ Canal de ${type === "loja" ? "loja" : "promoções"} configurado para ${channel}. Anúncios futuros usarão esse canal por padrão.`, true);
    }

    if (name === "configequipe") {
      const type = i.options.getString("tipo");
      const action = i.options.getString("acao");
      const role = i.options.getRole("cargo");
      if (role.id === i.guild.id || role.managed) return reply("Esse cargo não pode ser configurado para a equipe.", true);
      const cfg = guildConfig(i.guild.id);
      const listKey = type === "promocao" ? "promotionRoles" : "supportRoles";
      if (action === "adicionar") {
        if (!cfg[listKey].includes(role.id)) cfg[listKey].push(role.id);
      } else {
        cfg[listKey] = cfg[listKey].filter(id => id !== role.id);
      }
      save();
      return reply(`✅ Cargo ${role} ${action === "adicionar" ? "adicionado à" : "removido da"} lista de ${type === "promocao" ? "promoções" : "suporte/tickets"}.`, true);
    }

    if (name === "promover" || name === "rebaixar") {
      const cfg = guildConfig(i.guild.id);
      if (!canPromote(i.member, cfg, i.memberPermissions)) return reply("⛔ Seu cargo não está autorizado a promover/rebaixar. Peça a um administrador para configurar `/configequipe`.", true);
      const targetUser = i.options.getUser("usuario");
      const role = i.options.getRole("cargo");
      const reason = i.options.getString("motivo") || (name === "promover" ? "Promoção de cargo" : "Rebaixamento de cargo");
      if (targetUser.bot && targetUser.id === client.user.id) return reply("Não posso alterar meus próprios cargos.", true);
      if (role.id === i.guild.id || role.managed) return reply("Esse cargo não pode ser atribuído/removido por este comando.", true);
      const botMember = i.guild.members.me || await i.guild.members.fetch(client.user.id).catch(() => null);
      if (!botMember || !botMember.roles.highest || botMember.roles.highest.comparePositionTo(role) <= 0) return reply("O cargo do bot precisa ficar acima do cargo escolhido na hierarquia do Discord.", true);
      const isAdmin = i.memberPermissions?.has(PermissionFlagsBits.Administrator);
      if (role.permissions.has(PermissionFlagsBits.Administrator) && !isAdmin) return reply("Por segurança, somente um administrador pode atribuir ou remover um cargo com permissão de Administrador.", true);
      const actorMember = await i.guild.members.fetch(me.id).catch(() => null);
      if (!actorMember) return reply("Não consegui verificar seu cargo no servidor.", true);
      if (!isAdmin && actorMember.roles.highest.comparePositionTo(role) <= 0) return reply("Você só pode alterar cargos abaixo do seu maior cargo.", true);
      const targetMember = await i.guild.members.fetch(targetUser.id).catch(() => null);
      if (!targetMember) return reply("Membro não encontrado neste servidor.", true);
      if (!isAdmin && actorMember.roles.highest.comparePositionTo(targetMember.roles.highest) <= 0) return reply("Você não pode alterar cargos de alguém com cargo igual ou superior ao seu.", true);
      if (name === "promover") {
        if (targetMember.roles.cache.has(role.id)) return reply(`Esse membro já possui ${role}.`, true);
        await targetMember.roles.add(role, `${reason} — por ${me.tag}`);
        data.promotions.push({ guildId: i.guild.id, targetId: targetUser.id, roleId: role.id, action: "promover", by: me.id, reason, at: Date.now() });
        await log(i.guild, "⬆️ Promoção de cargo", `Membro: ${targetUser}
Cargo: ${role}
Responsável: ${me}
Motivo: ${reason}`);
        save();
        return reply(`✅ ${targetUser} foi promovido para ${role}.
**Motivo:** ${reason}`);
      }
      if (!targetMember.roles.cache.has(role.id)) return reply(`Esse membro não possui ${role}.`, true);
      await targetMember.roles.remove(role, `${reason} — por ${me.tag}`);
      data.promotions.push({ guildId: i.guild.id, targetId: targetUser.id, roleId: role.id, action: "rebaixar", by: me.id, reason, at: Date.now() });
      await log(i.guild, "⬇️ Rebaixamento de cargo", `Membro: ${targetUser}
Cargo removido: ${role}
Responsável: ${me}
Motivo: ${reason}`);
      save();
      return reply(`✅ ${role} foi removido de ${targetUser}.
**Motivo:** ${reason}`);
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
        return reply(`✅ Cargo **${role.name}** cadastrado na loja por **${currencyEmoji(i.guild.id)} ${fmt(price)} ${currencyName(i.guild.id)}**. A oferta aparece/atualiza automaticamente em \`/loja\`.`, true);
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
      if (targetUser.id === client.user.id) return reply("Não posso administrar meus próprios cargos por esse comando.", true);
      const actorMember = await i.guild.members.fetch(me.id).catch(() => null);
      const targetMember = await i.guild.members.fetch(targetUser.id).catch(() => null);
      if (!actorMember || !targetMember) return reply("Não consegui localizar você ou o membro alvo no servidor.", true);
      const isAdmin = i.memberPermissions?.has(PermissionFlagsBits.Administrator);
      if (role.permissions.has(PermissionFlagsBits.Administrator) && !isAdmin) return reply("Por segurança, somente um administrador pode atribuir ou remover um cargo com permissão de Administrador.", true);
      if (!isAdmin && actorMember.roles.highest.comparePositionTo(role) <= 0) return reply("Você só pode administrar cargos abaixo do seu maior cargo.", true);
      if (!isAdmin && actorMember.roles.highest.comparePositionTo(targetMember.roles.highest) <= 0) return reply("Você não pode administrar cargos de alguém com cargo igual ou superior ao seu.", true);
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
      const desc = pending.map(o => `**${o.id}** · <@${o.userId}> → **${o.minecraftNick}** · ${itemName(o.item)} ×${o.quantity} · ${currencyEmoji(i.guild.id)} ${fmt(o.total)} ${currencyName(i.guild.id)} · <t:${Math.floor(o.createdAt / 1000)}:R>`).join("\n") || "Não há pedidos pendentes.";
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
      return reply(`✅ Pedido **${order.id}** cancelado e ${moneyText(i.guild.id, order.total)} devolvidos a <@${order.userId}>.`, true);
    }

    if (name === "ticket") {
      const existing = i.guild.channels.cache.find(
        c => c.type === ChannelType.GuildText && c.topic === `ticket:${me.id}`
      );

      if (existing) return reply(`Você já tem um ticket: ${existing}`, true);

      const safe = me.username.toLowerCase().replace(/[^a-z0-9-]/g, "").slice(0, 16) || "membro";

      const cfg = guildConfig(i.guild.id);
      const staffRoleOverwrites = [...new Set([...(cfg.supportRoles || []), ...i.guild.roles.cache.filter(r => r.permissions.has(PermissionFlagsBits.ManageChannels)).map(r => r.id)])]
        .filter(roleId => roleId !== i.guild.roles.everyone.id)
        .map(roleId => ({ id: roleId, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] }));
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
          },
          ...staffRoleOverwrites
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

    let msg = "❌ O comando falhou. Confira os logs do Railway para ver o erro completo.";
    if (e?.code === 50013) msg = "❌ O bot não tem permissão para concluir essa ação. Confira as permissões do canal e a posição do cargo do bot.";
    else if (e?.code === 50001) msg = "❌ O bot não consegue acessar esse canal ou recurso. Confira as permissões e se o canal ainda existe.";
    else if (e?.code === 10062) msg = "⌛ Essa interação expirou. Execute o comando novamente.";
    else if (e?.code === 50035) msg = "❌ O Discord recusou alguns dados enviados pelo comando. Confira os campos e tente novamente.";

    if (i.replied || i.deferred) {
      if (e?.message && /IA não está configurada|geração de imagens não está configurada|API de IA|API de imagem|Entre em um canal de voz|permissões Conectar|link não parece|Não encontrei essa música|Não consegui baixar a imagem|não retornou uma imagem/i.test(e.message)) msg = `❌ ${e.message}`;
      if (i.deferred && !i.replied) await i.editReply({ content: msg }).catch(() => {});
      else await i.followUp({ content: msg, ephemeral: true }).catch(() => {});
    } else {
      await i.reply({ content: msg, ephemeral: true }).catch(() => {});
    }
  }
});

client.on("voiceStateUpdate", async (oldState, newState) => {
  try {
    if (!MUSIC_AUTOPLAY_URL || !newState.guild || newState.member?.user?.bot) return;
    const memberId = newState.member?.id;
    const isConfiguredOwner = (OWNER_USER_ID && memberId === OWNER_USER_ID) || String(newState.member?.user?.username || "").toLowerCase() === OWNER_USERNAME;
    if (!isConfiguredOwner || !newState.channelId || oldState.channelId === newState.channelId) return;
    const session = musicSessions.get(newState.guild.id);
    if (session) return;
    const textChannel = newState.guild.systemChannel || newState.guild.channels.cache.find(c => c.isTextBased() && c.permissionsFor(newState.guild.members.me)?.has("SendMessages"));
    if (!textChannel) return;
    const fakeInteraction = { member: newState.member, guild: newState.guild, guildId: newState.guild.id, channelId: textChannel.id };
    const track = await startMusic(fakeInteraction, MUSIC_AUTOPLAY_URL);
    await textChannel.send(`🎧 Kuroshikk entrou na call; liguei a música automática: **${track.title || track.name || MUSIC_AUTOPLAY_URL}**.`).catch(() => {});
  } catch (e) { console.error("Autoplay do dono:", e.message); }
});

client.login(TOKEN);
