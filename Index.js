// FFmpeg local ajuda a biblioteca de voz a processar fontes de áudio que não sejam Opus direto.
try {
  const ffmpegBinary = require("ffmpeg-static");
  if (ffmpegBinary) process.env.FFMPEG_PATH = ffmpegBinary;
} catch (error) {
  console.warn("ffmpeg-static não está instalado; alguns formatos de áudio podem não funcionar:", error?.message || error);
}

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
// Mantém uma única biblioteca de extração de música para não misturar versões incompatíveis.
const play = require("@iamtraction/play-dl");
console.log("Biblioteca de música: @iamtraction/play-dl");
const { createCanvas, loadImage, GlobalFonts } = require("@napi-rs/canvas");

const fs = require("node:fs");
const path = require("node:path");
const { StreamType } = require("@discordjs/voice");
const youtubedl = require("youtube-dl-exec");

// Fontes embutidas — no Linux/Railway Arial nao existe e o texto some do canvas.
const FONT_CANDIDATES = [
  path.join(__dirname, "fonts", "DejaVuSans.ttf"),
  path.join(__dirname, "node_modules", "dejavu-fonts-ttf", "ttf", "DejaVuSans.ttf"),
  path.join(process.cwd(), "node_modules", "dejavu-fonts-ttf", "ttf", "DejaVuSans.ttf"),
  path.join(process.cwd(), "fonts", "DejaVuSans.ttf"),
  "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
  "/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf"
];
const FONT_BOLD_CANDIDATES = [
  path.join(__dirname, "fonts", "DejaVuSans-Bold.ttf"),
  path.join(__dirname, "node_modules", "dejavu-fonts-ttf", "ttf", "DejaVuSans-Bold.ttf"),
  path.join(process.cwd(), "node_modules", "dejavu-fonts-ttf", "ttf", "DejaVuSans-Bold.ttf"),
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
const OWNER_ROLE_ID = process.env.OWNER_ROLE_ID || "";
const OWNER_USERNAME = (process.env.OWNER_USERNAME || "kuroshikk").toLowerCase();
const CLIENT_ID = process.env.CLIENT_ID;
const GUILD_ID = process.env.GUILD_ID;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || "";
const AI_MODEL = process.env.AI_MODEL || "gpt-4o-mini";
// DALL·E 2/3 já não são modelos adequados para uma nova integração. Se a variável antiga
// IMAGE_MODEL ainda estiver definida no Railway como dall-e-3, usamos GPT Image 2 mesmo assim.
const configuredImageModel = String(process.env.IMAGE_MODEL || "").trim();
const IMAGE_MODEL = (!configuredImageModel || /^dall-e-[23]$/i.test(configuredImageModel))
  ? "gpt-image-2"
  : configuredImageModel;
const MUSIC_AUTOPLAY_URL = process.env.MUSIC_AUTOPLAY_URL || "";
const IP = process.env.MINECRAFT_IP || "YSISmc.aternos.me";
const PORT = process.env.MINECRAFT_PORT || "50061";
const SITE = process.env.SITE_URL || "https://bit.ly/YsisMc";
const ATERNOS = process.env.ATERNOS_URL || "https://aternos.org/server/";
const LOG_CHANNEL_ID = process.env.LOG_CHANNEL_ID || "";
const WELCOME_CHANNEL_ID = process.env.WELCOME_CHANNEL_ID || "";
const GOODBYE_CHANNEL_ID = process.env.GOODBYE_CHANNEL_ID || "";

if (!TOKEN) {
  console.error("Configure DISCORD_TOKEN nas variáveis do Railway.");
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
  if (!c.currencyName || c.currencyName === "moedas") c.currencyName = "Bit coin";
  if (!c.currencyEmoji || c.currencyEmoji === "🪙") c.currencyEmoji = "₿";
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
      manualAchievements: [],
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
  if (!Array.isArray(u.manualAchievements)) u.manualAchievements = [];

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
function unlockedAchievements(profile) {
  const manual = new Set(Array.isArray(profile.manualAchievements) ? profile.manualAchievements : []);
  return achievementCatalog.filter(a => a.test(profile) || manual.has(a.id));
}
function hasOwnerRole(interaction) {
  if (!OWNER_ROLE_ID) return false;
  const roles = interaction?.member?.roles;
  return Boolean(roles?.cache?.has(OWNER_ROLE_ID) || (Array.isArray(roles) && roles.includes(OWNER_ROLE_ID)));
}
function isOwner(interaction) {
  if (hasOwnerRole(interaction)) return true;
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
  // Perfil inspirado no layout azul enviado: moldura superior, avatar circular,
  // cartões de estatísticas e uma área inferior com biografia/conquistas.
  const W = 1100;
  const H = 540;
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext("2d");

  const setFont = (size, bold = false) => {
    ctx.font = `${Math.max(10, Math.floor(size))}px ${bold ? FONT_BOLD : FONT}`;
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
    const original = String(value ?? "");
    let out = original;
    while (out.length > 1 && textWidth(out, size, bold) > maxWidth) out = out.slice(0, -1);
    if (out.length < original.length) out = `${out.trimEnd()}…`;
    return out;
  };
  const rounded = (x, y, w, h, radius, fill, stroke = null, lineWidth = 1) => {
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, radius);
    ctx.fillStyle = fill;
    ctx.fill();
    if (stroke) {
      ctx.strokeStyle = stroke;
      ctx.lineWidth = lineWidth;
      ctx.stroke();
    }
  };
  const pill = (x, y, w, label, color, fill = "rgba(7, 24, 43, 0.72)") => {
    rounded(x, y, w, 25, 12, fill, color, 1.4);
    ctx.beginPath();
    ctx.arc(x + 11, y + 12.5, 3.5, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
    drawText(clip(label, w - 27, 11, true), x + 20, y + 16.5, 11, "#eaf4ff", true);
  };
  const wrapText = (value, maxWidth, size, maxLines = 2) => {
    setFont(size, false);
    const words = String(value || "").split(/\s+/).filter(Boolean);
    const lines = [];
    let line = "";
    for (const word of words) {
      const next = line ? `${line} ${word}` : word;
      if (textWidth(next, size, false) > maxWidth && line) {
        lines.push(line);
        line = word;
        if (lines.length === maxLines) break;
      } else {
        line = next;
      }
    }
    if (lines.length < maxLines && line) lines.push(line);
    if (words.length && lines.length === maxLines) {
      const shown = lines.join(" ");
      if (shown.length < words.join(" ").length) lines[maxLines - 1] = clip(lines[maxLines - 1], maxWidth - 8, size, false);
    }
    return lines;
  };

  const totalXP = Math.max(0, Number(profile.xp || 0));
  const lv = level(totalXP);
  const currentXP = Math.max(0, totalXP - lv * lv * 100);
  const neededXP = Math.max(1, (lv + 1) ** 2 * 100 - lv * lv * 100);
  const coins = Math.max(0, Number(profile.coins || 0));
  const bank = Math.max(0, Number(profile.bank || 0));
  const rep = Math.max(0, Number(profile.reputation || 0));
  const frame = frameCatalog[profile.frame] || frameCatalog.azul;
  const frameColor = `#${Number(frame.color || 0x2878ff).toString(16).padStart(6, "0")}`;
  const uname = String(target.globalName || target.username || "Jogador");
  const bio = String(profile.bio || "Ainda escrevendo minha história no YSIS MC.").replace(/\s+/g, " ").trim();
  const unlocked = unlockedAchievements(profile);
  const achievements = unlocked.length;
  const totalAchievements = achievementCatalog.length;
  const isFeatured = Number(profile.featuredUntil || 0) > Date.now();
  const profileStatus = isFeatured ? "Perfil em destaque" : "Perfil comum";
  const partnerId = data.marriages?.[target.id];
  const partnerName = partnerId ? (guild?.members?.cache?.get(partnerId)?.displayName || guild?.members?.cache?.get(partnerId)?.user?.username) : "";
  const relationship = partnerId ? (partnerName ? `Casado(a) com ${partnerName}` : "Casado(a)") : "Solteiro(a)";

  const users = Object.entries(data.users || {});
  const xpRank = Math.max(1, users.map(([id, p]) => ({ id, xp: Number(p.xp || 0) })).sort((a, b) => b.xp - a.xp).findIndex(item => item.id === target.id) + 1);
  const moneyRank = Math.max(1, users.map(([id, p]) => ({ id, total: Number(p.coins || 0) + Number(p.bank || 0) })).sort((a, b) => b.total - a.total).findIndex(item => item.id === target.id) + 1);

  // Fundo azul-marinho com o padrão diagonal do mockup.
  const bg = ctx.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, "#08172a");
  bg.addColorStop(0.55, "#0d2038");
  bg.addColorStop(1, "#09182b");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);
  ctx.save();
  ctx.globalAlpha = 0.19;
  ctx.strokeStyle = "#24415e";
  ctx.lineWidth = 1;
  for (let x = -H; x < W + H; x += 25) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x + H, H);
    ctx.stroke();
  }
  ctx.restore();

  // Cabeçalho azul arredondado.
  const headerGradient = ctx.createLinearGradient(10, 10, W - 10, 160);
  headerGradient.addColorStop(0, "#14345a");
  headerGradient.addColorStop(0.55, "#1b4a75");
  headerGradient.addColorStop(1, "#15395f");
  rounded(15, 15, W - 30, 142, 22, headerGradient, "#2e6998", 2);
  ctx.save();
  ctx.globalAlpha = 0.18;
  ctx.fillStyle = "#5c9bce";
  ctx.beginPath(); ctx.arc(920, 120, 50, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(1025, 67, 62, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
  rounded(940, 35, 120, 34, 17, "rgba(4, 21, 39, 0.65)", "#477da6", 1.5);
  ctx.beginPath(); ctx.arc(960, 52, 5, 0, Math.PI * 2); ctx.fillStyle = isFeatured ? "#f6c453" : "#43df8a"; ctx.fill();
  drawText(isFeatured ? "DESTAQUE" : "YSIS MC", 972, 57, 11, "#eff7ff", true);

  // Avatar com contorno escolhido pelo usuário.
  const ax = 100, ay = 175;
  ctx.beginPath(); ctx.arc(ax, ay, 62, 0, Math.PI * 2); ctx.fillStyle = "#071426"; ctx.fill();
  ctx.strokeStyle = frameColor; ctx.lineWidth = 6; ctx.stroke();
  ctx.beginPath(); ctx.arc(ax, ay, 54, 0, Math.PI * 2); ctx.fillStyle = "#f5f8ff"; ctx.fill();
  try {
    const avatar = await loadImage(target.displayAvatarURL({ extension: "png", size: 256 }));
    ctx.save();
    ctx.beginPath(); ctx.arc(ax, ay, 50, 0, Math.PI * 2); ctx.clip();
    ctx.drawImage(avatar, ax - 50, ay - 50, 100, 100);
    ctx.restore();
  } catch {
    drawText("?", ax - 10, ay + 13, 36, "#98aabe", true);
  }

  // Identificação, bio resumida e badges no cabeçalho.
  drawText(clip(uname, 560, 29, true), 180, 190, 29, "#ffffff", true);
  drawText(`Perfil de jogador • ${clip(String(target.username || "@jogador"), 330, 14, false)}`, 182, 214, 13, "#c2d9ed", false);
  pill(180, 225, 175, frame.name || "Azul clássico", frameColor);
  pill(365, 225, isFeatured ? 205 : 160, profileStatus, isFeatured ? "#f6c453" : "#398de3");

  // Cartão 1: progressão e XP.
  const cardFill = "rgba(5, 19, 34, 0.82)";
  const cardBorder = "#1d3e5c";
  rounded(24, 253, 420, 153, 17, cardFill, cardBorder, 1.5);
  drawText("PROGRESSÃO", 45, 282, 13, "#9fc9ed", true);
  drawText(`Nível ${lv}`, 45, 318, 30, "#ffffff", true);
  drawText(`${fmt(totalXP)} XP no total`, 185, 316, 14, "#d6eaff", true);
  const progressX = 45, progressY = 336, progressW = 378, progressH = 16;
  rounded(progressX, progressY, progressW, progressH, 8, "#142b40");
  const progressPct = Math.max(0, Math.min(1, currentXP / neededXP));
  if (progressPct > 0) {
    const pg = ctx.createLinearGradient(progressX, 0, progressX + progressW * progressPct, 0);
    pg.addColorStop(0, "#2b80ff"); pg.addColorStop(1, "#68c9ff");
    rounded(progressX, progressY, Math.max(8, progressW * progressPct), progressH, 8, pg);
  }
  drawText(`${fmt(currentXP)} / ${fmt(neededXP)} XP para o próximo nível`, 45, 374, 12, "#d4e7f8", false);
  drawText(`Ranking XP #${xpRank}`, 45, 395, 12, "#8fb6d7", true);

  // Cartão 2: carteira, banco, relacionamento e reputação.
  rounded(460, 253, 420, 153, 17, cardFill, cardBorder, 1.5);
  drawText("CARTEIRA", 482, 281, 12, "#9fc9ed", true);
  drawText(fmt(coins), 482, 309, 23, "#ffffff", true);
  drawText("BANCO", 682, 281, 12, "#9fc9ed", true);
  drawText(fmt(bank), 682, 309, 23, "#ffffff", true);
  ctx.strokeStyle = "#21425e"; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(482, 325); ctx.lineTo(858, 325); ctx.stroke();
  drawText("RELACIONAMENTO", 482, 349, 11, "#9fc9ed", true);
  drawText(clip(relationship, 180, 14, true), 482, 372, 14, "#ffffff", true);
  drawText("REPUTAÇÃO", 682, 349, 11, "#9fc9ed", true);
  drawText(fmt(rep), 682, 374, 21, "#ffffff", true);
  drawText(`Ranking econômico #${moneyRank}`, 682, 395, 10, "#8fb6d7", false);

  // Cartão 3: total de conquistas e um pequeno ícone pixelado no estilo do modelo.
  rounded(900, 253, 176, 153, 17, cardFill, cardBorder, 1.5);
  const cx = 988, cy = 291, block = 7;
  ctx.fillStyle = "#267d37"; ctx.fillRect(cx - 28, cy - 12, 56, 56);
  ctx.fillStyle = "#43ad50"; ctx.fillRect(cx - 28, cy - 5, 56, 49);
  ctx.fillStyle = "#0e2a1a";
  ctx.fillRect(cx - 18, cy + 8, 10, 13); ctx.fillRect(cx + 8, cy + 8, 10, 13);
  ctx.fillRect(cx - 12, cy + 29, 24, 7);
  drawText(`${achievements}/${totalAchievements}`, 925, 365, 24, "#ffffff", true);
  drawText("CONQUISTAS", 925, 38
