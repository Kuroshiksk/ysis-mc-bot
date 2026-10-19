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
const { createCanvas, loadImage, GlobalFonts } = require("@napi-rs/canvas");

const fs = require("node:fs");
const path = require("node:path");

// Fontes embutidas — no Linux/Railway Arial nao existe e o texto some do canvas.
const FONT_CANDIDATES = [
  path.join(__dirname, "fonts", "DejaVuSans.ttf"),
  path.join(process.cwd(), "fonts", "DejaVuSans.ttf"),
  "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
  "/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf"
];
const FONT_BOLD_CANDIDATES = [
  path.join(__dirname, "fonts", "DejaVuSans-Bold.ttf"),
  path.join(process.cwd(), "fonts", "DejaVuSans-Bold.ttf"),
  "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
  "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf"
];
function registerFirstFont(candidates, familyName) {
  for (const file of candidates) {
    try {
      if (fs.existsSync(file)) {
        GlobalFonts.registerFromPath(file, familyName);
        console.log(`Fonte registrada: ${familyName} <- ${file}`);
        return true;
      }
    } catch (e) {
      console.error(`Falha registrando ${file}:`, e.message);
    }
  }
  return false;
}
registerFirstFont(FONT_CANDIDATES, "YSIS");
registerFirstFont(FONT_BOLD_CANDIDATES, "YSIS Bold");
const FONT = GlobalFonts.has("YSIS") ? "YSIS" : "sans-serif";
const FONT_BOLD = GlobalFonts.has("YSIS Bold") ? "YSIS Bold" : FONT;
console.log(`Canvas fonts: regular=${FONT} bold=${FONT_BOLD}`);

const TOKEN = process.env.DISCORD_TOKEN;
const OWNER_USER_ID = process.env.OWNER_USER_ID || "";
const OWNER_USERNAME = (process.env.OWNER_USERNAME || "kuroshikk").toLowerCase();
const CLIENT_ID = process.env.CLIENT_ID;
const GUILD_ID = process.env.GUILD_ID;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || "";
const AI_MODEL = process.env.AI_MODEL || "gpt-4o-mini";
const IMAGE_MODEL = process.env.IMAGE_MODEL || "dall-e-3";
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
    const tmp = DATA_FILE + ".tmp";
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2), "utf8");
    fs.renameSync(tmp, DATA_FILE);
  } catch (e) {
    console.error("Erro salvando dados:", e);
    try {
      fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), "utf8");
    } catch (e2) {
      console.error("Erro no fallback de save:", e2);
    }
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
  // Cartao estilo Loritta: fundo azul com padrao + texto desenhado por cima.
  const W = 800;
  const H = 500;
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext("2d");

  const setFont = (size, bold = false) => {
    // sem aspas extras — mais compativel no napi-rs
    const fam = bold ? FONT_BOLD : FONT;
    ctx.font = `${Math.max(10, size)|0}px ${fam}`;
  };
  const drawText = (value, x, y, size, color, bold = false) => {
    setFont(size, bold);
    ctx.fillStyle = color;
    ctx.textBaseline = "alphabetic";
    ctx.fillText(String(value ?? ""), x, y);
  };
  const textWidth = (value, size, bold = false) => {
    setFont(size, bold);
    return ctx.measureText(String(value ?? "")).width;
  };
  const clip = (value, maxWidth, size, bold = false) => {
    let out = String(value ?? "");
    while (out.length > 1 && textWidth(out, size, bold) > maxWidth) out = out.slice(0, -1);
    if (out.length < String(value ?? "").length) out = out.trimEnd() + "...";
    return out;
  };

  const lv = level(profile.xp || 0);
  const totalXP = Number(profile.xp || 0);
  const currentXP = Math.max(0, totalXP - lv * lv * 100);
  const neededXP = Math.max(1, (lv + 1) ** 2 * 100 - lv * lv * 100);
  const coins = Number(profile.coins || 0);
  const bank = Number(profile.bank || 0);
  const rep = Number(profile.reputation || 0);
  const frame = frameCatalog[profile.frame] || frameCatalog.azul;
  const frameColor = `#${Number(frame.color || 0x2878ff).toString(16).padStart(6, "0")}`;
  const uname = String(target.username || "Jogador");
  const bio = String(profile.bio || "Ainda escrevendo minha historia no YSIS MC.").replace(/\s+/g, " ");
  const achievements = unlockedAchievements(profile).length;
  const allUsers = Object.entries(data.users || {});
  const xpRank = Math.max(1, allUsers.map(([id, p]) => ({ id, xp: p.xp || 0 })).sort((a, b) => b.xp - a.xp).findIndex(u => u.id === target.id) + 1);
  const moneyRank = Math.max(1, allUsers.map(([id, p]) => ({ id, total: (p.coins || 0) + (p.bank || 0) })).sort((a, b) => b.total - a.total).findIndex(u => u.id === target.id) + 1);

  // --- fundo azul ---
  const blue = ctx.createLinearGradient(0, 0, W, H);
  blue.addColorStop(0, "#1a6fb8");
  blue.addColorStop(0.5, "#1e82d4");
  blue.addColorStop(1, "#1560a0");
  ctx.fillStyle = blue;
  ctx.fillRect(0, 0, W, H);

  // padrao de doodles
  ctx.save();
  ctx.globalAlpha = 0.16;
  ctx.strokeStyle = "#062038";
  ctx.fillStyle = "#062038";
  ctx.lineWidth = 1.5;
  let seed = 0;
  for (const ch of String(target.id || "1")) seed = (seed * 31 + ch.charCodeAt(0)) >>> 0;
  const rnd = () => { seed = (seed * 1103515245 + 12345) >>> 0; return seed / 0xffffffff; };
  for (let i = 0; i < 60; i++) {
    const x = rnd() * W;
    const y = 100 + rnd() * (H - 180);
    const s = 6 + rnd() * 12;
    const kind = Math.floor(rnd() * 5);
    ctx.beginPath();
    if (kind === 0) {
      for (let p = 0; p < 5; p++) {
        const a = (p * 4 * Math.PI) / 5 - Math.PI / 2;
        const r = p % 2 === 0 ? s : s * 0.4;
        const px = x + Math.cos(a) * r, py = y + Math.sin(a) * r;
        if (p === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.closePath(); ctx.stroke();
    } else if (kind === 1) {
      ctx.arc(x, y, s * 0.55, 0, Math.PI * 2); ctx.stroke();
    } else if (kind === 2) {
      ctx.arc(x, y, s * 0.7, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath();
      ctx.arc(x, y + 2, s * 0.35, 0.15 * Math.PI, 0.85 * Math.PI); ctx.stroke();
    } else if (kind === 3) {
      ctx.moveTo(x - s * 0.5, y); ctx.lineTo(x + s * 0.5, y);
      ctx.moveTo(x, y - s * 0.5); ctx.lineTo(x, y + s * 0.5); ctx.stroke();
    } else {
      ctx.moveTo(x, y - s); ctx.lineTo(x + s * 0.35, y); ctx.lineTo(x - s * 0.15, y); ctx.lineTo(x + s * 0.25, y + s); ctx.stroke();
    }
  }
  ctx.restore();

  // --- header escuro com diagonal ---
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(W, 0);
  ctx.lineTo(W, 115);
  ctx.lineTo(W * 0.55, 170);
  ctx.lineTo(0, 170);
  ctx.closePath();
  const hg = ctx.createLinearGradient(0, 0, 0, 170);
  hg.addColorStop(0, "#1c1c22");
  hg.addColorStop(1, "#121218");
  ctx.fillStyle = hg;
  ctx.fill();

  // avatar
  const ax = 78, ay = 90;
  ctx.beginPath();
  ctx.arc(ax, ay, 58, 0, Math.PI * 2);
  ctx.fillStyle = "#0a0a10";
  ctx.fill();
  ctx.strokeStyle = frameColor;
  ctx.lineWidth = 4;
  ctx.stroke();
  try {
    const avatar = await loadImage(target.displayAvatarURL({ extension: "png", size: 256 }));
    ctx.save();
    ctx.beginPath();
    ctx.arc(ax, ay, 52, 0, Math.PI * 2);
    ctx.clip();
    ctx.drawImage(avatar, ax - 52, ay - 52, 104, 104);
    ctx.restore();
  } catch {
    drawText("?", ax - 12, ay + 14, 36, "#99aabb", true);
  }

  // nome + stats no header
  drawText(clip(uname, 360, 28, true), 150, 52, 28, "#ffffff", true);
  drawText("Global", 150, 78, 13, "#b0b0b8", false);
  drawText(fmt(totalXP) + " XP", 150, 98, 14, "#e0e0e8", true);
  drawText("Nivel " + lv, 150, 120, 13, "#c8d8f0", true);
  drawText("#" + xpRank + "  /  " + fmt(neededXP) + " XP", 150, 140, 12, "#c0c0c8", false);
  drawText(clip(String(frame.name || "Moldura").replace(/[^\w\s\-]/gi, " ").trim() || "Moldura", 200, 12, true), 150, 160, 12, "#9ec8f0", true);

  // reps direita
  const repLabel = fmt(rep) + " reps";
  drawText(repLabel, W - 24 - textWidth(repLabel, 22, true), 48, 22, "#ffffff", true);

  // cards sobre o azul
  const cy = 210;
  ctx.fillStyle = "rgba(6, 28, 52, 0.40)";
  for (const [x, w] of [[24, 240], [280, 240], [536, 240]]) {
    ctx.beginPath();
    ctx.roundRect(x, cy, w, 88, 12);
    ctx.fill();
  }
  drawText("NIVEL", 40, cy + 28, 12, "#c8e4ff", true);
  drawText(String(lv), 40, cy + 68, 34, "#ffffff", true);
  drawText("MOEDAS", 296, cy + 28, 12, "#c8e4ff", true);
  drawText(fmt(coins), 296, cy + 68, 26, "#ffffff", true);
  drawText("CONQUISTAS", 552, cy + 28, 12, "#c8e4ff", true);
  drawText(achievements + "/" + achievementCatalog.length, 552, cy + 68, 26, "#ffffff", true);

  // barra XP
  const pct = Math.max(0, Math.min(1, currentXP / neededXP));
  ctx.fillStyle = "rgba(6, 28, 52, 0.45)";
  ctx.beginPath();
  ctx.roundRect(24, 318, W - 48, 18, 9);
  ctx.fill();
  if (pct > 0) {
    const fg = ctx.createLinearGradient(24, 318, 24 + (W - 48) * pct, 318);
    fg.addColorStop(0, "#4fc3f7");
    fg.addColorStop(1, "#81d4fa");
    ctx.fillStyle = fg;
    ctx.beginPath();
    ctx.roundRect(24, 318, Math.max(10, (W - 48) * pct), 18, 9);
    ctx.fill();
  }
  drawText(fmt(currentXP) + " / " + fmt(neededXP) + " XP   ·   Banco " + fmt(bank) + "   ·   Rank dinheiro #" + moneyRank, 32, 360, 13, "#e8f4ff", false);

  // rodape Sobre Mim
  ctx.fillStyle = "#1a1a1f";
  ctx.fillRect(0, H - 110, W, 110);
  ctx.fillStyle = "#2a2a32";
  ctx.fillRect(0, H - 110, W, 2);
  drawText("Sobre Mim", 24, H - 78, 16, "#ffffff", true);

  setFont(14, false);
  const maxW = W - 48;
  const words = bio.split(" ");
  let line = "", lines = [];
  for (const w of words) {
    const test = line ? line + " " + w : w;
    if (textWidth(test, 14, false) > maxW && line) {
      lines.push(line);
      line = w;
      if (lines.length >= 2) break;
    } else line = test;
  }
  if (lines.length < 2 && line) lines.push(line);
  if (lines.length === 2) lines[1] = clip(lines[1], maxW - 10, 14, false);
  let by = H - 52;
  for (const l of lines.slice(0, 2)) {
    drawText(l, 24, by, 14, "#d0d0d8", false);
    by += 22;
  }

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
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 45000);
  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ model: AI_MODEL, messages, temperature: 0.8, max_tokens: 700 }),
      signal: controller.signal
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json?.error?.message || `API de IA respondeu ${res.status}`);
    const answer = json.choices?.[0]?.message?.content?.trim();
    if (!answer) throw new Error("A IA não retornou uma resposta.");
    aiHistory.set(userId, [...history.slice(-8), { role: "user", content: prompt }, { role: "assistant", content: answer }]);
    return answer.slice(0, 1900);
  } catch (e) {
    if (e?.name === "AbortError") throw new Error("A IA demorou demais para responder (timeout). Tente de novo.");
    throw e;
  } finally {
    clearTimeout(timeout);
  }
}

async function generateAIImage(prompt) {
  if (!OPENAI_API_KEY) throw new Error("A geração de imagens não está configurada. Adicione OPENAI_API_KEY na Railway.");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 90000);
  try {
    const body = {
      model: IMAGE_MODEL,
      prompt: String(prompt).slice(0, 900),
      n: 1,
      size: "1024x1024"
    };
    // dall-e-3 não aceita response_format em algumas contas; mantemos o padrão (url)
    const res = await fetch("https://api.openai.com/v1/images/generations", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(body),
      signal: controller.signal
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      const msg = json?.error?.message || `API de imagem respondeu ${res.status}`;
      throw new Error(msg);
    }
    const item = json.data?.[0];
    if (item?.b64_json) {
      return new AttachmentBuilder(Buffer.from(item.b64_json, "base64"), { name: "ysis-imagem.png" });
    }
    if (item?.url) {
      const imageRes = await fetch(item.url, { signal: controller.signal });
      if (!imageRes.ok) throw new Error("Não consegui baixar a imagem gerada.");
      return new AttachmentBuilder(Buffer.from(await imageRes.arrayBuffer()), { name: "ysis-imagem.png" });
    }
    throw new Error("A API não retornou uma imagem. Confira acesso e cobrança da API (dall-e-3 precisa de crédito).");
  } catch (e) {
    if (e?.name === "AbortError") throw new Error("A geração de imagem demorou demais (timeout). Tente de novo com um pedido mais simples.");
    throw e;
  } finally {
    clearTimeout(timeout);
  }
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
  const source = track.url || track;
  let stream;
  try {
    stream = await play.stream(source, { discordPlayerCompatibility: true });
  } catch (err) {
    console.error("play-dl stream:", err?.message || err);
    throw new Error("Não consegui obter o áudio dessa música. Tente outro link ou nome (YouTube/SoundCloud).");
  }
  let session = musicSessions.get(interaction.guildId);
  if (session?.player) {
    try { session.player.stop(true); } catch {}
    try { session.connection.destroy(); } catch {}
  }
  const connection = joinVoiceChannel({
    channelId: voiceChannel.id,
    guildId: interaction.guildId,
    adapterCreator: interaction.guild.voiceAdapterCreator,
    selfDeaf: true
  });
  await entersState(connection, VoiceConnectionStatus.Ready, 20_000);
  const player = createAudioPlayer({ behaviors: { noSubscriber: NoSubscriberBehavior.Pause } });
  const resource = createAudioResource(stream.stream, { inputType: stream.type });
  player.play(resource);
  connection.subscribe(player);
  musicSessions.set(interaction.guildId, { connection, player, track, textChannelId: interaction.channelId });
  player.once(AudioPlayerStatus.Idle, () => {
    const current = musicSessions.get(interaction.guildId);
    if (current?.player === player) {
      try { current.connection.destroy(); } catch {}
      musicSessions.delete(interaction.guildId);
    }
  });
  connection.on("error", err => console.error("Erro de conexão de voz:", err));
  player.on("error", err => console.error("Erro no player de áudio:", err));
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
      try {
        await i.deferReply({ ephemeral: target.id === me.id });
        const card = await renderProfileCard(target, p, i.guild);
        const attachment = new AttachmentBuilder(card, { name: "ysis-perfil.png" });
        // So a imagem do cartao — nome, nivel, conquistas e bio ja vem desenhados por cima
        return i.editReply({ files: [attachment] });
      } catch (error) {
        console.error("Falha ao renderizar perfil:", error);
        const msg = `❌ Nao consegui gerar o cartao de perfil: ${error?.message || error}`;
        if (i.deferred) return i.editReply({ content: msg }).catch(() => {});
        return i.reply({ content: msg, ephemeral: true });
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
    else if (e?.message && typeof e.message === "string" && e.message.length < 400 && !/ECONNREFUSED|ENOTFOUND|socket hang up|fetch failed/i.test(e.message)) {
      // Mostra erros legíveis que o próprio bot lançou (IA, música, permissões de voz, etc.)
      msg = `❌ ${e.message}`;
    } else if (e?.message && /OPENAI|api\.openai|insufficient_quota|billing|rate_limit|Invalid API Key|incorrect api key/i.test(String(e.message))) {
      msg = "❌ Problema com a OpenAI (chave inválida, sem crédito ou limite). Confira OPENAI_API_KEY e a cobrança da conta.";
    }

    if (i.replied || i.deferred) {
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
