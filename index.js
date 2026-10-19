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
  StringSelectMenuBuilder,
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
const { buffer: streamToBuffer } = require("node:stream/consumers");

const fs = require("node:fs");
const path = require("node:path");

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
// Cargo de dono do YSIS MC. Pode ser substituído pela variável OWNER_ROLE_ID no Railway.
const OWNER_ROLE_ID = process.env.OWNER_ROLE_ID || "1402707266477621270";
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
      banner: "cosmico",
      ownedBanners: ["cosmico"],
      ownedInsignias: [],
      ownedAchievements: [],
      ownedPets: [],
      activePet: null,
      pets: {},
      petBoxes: {},
      starterPetClaimed: false,
      ownedPetAccessories: [],
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
  if (typeof u.banner !== "string") u.banner = "cosmico";
  if (!Array.isArray(u.ownedBanners)) u.ownedBanners = ["cosmico"];
  if (!u.ownedBanners.includes("cosmico")) u.ownedBanners.unshift("cosmico");
  if (!Array.isArray(u.ownedInsignias)) u.ownedInsignias = [];
  if (!Array.isArray(u.ownedAchievements)) u.ownedAchievements = [];
  if (!Array.isArray(u.ownedPets)) u.ownedPets = [];
  if (!u.pets || typeof u.pets !== "object" || Array.isArray(u.pets)) u.pets = {};
  if (!u.petBoxes || typeof u.petBoxes !== "object" || Array.isArray(u.petBoxes)) u.petBoxes = {};
  if (typeof u.starterPetClaimed !== "boolean") u.starterPetClaimed = u.ownedPets.length > 0;
  if (u.ownedPets.length > 0) u.starterPetClaimed = true;
  if (!Array.isArray(u.ownedPetAccessories)) u.ownedPetAccessories = [];
  if (typeof u.activePet !== "string") u.activePet = null;
  for (const petId of u.ownedPets) {
    if (!u.pets[petId] || typeof u.pets[petId] !== "object") u.pets[petId] = {};
    const petState = u.pets[petId];
    if (!Number.isFinite(petState.hearts)) petState.hearts = 0;
    if (!Number.isFinite(petState.xp)) petState.xp = 0;
    if (!Number.isFinite(petState.lastFeed)) petState.lastFeed = 0;
    if (!Number.isFinite(petState.lastPlay)) petState.lastPlay = 0;
    if (typeof petState.accessory !== "string") petState.accessory = null;
  }
  if (u.activePet && !u.ownedPets.includes(u.activePet)) u.activePet = null;
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
function unlockedAchievements(profile) { return achievementCatalog.filter(a => a.test(profile) || (profile.ownedAchievements || []).includes(a.id)); }
function isOwner(interaction) {
  const id = interaction?.user?.id;
  const username = String(interaction?.user?.username || "").toLowerCase();
  const roles = interaction?.member?.roles?.cache
    ? [...interaction.member.roles.cache.keys()]
    : (Array.isArray(interaction?.member?.roles) ? interaction.member.roles : []);
  return Boolean((OWNER_USER_ID && id === OWNER_USER_ID) ||
    (OWNER_ROLE_ID && roles.includes(OWNER_ROLE_ID)) || username === OWNER_USERNAME);
}
const rand = (a, b) => Math.floor(Math.random() * (b - a + 1)) + a;
const fmt = n => Number(n || 0).toLocaleString("pt-BR");
const level = xp => Math.floor(Math.sqrt(Math.max(0, xp) / 100));

// Ilustrações do perfil empacotadas junto do index.js (pasta assets/).
// Se os arquivos não estiverem presentes, o bot continua usando os fundos desenhados por código.
let profileArtPromise = null;
let profileArtCache = { cosmicFrames: [], pets: {} };
async function ensureProfileArt() {
  if (!profileArtPromise) {
    profileArtPromise = (async () => {
      const cosmicFrames = [];
      for (let index = 0; index < 6; index++) {
        const file = path.join(__dirname, "assets", `background_cosmico_${index}.png`);
        if (!fs.existsSync(file)) continue;
        try { cosmicFrames.push(await loadImage(file)); }
        catch (error) { console.warn(`Não consegui carregar ${file}:`, error?.message || error); }
      }
      const pets = {};
      const puppyFile = path.join(__dirname, "assets", "pet_cachorrinho.png");
      if (fs.existsSync(puppyFile)) {
        try { pets.cachorro = await loadImage(puppyFile); }
        catch (error) { console.warn(`Não consegui carregar ${puppyFile}:`, error?.message || error); }
      }
      profileArtCache = { cosmicFrames, pets };
      return profileArtCache;
    })().catch(error => {
      console.warn("As ilustrações externas não puderam ser carregadas; usando o desenho padrão.", error?.message || error);
      return profileArtCache;
    });
  }
  return profileArtPromise;
}

function drawCoverImage(ctx, image, x, y, width, height) {
  if (!image) return;
  const scale = Math.max(width / image.width, height / image.height);
  const drawWidth = image.width * scale;
  const drawHeight = image.height * scale;
  ctx.drawImage(image, x + (width - drawWidth) / 2, y + (height - drawHeight) / 2, drawWidth, drawHeight);
}

const bar = (n, max) => {
  const f = Math.max(0, Math.min(10, Math.floor((max ? n / max : 0) * 10)));
  return "🟦".repeat(f) + "⬛".repeat(10 - f);
};

async function renderProfileCardFrame(target, profile, guild, frameIndex = 0) {
  const profileArt = await ensureProfileArt();
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

  // O fundo cósmico usa os quadros do GIF enviado como referência; os demais mantêm suas cenas próprias.
  const activeBanner = bannerCatalog[profile.banner] || bannerCatalog.cosmico;
  const cosmicFrames = profileArt.cosmicFrames || [];
  const cosmicImage = activeBanner.style === "cosmico" && cosmicFrames.length
    ? cosmicFrames[((frameIndex % cosmicFrames.length) + cosmicFrames.length) % cosmicFrames.length]
    : null;
  if (cosmicImage) {
    drawCoverImage(ctx, cosmicImage, 0, 0, W, H);
    ctx.fillStyle = "rgba(2, 7, 20, 0.28)";
    ctx.fillRect(0, 0, W, H);
  } else {
    const bg = ctx.createLinearGradient(0, 0, W, H);
    bg.addColorStop(0, activeBanner.colors[0]);
    bg.addColorStop(0.55, activeBanner.colors[1]);
    bg.addColorStop(1, activeBanner.colors[2]);
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);
  }

  const glow = (x, y, radius, color, alpha = 0.18) => {
    const g = ctx.createRadialGradient(x, y, 0, x, y, radius);
    g.addColorStop(0, color);
    g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = g;
    ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
  };
  // Névoas espaciais de baixa opacidade, posicionadas diferentemente por banner.
  const nebulaColors = {
    cosmico: ["rgba(38,139,255,0.19)", "rgba(69,197,255,0.09)"],
    aurora: ["rgba(52,232,177,0.17)", "rgba(39,151,180,0.10)"],
    oceano: ["rgba(46,199,255,0.20)", "rgba(14,94,171,0.16)"],
    floresta: ["rgba(73,220,127,0.17)", "rgba(20,94,56,0.16)"],
    galaxia: ["rgba(173,93,255,0.20)", "rgba(85,77,215,0.12)"],
    sakura: ["rgba(255,118,190,0.17)", "rgba(157,71,129,0.13)"],
    inferno: ["rgba(255,106,62,0.16)", "rgba(169,37,57,0.12)"],
    nether: ["rgba(255,55,67,0.19)", "rgba(117,14,32,0.17)"],
    eclipse: ["rgba(255,95,207,0.15)", "rgba(117,66,221,0.12)"]
  }[activeBanner.style || "cosmico"] || ["rgba(38,139,255,0.19)", "rgba(69,197,255,0.09)"];
  const drift = frameIndex * (activeBanner.rarity === "Mítico" ? 13 : 8);
  glow(240 + drift, 135, 210, nebulaColors[0], 0.18);
  glow(765 - drift * 0.65, 300, 245, nebulaColors[1], 0.16);

  // Planeta com horizonte luminoso azul, inspirado no exemplo enviado: escuro, elegante e discreto.
  if (!cosmicImage && ((activeBanner.style || "cosmico") === "cosmico" || activeBanner.style === "galaxia" || activeBanner.style === "eclipse")) {
    const px = activeBanner.style === "eclipse" ? 830 + drift * 0.35 : 840 + drift * 0.4;
    const py = activeBanner.style === "cosmico" ? 290 : 280;
    const pr = activeBanner.style === "eclipse" ? 112 : 135;
    ctx.save();
    ctx.globalAlpha = activeBanner.style === "eclipse" ? 0.66 : 0.78;
    const planet = ctx.createRadialGradient(px - pr * 0.32, py - pr * 0.45, pr * 0.08, px, py, pr * 1.18);
    planet.addColorStop(0, activeBanner.style === "eclipse" ? "#2b1839" : activeBanner.style === "galaxia" ? "#39275b" : "#183b60");
    planet.addColorStop(0.66, activeBanner.style === "eclipse" ? "#100f20" : "#091626");
    planet.addColorStop(1, "rgba(2,7,18,0)");
    ctx.fillStyle = planet; ctx.beginPath(); ctx.arc(px, py, pr * 1.18, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 0.46;
    ctx.strokeStyle = activeBanner.style === "eclipse" ? "#b36cff" : activeBanner.style === "galaxia" ? "#a18bff" : "#50baff";
    ctx.lineWidth = 2.2;
    ctx.beginPath(); ctx.ellipse(px, py + 4, pr * 1.18, pr * 0.28, -0.16 + frameIndex * 0.025, 0, Math.PI * 2); ctx.stroke();
    ctx.globalAlpha = 0.55;
    const horizon = ctx.createRadialGradient(px, py - pr * 0.6, 1, px, py - pr * 0.6, pr * 1.04);
    horizon.addColorStop(0, activeBanner.style === "eclipse" ? "rgba(194,108,255,0.19)" : "rgba(65,174,255,0.20)");
    horizon.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = horizon; ctx.fillRect(px - pr * 1.2, py - pr * 1.6, pr * 2.4, pr * 2.4);
    ctx.restore();
  } else if (activeBanner.style === "aurora") {
    ctx.save();
    ctx.globalAlpha = 0.16;
    for (let k = 0; k < 4; k++) {
      ctx.beginPath();
      ctx.moveTo(180 + k * 175, 0);
      ctx.bezierCurveTo(110 + k * 175 + drift, 90, 280 + k * 170, 125, 150 + k * 180 - drift * 0.4, 225);
      ctx.bezierCurveTo(120 + k * 170, 160, 220 + k * 170, 80, 270 + k * 175, 0);
      ctx.closePath();
      ctx.fillStyle = k % 2 ? "#3bf1b6" : "#43acd8";
      ctx.fill();
    }
    ctx.restore();
  } else if (activeBanner.style === "inferno") {
    const px = 850 - drift * 0.45, py = 300, pr = 118;
    ctx.save(); ctx.globalAlpha = 0.68;
    const planet = ctx.createRadialGradient(px - 28, py - 38, 8, px, py, pr * 1.2);
    planet.addColorStop(0, "#692d36"); planet.addColorStop(0.62, "#24111d"); planet.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = planet; ctx.beginPath(); ctx.arc(px, py, pr * 1.2, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 0.28; ctx.strokeStyle = "#ffae61"; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.ellipse(px, py + 4, pr * 1.16, pr * 0.23, -0.13, 0, Math.PI * 2); ctx.stroke();
    ctx.restore();
  } else if (activeBanner.style === "oceano") {
    const px = 830 - drift * 0.25, py = 292, pr = 128;
    ctx.save(); ctx.globalAlpha = 0.68;
    const ocean = ctx.createRadialGradient(px - 28, py - 35, 6, px, py, pr * 1.2);
    ocean.addColorStop(0, "#1e9bb7"); ocean.addColorStop(0.58, "#07536f"); ocean.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = ocean; ctx.beginPath(); ctx.arc(px, py, pr * 1.2, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = "rgba(117,229,255,0.55)"; ctx.lineWidth = 2;
    for (let ring = 0; ring < 3; ring++) { ctx.beginPath(); ctx.ellipse(px, py + 28 + ring * 7, pr * (0.76 + ring * 0.1), 16 + ring * 2, -0.1, 0, Math.PI * 2); ctx.stroke(); }
    ctx.fillStyle = "rgba(159,241,255,0.65)";
    for (let bubble = 0; bubble < 8; bubble++) { const bx = px - 70 + (bubble * 43) % 150, by = 175 + (bubble * 31) % 155; ctx.beginPath(); ctx.arc(bx, by, 2 + bubble % 3, 0, Math.PI * 2); ctx.fill(); }
    ctx.restore();
  } else if (activeBanner.style === "floresta") {
    ctx.save(); ctx.globalAlpha = 0.58;
    for (let tree = 0; tree < 7; tree++) {
      const tx = 640 + tree * 62, th = 90 + (tree % 3) * 22;
      ctx.fillStyle = tree % 2 ? "#0a281d" : "#123b28";
      ctx.beginPath(); ctx.moveTo(tx, 405); ctx.lineTo(tx + 23, 405 - th); ctx.lineTo(tx + 46, 405); ctx.closePath(); ctx.fill();
      ctx.fillRect(tx + 20, 390 - th * 0.22, 6, th * 0.24);
    }
    ctx.globalAlpha = 0.22; ctx.strokeStyle = "#8af0a3"; ctx.lineWidth = 2;
    for (let vine = 0; vine < 4; vine++) { ctx.beginPath(); ctx.moveTo(700 + vine * 75, 40); ctx.bezierCurveTo(660 + vine * 80, 120, 790 + vine * 48, 150, 760 + vine * 54, 230); ctx.stroke(); }
    ctx.restore();
  } else if (activeBanner.style === "sakura") {
    const px = 850, py = 275, pr = 105;
    ctx.save(); ctx.globalAlpha = 0.72;
    const moon = ctx.createRadialGradient(px - 20, py - 28, 5, px, py, pr * 1.2);
    moon.addColorStop(0, "#ffd9eb"); moon.addColorStop(0.5, "#a64f85"); moon.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = moon; ctx.beginPath(); ctx.arc(px, py, pr * 1.2, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#ffadd5";
    for (let petal = 0; petal < 22; petal++) {
      const x = (petal * 137 + frameIndex * 17) % W, y = (petal * 71 + frameIndex * 23) % 400;
      ctx.save(); ctx.translate(x, y); ctx.rotate(petal * 0.6); ctx.beginPath(); ctx.ellipse(0, 0, 4, 2, 0, 0, Math.PI * 2); ctx.fill(); ctx.restore();
    }
    ctx.restore();
  } else if (activeBanner.style === "nether") {
    const px = 835, py = 287, pr = 125;
    ctx.save(); ctx.globalAlpha = 0.78;
    const lava = ctx.createRadialGradient(px - 24, py - 35, 5, px, py, pr * 1.2);
    lava.addColorStop(0, "#7a2432"); lava.addColorStop(0.58, "#310b18"); lava.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = lava; ctx.beginPath(); ctx.arc(px, py, pr * 1.2, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = "rgba(255,94,74,0.75)"; ctx.lineWidth = 2;
    for (let crack = 0; crack < 8; crack++) { const x = px - 75 + crack * 19; ctx.beginPath(); ctx.moveTo(x, py - 70 + crack % 3 * 12); ctx.lineTo(x - 10 + crack % 2 * 20, py - 18 + crack % 4 * 14); ctx.lineTo(x + 8, py + 48); ctx.stroke(); }
    ctx.restore();
  }

  ctx.save();
  ctx.globalAlpha = 0.12;
  ctx.strokeStyle = activeBanner.lineColor;
  ctx.lineWidth = 1;
  for (let x = -H; x < W + H; x += 38) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x + H, H);
    ctx.stroke();
  }
  // Brilho e estrelas movimentam-se apenas quando o banner pede versão GIF.
  for (let n = 0; n < 48; n++) {
    const x = (n * 137 + frameIndex * (9 + (n % 5) * 2)) % W;
    const y = (n * 83 + frameIndex * (5 + (n % 4) * 2)) % H;
    const r = 0.8 + (n % 3) * 0.45;
    ctx.globalAlpha = 0.14 + ((n + frameIndex) % 4) * 0.035;
    ctx.fillStyle = n % 4 === 0 ? activeBanner.accent : "#ffffff";
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();

  const headerGradient = ctx.createLinearGradient(10 + frameIndex * 8, 10, W - 10, 160);
  headerGradient.addColorStop(0, activeBanner.headerColors[0]);
  headerGradient.addColorStop(0.55, activeBanner.headerColors[1]);
  headerGradient.addColorStop(1, activeBanner.headerColors[2]);
  rounded(15, 15, W - 30, 142, 22, headerGradient, activeBanner.accent, 2);
  // Faixa de brilho animada, atrás do texto do cabeçalho.
  ctx.save();
  ctx.globalAlpha = 0.12;
  const shineX = 40 + (frameIndex * 195) % (W - 250);
  const shine = ctx.createLinearGradient(shineX, 20, shineX + 110, 150);
  shine.addColorStop(0, "rgba(255,255,255,0)");
  shine.addColorStop(0.5, "rgba(255,255,255,0.95)");
  shine.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = shine; ctx.fillRect(15, 15, W - 30, 142);
  ctx.restore();
  ctx.save();
  ctx.globalAlpha = 0.18;
  ctx.fillStyle = "#5c9bce";
  ctx.beginPath(); ctx.arc(920, 120, 50, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(1025, 67, 62, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
  rounded(940, 35, 120, 34, 17, "rgba(4, 21, 39, 0.65)", "#477da6", 1.5);
  ctx.beginPath(); ctx.arc(960, 52, 5, 0, Math.PI * 2); ctx.fillStyle = isFeatured ? "#f6c453" : "#43df8a"; ctx.fill();
  drawText(isFeatured ? "DESTAQUE" : "YSIS MC", 972, 57, 11, "#eff7ff", true);
  rounded(780, 78, 280, 39, 12, "rgba(4, 21, 39, 0.62)", activeBanner.rarityColor, 1.4);
  drawText(clip(`${activeBanner.emoji || "🌌"} ${activeBanner.name}`, 245, 12, true), 795, 94, 12, "#ffffff", true);
  drawText(activeBanner.rarity.toUpperCase(), 795, 108, 9, activeBanner.rarityColor, true);

  // Avatar com contorno escolhido pelo usuário.
  const ax = 100, ay = 175;
  ctx.beginPath(); ctx.arc(ax, ay, 62, 0, Math.PI * 2); ctx.fillStyle = "#071426"; ctx.fill();
  ctx.strokeStyle = frameColor; ctx.lineWidth = 6; ctx.stroke();
  // Ornamento da moldura: coroa, tiara ou folhas conforme a moldura equipada.
  const ornament = frame.ornament || "none";
  ctx.save(); ctx.translate(ax, ay - 59); ctx.strokeStyle = frameColor; ctx.fillStyle = frameColor; ctx.lineWidth = 2.3;
  if (ornament === "crown") {
    ctx.beginPath(); ctx.moveTo(-22, 1); ctx.lineTo(-19, -15); ctx.lineTo(-7, -6); ctx.lineTo(0, -20); ctx.lineTo(8, -6); ctx.lineTo(20, -15); ctx.lineTo(23, 1); ctx.closePath(); ctx.fill();
    ctx.fillStyle = "#fff0b4"; for (const gemX of [-15, 0, 15]) { ctx.beginPath(); ctx.arc(gemX, -4, 2.2, 0, Math.PI * 2); ctx.fill(); }
  } else if (ornament === "tiara") {
    ctx.beginPath(); ctx.moveTo(-25, 2); ctx.quadraticCurveTo(-12, -7, -8, -18); ctx.lineTo(0, -7); ctx.lineTo(8, -18); ctx.quadraticCurveTo(12, -7, 25, 2); ctx.stroke();
    ctx.beginPath(); ctx.ellipse(0, -8, 25, 9, 0, Math.PI, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = "#ffffff"; ctx.beginPath(); ctx.arc(0, -13, 2.5, 0, Math.PI * 2); ctx.fill();
  } else if (ornament === "laurel") {
    for (const side of [-1, 1]) for (let k = 0; k < 4; k++) {
      const xx = side * (14 + k * 5), yy = -3 - Math.sin(k * 0.7) * 10;
      ctx.save(); ctx.translate(xx, yy); ctx.rotate(side * (-0.35 + k * 0.08));
      ctx.beginPath(); ctx.ellipse(0, 0, 4, 8, 0, 0, Math.PI * 2); ctx.fill(); ctx.restore();
    }
    ctx.beginPath(); ctx.arc(0, 1, 8, Math.PI, Math.PI * 2); ctx.stroke();
  } else if (ornament === "halo") {
    ctx.beginPath(); ctx.ellipse(0, -8, 21, 6, 0, 0, Math.PI * 2); ctx.stroke();
    ctx.globalAlpha = 0.55; ctx.beginPath(); ctx.arc(0, -8, 27, Math.PI * 1.08, Math.PI * 1.92); ctx.stroke();
  } else if (ornament === "flowers") {
    for (const flowerX of [-19, 0, 19]) {
      for (let petal = 0; petal < 5; petal++) {
        const angle = petal * Math.PI * 2 / 5;
        ctx.beginPath(); ctx.ellipse(flowerX + Math.cos(angle) * 5, -10 + Math.sin(angle) * 5, 3.8, 2.7, angle, 0, Math.PI * 2); ctx.fill();
      }
      ctx.fillStyle = "#fff0a6"; ctx.beginPath(); ctx.arc(flowerX, -10, 2.2, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = frameColor;
    }
  } else if (ornament === "crystal") {
    ctx.beginPath(); ctx.moveTo(-22, 1); ctx.lineTo(-17, -14); ctx.lineTo(-7, -5); ctx.lineTo(0, -25); ctx.lineTo(7, -5); ctx.lineTo(17, -14); ctx.lineTo(22, 1); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, -25); ctx.lineTo(0, -4); ctx.stroke();
  } else if (ornament === "rings") {
    ctx.beginPath(); ctx.ellipse(-7, -8, 17, 6, -0.25, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.ellipse(7, -8, 17, 6, 0.25, 0, Math.PI * 2); ctx.stroke();
  } else if (ornament === "lightning") {
    ctx.beginPath(); ctx.moveTo(-20, -3); ctx.lineTo(-8, -17); ctx.lineTo(-10, -7); ctx.lineTo(1, -19); ctx.lineTo(-2, -5); ctx.lineTo(16, -12); ctx.lineTo(5, 2); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(19, -13); ctx.lineTo(12, -4); ctx.lineTo(19, -5); ctx.stroke();
  } else if (ornament === "spikes") {
    ctx.beginPath(); ctx.moveTo(-25, 1); ctx.lineTo(-20, -12); ctx.lineTo(-11, -4); ctx.lineTo(-5, -18); ctx.lineTo(0, -6); ctx.lineTo(7, -18); ctx.lineTo(12, -4); ctx.lineTo(21, -12); ctx.lineTo(25, 1); ctx.closePath(); ctx.stroke();
  }
  ctx.restore();
  ctx.beginPath(); ctx.arc(ax, ay, 54, 0, Math.PI * 2); ctx.fillStyle = "#f5f8ff"; ctx.fill();
  try {
    const avatarUrl = target.displayAvatarURL({ extension: "png", size: 256 });
    let avatar = profileAvatarCache.get(avatarUrl);
    if (!avatar) {
      avatar = await loadImage(avatarUrl);
      if (profileAvatarCache.size > 80) profileAvatarCache.clear();
      profileAvatarCache.set(avatarUrl, avatar);
    }
    ctx.save();
    ctx.beginPath(); ctx.arc(ax, ay, 50, 0, Math.PI * 2); ctx.clip();
    ctx.drawImage(avatar, ax - 50, ay - 50, 100, 100);
    ctx.restore();
  } catch {
    drawText("?", ax - 10, ay + 13, 36, "#98aabe", true);
  }
  // O pet ativo aparece como um pequeno companheiro ao lado do avatar.
  if (profile.activePet && petCatalog[profile.activePet]) {
    ctx.beginPath(); ctx.arc(ax + 43, ay + 40, 22, 0, Math.PI * 2); ctx.fillStyle = "#071426"; ctx.fill();
    ctx.strokeStyle = frameColor; ctx.lineWidth = 3; ctx.stroke();
    drawPetBadge(ctx, profile.activePet, ax + 43, ay + 38, 30, profile.pets?.[profile.activePet]?.accessory || null);
  }

  // Identificação, bio resumida e badges no cabeçalho.
  drawText(clip(uname, 560, 29, true), 180, 190, 29, "#ffffff", true);
  drawText(`Perfil de jogador • ${clip(String(target.username || "@jogador"), 330, 14, false)}`, 182, 214, 13, "#c2d9ed", false);
  pill(180, 225, 175, frame.name || "Azul clássico", frameColor);
  pill(365, 225, isFeatured ? 205 : 160, profileStatus, isFeatured ? "#f6c453" : "#398de3");
  const insigniaKeys = [...(profile.ownedInsignias || [])];
  const targetMember = guild?.members?.cache?.get(target.id);
  if ((OWNER_USER_ID && target.id === OWNER_USER_ID) || targetMember?.roles?.cache?.has(OWNER_ROLE_ID)) {
    if (!insigniaKeys.includes("dono")) insigniaKeys.unshift("dono");
  }
  const insignias = insigniaKeys.map(key => insigniaCatalog[key]).filter(Boolean).slice(0, 3);
  if (insignias.length) {
    drawText("INSÍGNIAS", 615, 190, 10, "#f6d78b", true);
    insignias.forEach((badge, index) => {
      const x = 615 + index * 91;
      pill(x, 199, 84, badge.shortName || badge.name, badge.color);
    });
  }

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

  // Cartão 3: painel de conquistas; o pet ativo aparece como um adesivo ao lado do avatar.
  rounded(900, 253, 176, 153, 17, cardFill, cardBorder, 1.5);
  const cx = 988, cy = 290;
  ctx.save();
  ctx.translate(cx, cy - 2);
  ctx.strokeStyle = activeBanner.accent; ctx.lineWidth = 2.4;
  ctx.globalAlpha = 0.7;
  ctx.beginPath(); ctx.ellipse(0, 0, 29, 11, -0.35, 0, Math.PI * 2); ctx.stroke();
  ctx.beginPath(); ctx.ellipse(0, 0, 29, 11, 0.35, 0, Math.PI * 2); ctx.stroke();
  ctx.globalAlpha = 1;
  ctx.fillStyle = activeBanner.rarityColor;
  ctx.beginPath();
  for (let n = 0; n < 10; n++) {
    const a = -Math.PI / 2 + n * Math.PI / 5;
    const r = n % 2 === 0 ? 22 : 10;
    const xx = Math.cos(a) * r, yy = Math.sin(a) * r;
    if (!n) ctx.moveTo(xx, yy); else ctx.lineTo(xx, yy);
  }
  ctx.closePath(); ctx.fill();
  ctx.restore();
  drawText(`${achievements}/${totalAchievements}`, 925, 375, 24, "#ffffff", true);
  drawText("CONQUISTAS", 925, 395, 10, "#a9d4f6", true);
  const achPct = totalAchievements ? achievements / totalAchievements : 0;
  rounded(925, 398, 126, 5, 2.5, "#19344a");
  if (achPct > 0) rounded(925, 398, 126 * achPct, 5, 2.5, "#54bf83");

  // Cartão inferior: descrição completa e prévia das conquistas (desbloqueadas ou bloqueadas).
  rounded(24, 418, W - 48, 105, 17, cardFill, cardBorder, 1.5);
  drawText("SOBRE MIM", 45, 446, 13, "#9fc9ed", true);
  const bioLines = wrapText(bio, 455, 14, 2);
  let bioY = 473;
  for (const line of bioLines) {
    drawText(line, 45, bioY, 14, "#e1edf8", false);
    bioY += 22;
  }
  ctx.strokeStyle = "#21425e"; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(525, 435); ctx.lineTo(525, 506); ctx.stroke();
  drawText(`CONQUISTAS • ${achievements}/${totalAchievements}`, 550, 446, 13, "#9fc9ed", true);
  const preview = achievementCatalog.slice(0, 3);
  preview.forEach((achievement, index) => {
    const x = 550 + index * 172;
    const isUnlocked = achievement.test(profile) || (profile.ownedAchievements || []).includes(achievement.id);
    ctx.beginPath(); ctx.arc(x + 5, 469, 5, 0, Math.PI * 2);
    ctx.fillStyle = isUnlocked ? "#54d68a" : "#62768a"; ctx.fill();
    drawText(clip(achievement.name, 150, 11, true), x + 16, 473, 11, isUnlocked ? "#d9fbea" : "#bdcddd", true);
    drawText(isUnlocked ? "Desbloqueada" : "Bloqueada", x + 16, 493, 10, isUnlocked ? "#79e2a4" : "#7f95a9", false);
  });

  return canvas.toBuffer("image/png");
}

// Gera um GIF animado real do cartão inteiro. Cada quadro re-renderiza o fundo
// para que o banner escolhido anime estrelas e brilho, enquanto os dados ficam legíveis.
const profileAvatarCache = new Map();
async function renderProfileCard(target, profile, guild) {
  const activeBanner = bannerCatalog[profile.banner] || bannerCatalog.cosmico;
  // O fundo cósmico usa a animação enviada; banners Lendários e Míticos também animam.
  const animateCosmic = activeBanner.style === "cosmico" && (await ensureProfileArt()).cosmicFrames.length > 1;
  const shouldAnimate = animateCosmic || ["Lendário", "Mítico"].includes(activeBanner.rarity);
  if (!shouldAnimate) return renderProfileCardFrame(target, profile, guild, 0);
  let gifenc;
  try {
    gifenc = await import("gifenc");
  } catch (error) {
    // O fundo ainda funciona como PNG estático se gifenc não estiver instalado.
    if (animateCosmic) {
      console.warn("gifenc não está disponível; o fundo cósmico será exibido como PNG estático.");
      return renderProfileCardFrame(target, profile, guild, 0);
    }
    throw error;
  }
  const GIFEncoder = gifenc.GIFEncoder || gifenc.default?.GIFEncoder;
  const quantize = gifenc.quantize || gifenc.default?.quantize;
  const applyPalette = gifenc.applyPalette || gifenc.default?.applyPalette;
  if (typeof GIFEncoder !== "function" || typeof quantize !== "function" || typeof applyPalette !== "function") {
    if (animateCosmic) return renderProfileCardFrame(target, profile, guild, 0);
    throw new Error("A biblioteca gifenc foi carregada numa versão incompatível. Verifique o package.json e reinstale as dependências.");
  }
  const W = 1100, H = 540;
  let gif;
  try { gif = GIFEncoder(); } catch { gif = new GIFEncoder(); }
  const frames = [];
  const frameCount = animateCosmic ? Math.min(6, (await ensureProfileArt()).cosmicFrames.length) : 4;
  const frameDelay = animateCosmic ? 150 : 350;
  for (let frameIndex = 0; frameIndex < frameCount; frameIndex++) {
    const png = await renderProfileCardFrame(target, profile, guild, frameIndex);
    const image = await loadImage(png);
    const canvas = createCanvas(W, H);
    const ctx = canvas.getContext("2d");
    ctx.drawImage(image, 0, 0, W, H);
    frames.push(ctx.getImageData(0, 0, W, H).data);
  }
  const palette = quantize(frames[0], 128);
  for (let frameIndex = 0; frameIndex < frames.length; frameIndex++) {
    const indexed = applyPalette(frames[frameIndex], palette);
    gif.writeFrame(indexed, W, H, { palette, delay: frameDelay, repeat: 0, dispose: 1 });
  }
  gif.finish();
  return Buffer.from(gif.bytes());
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
  azul: { name: "Azul clássico", emoji: "🔹", color: 0x2878ff, price: 0, ornament: "halo" },
  verde: { name: "Laurel esmeralda", emoji: "🟢", color: 0x2ecc71, price: 500, ornament: "laurel" },
  roxo: { name: "Tiara violeta", emoji: "🟣", color: 0x9b59b6, price: 650, ornament: "tiara" },
  rosa: { name: "Flores de Sakura", emoji: "🌸", color: 0xf08fba, price: 800, ornament: "flowers" },
  vermelho: { name: "Coroa rubi", emoji: "🔴", color: 0xe74c3c, price: 1050, ornament: "crown" },
  gelo: { name: "Cristal glacial", emoji: "❄️", color: 0x83e8ff, price: 1400, ornament: "crystal" },
  fantasma: { name: "Auréola espectral", emoji: "👻", color: 0xb8c4ff, price: 1800, ornament: "rings" },
  dourado: { name: "Coroa dourada", emoji: "🌟", color: 0xf1c40f, price: 2200, ornament: "crown" },
  obsidiana: { name: "Obsidiana sombria", emoji: "🌑", color: 0x77708e, price: 2700, ornament: "spikes" },
  eletrica: { name: "Tempestade elétrica", emoji: "⚡", color: 0x8ef7ff, price: 3200, ornament: "lightning" }
};

const bannerCatalog = {
  cosmico: { name: "Nebulosa Cósmica", emoji: "🌌", rarity: "Comum", rarityColor: "#a9bfd2", price: 0, style: "cosmico", colors: ["#030914", "#0b1a2b", "#040915"], headerColors: ["#10243a", "#1a3b58", "#0d2038"], lineColor: "#345878", accent: "#9bcfff" },
  aurora: { name: "Aurora Boreal", emoji: "🌈", rarity: "Raro", rarityColor: "#4de2b4", price: 1200, style: "aurora", colors: ["#04151b", "#0a2931", "#06131e"], headerColors: ["#0b363b", "#15554f", "#092734"], lineColor: "#2b847c", accent: "#66daba" },
  oceano: { name: "Abismo Oceânico", emoji: "🌊", rarity: "Raro", rarityColor: "#61d7ff", price: 1700, style: "oceano", colors: ["#031321", "#07506a", "#020a1c"], headerColors: ["#06334b", "#087a91", "#09243c"], lineColor: "#087a91", accent: "#75e5ff" },
  floresta: { name: "Floresta Encantada", emoji: "🌿", rarity: "Épico", rarityColor: "#8af0a3", price: 2400, style: "floresta", colors: ["#06150e", "#123c2b", "#06130e"], headerColors: ["#0e2b1e", "#1f5a3b", "#0c2419"], lineColor: "#24764b", accent: "#8af0a3" },
  galaxia: { name: "Galáxia Violeta", emoji: "🪐", rarity: "Épico", rarityColor: "#c79aff", price: 3100, style: "galaxia", colors: ["#0b0719", "#1a1030", "#080d1c"], headerColors: ["#25103c", "#41245d", "#1a1236"], lineColor: "#653f9e", accent: "#c2a1ff" },
  sakura: { name: "Jardim de Sakura", emoji: "🌸", rarity: "Épico", rarityColor: "#ffadd5", price: 3900, style: "sakura", colors: ["#1b0a1a", "#42203a", "#100918"], headerColors: ["#401b35", "#79375e", "#251326"], lineColor: "#a44d80", accent: "#ffadd5" },
  inferno: { name: "Horizonte Carmesim", emoji: "🔥", rarity: "Lendário", rarityColor: "#ffad4d", price: 4800, style: "inferno", colors: ["#10070d", "#2b1019", "#0b0917"], headerColors: ["#43141d", "#662324", "#2b1226"], lineColor: "#9b3b2e", accent: "#ffb45f" },
  nether: { name: "Portal do Nether", emoji: "🟥", rarity: "Lendário", rarityColor: "#ff827c", price: 7600, style: "nether", colors: ["#18060b", "#4d111a", "#10050c"], headerColors: ["#3a0a12", "#7a1d25", "#260914"], lineColor: "#b83c43", accent: "#ff756e" },
  eclipse: { name: "Eclipse Absoluto", emoji: "🌑", rarity: "Mítico", rarityColor: "#ff72cb", price: 12000, style: "eclipse", colors: ["#080711", "#1b1029", "#060914"], headerColors: ["#20102d", "#39204c", "#100e26"], lineColor: "#87438f", accent: "#e99bea" }
};

const insigniaCatalog = {
  dono: { name: "Dono", shortName: "Dono", color: "#ffd166", desc: "Insígnia exclusiva do dono." },
  fundador: { name: "Fundador", shortName: "Fundador", color: "#ffad4d", desc: "Fundou o YSIS MC." },
  pioneiro: { name: "Pioneiro", shortName: "Pioneiro", color: "#66d9ef", desc: "Esteve entre os primeiros membros." },
  beta: { name: "Beta Tester", shortName: "Beta", color: "#b9a0ff", desc: "Participou dos testes." },
  lendario: { name: "Lendário", shortName: "Lendário", color: "#ff6b8a", desc: "Uma insígnia de prestígio." },
  colecionador: { name: "Colecionador", shortName: "Colecionador", color: "#67e8a5", desc: "Destaque entre os colecionadores." }
};

const petCatalog = {
  cachorro: { name: "Cachorrinho Dourado", emoji: "🐶", rarity: "Comum", color: "#f2ac58", dark: "#4b1c18", accessories: [] },
  gato: { name: "Gato Estelar", emoji: "🐱", rarity: "Comum", color: "#b9c8dd", dark: "#54657c", accessories: ["laco_gato", "guizo_gato"] },
  raposa: { name: "Raposa Astral", emoji: "🦊", rarity: "Comum", color: "#f29a4a", dark: "#a94e27", accessories: ["cachecol_raposa", "oculos_raposa"] },
  tartaruga: { name: "Tartaruga Jardineira", emoji: "🐢", rarity: "Comum", color: "#80c987", dark: "#356b4c", accessories: ["chapeu_tartaruga", "concha_tartaruga"] },
  abelha: { name: "Abelha de Mel", emoji: "🐝", rarity: "Comum", color: "#f8d34e", dark: "#573e23", accessories: ["laco_abelha", "aura_abelha"] },
  panda: { name: "Panda de Bambu", emoji: "🐼", rarity: "Raro", color: "#edf1f7", dark: "#263243", accessories: ["chapeu_panda", "mochila_panda"] },
  lobo: { name: "Lobo Lunar", emoji: "🐺", rarity: "Raro", color: "#8fa7c7", dark: "#34465e", accessories: ["bandana_lobo", "colar_lobo"] },
  coruja: { name: "Coruja Sábia", emoji: "🦉", rarity: "Raro", color: "#bd9b77", dark: "#60452f", accessories: ["oculos_coruja", "coroa_coruja"] },
  guaxinim: { name: "Guaxinim Ladino", emoji: "🦝", rarity: "Raro", color: "#aab4c0", dark: "#35404e", accessories: ["mascara_guaxinim", "cachecol_guaxinim"] },
  axolote: { name: "Axolote Coral", emoji: "🩷", rarity: "Épico", color: "#f39abf", dark: "#be5687", accessories: ["coroa_axolote", "bolhas_axolote"] },
  slime: { name: "Slime Gelatinoso", emoji: "🟢", rarity: "Épico", color: "#72e69a", dark: "#24734e", accessories: ["bolhas_slime", "aura_slime"] },
  dragao: { name: "Dragão Prisma", emoji: "🐉", rarity: "Lendário", color: "#8cda9a", dark: "#277b58", accessories: ["chifres_dragao", "asas_dragao"] },
  unicornio: { name: "Unicórnio Celeste", emoji: "🦄", rarity: "Lendário", color: "#e7c1ff", dark: "#8f63bc", accessories: ["coroa_unicornio", "aura_unicornio"] },
  fenix: { name: "Fénix Solar", emoji: "🔥", rarity: "Mítico", color: "#ffb14e", dark: "#b94732", accessories: ["coroa_fenix", "aura_fenix"] },
  kitsune: { name: "Kitsune das Nove Luas", emoji: "🦊", rarity: "Mítico", color: "#f4e2d0", dark: "#8b5348", accessories: ["laco_kitsune", "aura_kitsune"] }
};

const petBoxCatalog = {
  basica: { name: "Caixa de Pet Básica", price: 700, emoji: "📦", drops: { Comum: 65, Raro: 25, Épico: 8, Lendário: 2, Mítico: 0 } },
  rara: { name: "Caixa de Pet Rara", price: 1500, emoji: "🎁", drops: { Comum: 15, Raro: 55, Épico: 23, Lendário: 6, Mítico: 1 } },
  mistica: { name: "Caixa de Pet Mística", price: 3800, emoji: "🌌", drops: { Comum: 0, Raro: 10, Épico: 40, Lendário: 35, Mítico: 15 } }
};

const petAccessoryCatalog = {
  laco_gato: { name: "Laço Nebuloso", petId: "gato", price: 350, kind: "bow", color: "#d78cff" },
  guizo_gato: { name: "Guizo Dourado", petId: "gato", price: 500, kind: "bell", color: "#ffd166" },
  cachecol_raposa: { name: "Cachecol Aurora", petId: "raposa", price: 450, kind: "scarf", color: "#4de2b4" },
  oculos_raposa: { name: "Óculos Neon", petId: "raposa", price: 600, kind: "glasses", color: "#66eaff" },
  chapeu_panda: { name: "Chapéu de Bambu", petId: "panda", price: 400, kind: "hat", color: "#80bb73" },
  mochila_panda: { name: "Mochila de Bambu", petId: "panda", price: 550, kind: "bag", color: "#8a6846" },
  bandana_lobo: { name: "Bandana Lunar", petId: "lobo", price: 500, kind: "scarf", color: "#7ca4ff" },
  colar_lobo: { name: "Colar da Lua", petId: "lobo", price: 750, kind: "collar", color: "#e3eaff" },
  coroa_axolote: { name: "Coroa de Coral", petId: "axolote", price: 900, kind: "crown", color: "#ffcf69" },
  bolhas_axolote: { name: "Bolhas Mágicas", petId: "axolote", price: 650, kind: "bubbles", color: "#93eaff" },
  chifres_dragao: { name: "Chifres de Cristal", petId: "dragao", price: 1100, kind: "horns", color: "#b5a2ff" },
  asas_dragao: { name: "Asas Prisma", petId: "dragao", price: 1500, kind: "wings", color: "#9af5c8" },
  coroa_fenix: { name: "Coroa Solar", petId: "fenix", price: 1800, kind: "crown", color: "#ffdf71" },
  aura_fenix: { name: "Aura Flamejante", petId: "fenix", price: 2200, kind: "aura", color: "#ff7c55" },
  chapeu_tartaruga: { name: "Chapéu de Explorador", petId: "tartaruga", price: 380, kind: "hat", color: "#c89a5b" },
  concha_tartaruga: { name: "Concha Esmeralda", petId: "tartaruga", price: 650, kind: "aura", color: "#7ee5a0" },
  laco_abelha: { name: "Laço de Mel", petId: "abelha", price: 420, kind: "bow", color: "#ff9c45" },
  aura_abelha: { name: "Brilho Dourado", petId: "abelha", price: 700, kind: "aura", color: "#ffdf71" },
  oculos_coruja: { name: "Óculos de Bibliotecária", petId: "coruja", price: 520, kind: "glasses", color: "#e6d7b2" },
  coroa_coruja: { name: "Coroa do Saber", petId: "coruja", price: 780, kind: "crown", color: "#ffd166" },
  mascara_guaxinim: { name: "Máscara Sombria", petId: "guaxinim", price: 560, kind: "glasses", color: "#252c3a" },
  cachecol_guaxinim: { name: "Cachecol Listrado", petId: "guaxinim", price: 720, kind: "scarf", color: "#b5c8dc" },
  bolhas_slime: { name: "Bolhas Gelatinosas", petId: "slime", price: 600, kind: "bubbles", color: "#b4ffd0" },
  aura_slime: { name: "Aura de Slime", petId: "slime", price: 850, kind: "aura", color: "#78ffc0" },
  coroa_unicornio: { name: "Coroa Estelar", petId: "unicornio", price: 1450, kind: "crown", color: "#ffdbf4" },
  aura_unicornio: { name: "Aura Celeste", petId: "unicornio", price: 1850, kind: "aura", color: "#b7d9ff" },
  laco_kitsune: { name: "Laço das Nove Luas", petId: "kitsune", price: 1750, kind: "bow", color: "#f9a7d0" },
  aura_kitsune: { name: "Aura da Raposa Lunar", petId: "kitsune", price: 2600, kind: "aura", color: "#caa7ff" }
};

function drawPetBadge(ctx, petId, x, y, size, accessoryId = null) {
  const pet = petCatalog[petId];
  if (!pet) return;
  const a = size / 50;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(a, a);
  ctx.lineJoin = "round";
  ctx.lineCap = "round";

  // O cachorrinho inicial usa a ilustração da referência, recortada com transparência.
  const suppliedSprite = profileArtCache.pets?.[petId];
  if (petId === "cachorro" && suppliedSprite) {
    ctx.drawImage(suppliedSprite, -30, -36, 60, 72);
    ctx.restore();
    return;
  }

  const ink = pet.dark || "#49312f";
  const fur = pet.color || "#d8b184";
  const cream = ["gato", "raposa", "lobo", "guaxinim", "panda", "coruja", "unicornio", "kitsune"].includes(petId) ? "#fff0dc" : "#e8f7e4";
  const outlined = (draw) => { draw(); ctx.strokeStyle = ink; ctx.lineWidth = 2.5; ctx.stroke(); };
  const ellipse = (px, py, rx, ry, fill, line = true) => {
    ctx.beginPath(); ctx.ellipse(px, py, rx, ry, 0, 0, Math.PI * 2);
    ctx.fillStyle = fill; ctx.fill();
    if (line) { ctx.strokeStyle = ink; ctx.lineWidth = 2.2; ctx.stroke(); }
  };
  const shape = (points, fill, line = true) => {
    ctx.beginPath(); ctx.moveTo(points[0][0], points[0][1]);
    for (let i = 1; i < points.length; i++) ctx.lineTo(points[i][0], points[i][1]);
    ctx.closePath(); ctx.fillStyle = fill; ctx.fill();
    if (line) { ctx.strokeStyle = ink; ctx.lineWidth = 2.2; ctx.stroke(); }
  };

  // Sombra curta e corpo arredondado deixam os pets com aspecto de adesivo/cartoon.
  ellipse(0, 30, 27, 5, "rgba(0,0,0,0.23)", false);

  if (petId === "raposa" || petId === "lobo" || petId === "kitsune") {
    ctx.save(); ctx.translate(18, 15); ctx.rotate(-0.45);
    ellipse(0, 0, petId === "kitsune" ? 9 : 7, petId === "kitsune" ? 24 : 18, fur, true);
    ellipse(0, -13, 5, 8, cream, false); ctx.restore();
  }
  if (petId === "tartaruga") {
    ellipse(0, 12, 26, 20, pet.dark, true);
    ellipse(0, 10, 22, 16, fur, true);
    ctx.strokeStyle = ink; ctx.lineWidth = 1.8;
    ctx.beginPath(); ctx.moveTo(0, -5); ctx.lineTo(0, 26); ctx.moveTo(-20, 10); ctx.lineTo(20, 10); ctx.stroke();
    ellipse(-20, 24, 7, 8, fur, true); ellipse(20, 24, 7, 8, fur, true);
    ellipse(0, -7, 17, 17, fur, true);
  } else if (petId === "abelha") {
    ctx.save(); ctx.globalAlpha = 0.8;
    ellipse(-16, -12, 11, 7, "#c9efff", true); ellipse(16, -12, 11, 7, "#c9efff", true);
    ctx.restore();
    ellipse(0, 14, 17, 19, fur, true);
    ellipse(0, -7, 16, 15, fur, true);
    ctx.save(); ctx.beginPath(); ctx.ellipse(0, 14, 16, 18, 0, 0, Math.PI * 2); ctx.clip();
    ctx.fillStyle = ink; ctx.fillRect(-20, 11, 40, 5); ctx.fillRect(-20, 22, 40, 5); ctx.restore();
  } else {
    // Patinhas e peito aparecem por baixo da cabeça, como no desenho de referência.
    ellipse(-12, 24, 8, 8, fur, true); ellipse(12, 24, 8, 8, fur, true);
    ellipse(0, 13, 20, 18, fur, true);
    ellipse(0, 15, 11, 12, cream, false);
  }

  // Orelhas diferentes por espécie, sempre arredondadas e com traço grosso.
  if (["gato", "raposa", "panda", "lobo", "guaxinim"].includes(petId)) {
    shape([[-21,-9],[-23,-29],[-7,-19]], fur);
    shape([[21,-9],[23,-29],[7,-19]], fur);
    shape([[-19,-15],[-20,-24],[-12,-19]], petId === "panda" ? "#39414b" : "#eaa4a9", false);
    shape([[19,-15],[20,-24],[12,-19]], petId === "panda" ? "#39414b" : "#eaa4a9", false);
  } else if (petId === "coruja") {
    shape([[-18,-15],[-23,-29],[-8,-22]], fur);
    shape([[18,-15],[23,-29],[8,-22]], fur);
  } else if (petId === "unicornio") {
    shape([[-19,-11],[-22,-25],[-7,-19]], fur);
    shape([[19,-11],[22,-25],[7,-19]], fur);
    shape([[-3,-20],[0,-38],[4,-20]], "#ffe69a");
  } else if (petId === "dragao" || petId === "fenix") {
    shape([[-15,-13],[-21,-32],[-5,-22]], pet.dark);
    shape([[15,-13],[21,-32],[5,-22]], pet.dark);
  } else if (petId === "axolote") {
    for (const side of [-1, 1]) {
      for (let k = 0; k < 3; k++) {
        ctx.beginPath(); ctx.ellipse(side * (21 + k * 2), -5 + k * 5, 4, 7, side * 0.4, 0, Math.PI * 2);
        ctx.fillStyle = pet.color; ctx.fill(); ctx.strokeStyle = ink; ctx.lineWidth = 1.4; ctx.stroke();
      }
    }
  }

  if (petId !== "tartaruga" && petId !== "abelha") {
    // Cabeça grande, bochechas e focinho claro para combinar com o estilo fofinho da imagem.
    ellipse(0, -5, 25, 23, fur, true);
    if (petId === "panda") {
      ellipse(-11, -7, 8, 10, ink, false); ellipse(11, -7, 8, 10, ink, false);
    } else if (petId === "guaxinim") {
      shape([[-21,-10],[-7,-14],[0,-6],[7,-14],[21,-10],[14,1],[0,3],[-14,1]], ink, false);
    } else if (petId === "coruja") {
      ellipse(-10, -5, 11, 12, cream, false); ellipse(10, -5, 11, 12, cream, false);
    } else if (petId === "slime") {
      ellipse(0, 1, 24, 20, fur, true);
    }
    ellipse(0, 5, 14, 10, cream, false);

    // Olhões brilhantes: contorno escuro, íris clara e reflexo branco.
    for (const side of [-1, 1]) {
      ellipse(side * 10, -6, 7.2, 8.5, ink, false);
      ellipse(side * 10 + 1, -7.5, 4.6, 5.3, "#ffffff", false);
      ellipse(side * 10 - 1.8, -10.4, 1.6, 1.9, "#ffffff", false);
      ellipse(side * 18, 4, 3.1, 2.1, "rgba(248,126,145,0.72)", false);
    }
    ellipse(0, 4, 4.4, 3.2, ink, false);
    ctx.strokeStyle = ink; ctx.lineWidth = 1.8;
    ctx.beginPath(); ctx.moveTo(0, 7); ctx.lineTo(0, 10); ctx.quadraticCurveTo(-4, 13, -7, 9);
    ctx.moveTo(0, 10); ctx.quadraticCurveTo(4, 13, 7, 9); ctx.stroke();
  } else if (petId === "tartaruga" || petId === "abelha") {
    for (const side of [-1, 1]) {
      ellipse(side * 7, -8, 5.2, 6.5, ink, false);
      ellipse(side * 7 + 0.8, -9.3, 3.1, 3.9, "#ffffff", false);
      ellipse(side * 14, 1, 2.5, 1.6, "rgba(248,126,145,0.72)", false);
    }
    ellipse(0, 1, 3.5, 2.6, ink, false);
    ctx.strokeStyle = ink; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(0, 4); ctx.quadraticCurveTo(-3, 7, -5, 4); ctx.moveTo(0, 4); ctx.quadraticCurveTo(3, 7, 5, 4); ctx.stroke();
  }

  // Acessórios permanecem compatíveis com o catálogo já existente.
  const accessory = accessoryId ? petAccessoryCatalog[accessoryId] : null;
  if (accessory && accessory.petId === petId) {
    ctx.fillStyle = accessory.color;
    switch (accessory.kind) {
      case "bow": ctx.beginPath(); ctx.arc(-4, -24, 5, 0, Math.PI * 2); ctx.arc(5, -24, 5, 0, Math.PI * 2); ctx.fillRect(-2, -27, 5, 6); ctx.fill(); break;
      case "bell": ctx.beginPath(); ctx.arc(0, 20, 5, 0, Math.PI * 2); ctx.fill(); break;
      case "scarf": case "collar": ctx.fillRect(-21, 15, 42, 6); break;
      case "glasses": ctx.fillRect(-21, -7, 18, 6); ctx.fillRect(3, -7, 18, 6); ctx.fillRect(-3, -5, 6, 2); break;
      case "hat": ctx.fillRect(-20, -29, 40, 5); ctx.fillRect(-13, -40, 26, 13); break;
      case "bag": ctx.fillRect(17, 3, 8, 14); break;
      case "crown": ctx.beginPath(); ctx.moveTo(-17, -22); ctx.lineTo(-17, -34); ctx.lineTo(-7, -27); ctx.lineTo(0, -36); ctx.lineTo(8, -27); ctx.lineTo(17, -34); ctx.lineTo(17, -22); ctx.closePath(); ctx.fill(); break;
      case "bubbles": for (let k = 0; k < 3; k++) { ctx.beginPath(); ctx.arc(22 + k * 3, -20 - k * 8, 3 + k, 0, Math.PI * 2); ctx.strokeStyle = accessory.color; ctx.stroke(); } break;
      case "horns": ctx.beginPath(); ctx.moveTo(-13, -17); ctx.lineTo(-18, -32); ctx.lineTo(-6, -23); ctx.moveTo(13, -17); ctx.lineTo(18, -32); ctx.lineTo(6, -23); ctx.strokeStyle = accessory.color; ctx.lineWidth = 4; ctx.stroke(); break;
      case "wings": ctx.beginPath(); ctx.ellipse(-26, 4, 9, 15, -0.6, 0, Math.PI * 2); ctx.ellipse(26, 4, 9, 15, 0.6, 0, Math.PI * 2); ctx.fill(); break;
      case "aura": ctx.strokeStyle = accessory.color; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(0, 0, 31, 0, Math.PI * 2); ctx.stroke(); break;
    }
  }
  ctx.restore();
}

async function renderPetHouseCard(profile) {
  await ensureProfileArt();
  const W = 1000, H = 360;
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext("2d");
  const activeBanner = bannerCatalog[profile.banner] || bannerCatalog.cosmico;
  const bg = ctx.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, activeBanner.colors[0]); bg.addColorStop(0.58, activeBanner.colors[1]); bg.addColorStop(1, activeBanner.colors[2]);
  ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
  // Céu noturno, lua e estrelas discretas.
  for (let n = 0; n < 52; n++) {
    const x = (n * 173 + 21) % W, y = (n * 79 + 16) % 205;
    ctx.globalAlpha = 0.25 + (n % 4) * 0.1; ctx.fillStyle = n % 5 === 0 ? activeBanner.accent : "#eef7ff";
    ctx.beginPath(); ctx.arc(x, y, n % 6 === 0 ? 1.8 : 1, 0, Math.PI * 2); ctx.fill();
  }
  ctx.globalAlpha = 1;
  const moon = ctx.createRadialGradient(870, 65, 3, 870, 65, 72);
  moon.addColorStop(0, "rgba(142,216,255,0.24)"); moon.addColorStop(1, "rgba(142,216,255,0)");
  ctx.fillStyle = moon; ctx.fillRect(790, 0, 160, 145);
  ctx.fillStyle = activeBanner.accent; ctx.globalAlpha = 0.75; ctx.beginPath(); ctx.arc(870, 60, 19, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 1;
  // Base e casinha arredondada.
  ctx.fillStyle = "#0a1926"; ctx.beginPath(); ctx.ellipse(500, 334, 455, 42, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = "rgba(19,48,68,0.94)"; ctx.beginPath(); ctx.roundRect(25, 116, 950, 218, 24); ctx.fill();
  ctx.strokeStyle = activeBanner.accent + "75"; ctx.lineWidth = 2; ctx.beginPath(); ctx.roundRect(25, 116, 950, 218, 24); ctx.stroke();
  ctx.fillStyle = "#19364b"; ctx.beginPath(); ctx.moveTo(35, 145); ctx.lineTo(100, 60); ctx.lineTo(165, 145); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = "#5fa2cb"; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(35, 145); ctx.lineTo(100, 60); ctx.lineTo(165, 145); ctx.stroke();
  ctx.fillStyle = "#d8f0ff"; ctx.font = `bold 18px ${FONT_BOLD}`; ctx.fillText("CASINHA DOS PETS", 178, 84);
  ctx.fillStyle = "#95bcd4"; ctx.font = `14px ${FONT}`; ctx.fillText("Seu cantinho para cuidar dos companheiros", 178, 105);

  const pets = (profile.ownedPets || []).filter(id => petCatalog[id]).slice(0, 8);
  if (!pets.length) {
    // Área vazia intencionalmente: o botão de desbloqueio aparece no Discord.
    ctx.fillStyle = "rgba(4,14,26,0.58)"; ctx.beginPath(); ctx.roundRect(200, 151, 600, 153, 18); ctx.fill();
    ctx.strokeStyle = "rgba(127,183,220,0.38)"; ctx.setLineDash([7, 7]); ctx.beginPath(); ctx.roundRect(200, 151, 600, 153, 18); ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle = "#7d9fb8"; ctx.font = `bold 21px ${FONT_BOLD}`; ctx.textAlign = "center"; ctx.fillText("A casinha está vazia...", 500, 220);
    ctx.font = `15px ${FONT}`; ctx.fillStyle = "#b3cbdc";
    ctx.fillText(profile.starterPetClaimed ? "Use /lojapets para conseguir novos companheiros." : "Desbloqueie seu presente inicial: um pet e uma loot box básica!", 500, 249);
    ctx.textAlign = "left";
    // Pequeno baú fechado na entrada.
    ctx.fillStyle = "#7e593d"; ctx.beginPath(); ctx.roundRect(465, 267, 70, 28, 6); ctx.fill();
    ctx.fillStyle = "#bd925d"; ctx.fillRect(465, 267, 70, 7); ctx.fillStyle = "#f4d18b"; ctx.fillRect(496, 273, 9, 11);
  } else {
    const count = pets.length, cardW = Math.min(122, 890 / count), startX = 500 - (cardW * count + (count - 1) * 9) / 2;
    pets.forEach((petId, index) => {
      const x = startX + index * (cardW + 9), active = profile.activePet === petId;
      const state = profile.pets?.[petId] || {};
      ctx.fillStyle = active ? "rgba(31,79,105,0.93)" : "rgba(7,20,34,0.7)";
      ctx.beginPath(); ctx.roundRect(x, 143, cardW, 167, 15); ctx.fill();
      ctx.strokeStyle = active ? "#7edcff" : "rgba(102,155,192,0.38)"; ctx.lineWidth = active ? 2.2 : 1; ctx.beginPath(); ctx.roundRect(x, 143, cardW, 167, 15); ctx.stroke();
      drawPetBadge(ctx, petId, x + cardW / 2, 192, 48, state.accessory || null);
      ctx.textAlign = "center"; ctx.fillStyle = "#eff8ff"; ctx.font = `bold ${count > 6 ? 10 : 11}px ${FONT_BOLD}`;
      const label = petCatalog[petId].name;
      ctx.fillText(label.length > 18 ? label.slice(0, 17) + "…" : label, x + cardW / 2, 235);
      ctx.fillStyle = "#98c2db"; ctx.font = `10px ${FONT}`; ctx.fillText(petCatalog[petId].rarity, x + cardW / 2, 252);
      const hearts = Math.max(0, Math.min(10, Number(state.hearts || 0)));
      ctx.fillStyle = "#ff8ba5"; ctx.font = "12px sans-serif"; ctx.fillText(`${"♥".repeat(Math.min(hearts, 5)) || "♡"} ${hearts}/10`, x + cardW / 2, 274);
      if (active) { ctx.fillStyle = "#7edcff"; ctx.font = `bold 9px ${FONT_BOLD}`; ctx.fillText("ATIVO", x + cardW / 2, 293); }
      ctx.textAlign = "left";
    });
    if (profile.ownedPets.length > pets.length) { ctx.fillStyle = "#9ec8e5"; ctx.font = `12px ${FONT}`; ctx.fillText(`+ ${profile.ownedPets.length - pets.length} pets na coleção`, 42, 323); }
  }
  return canvas.toBuffer("image/png");
}

function drawOsakaPortrait(ctx, x, y, scale = 1) {
  ctx.save(); ctx.translate(x, y); ctx.scale(scale, scale);
  // Uniforme escolar azul e gola de marinheira.
  ctx.fillStyle = "#243d68"; ctx.beginPath(); ctx.moveTo(-53, 91); ctx.quadraticCurveTo(-48, 43, -20, 35); ctx.lineTo(20, 35); ctx.quadraticCurveTo(48, 43, 53, 91); ctx.closePath(); ctx.fill();
  ctx.fillStyle = "#f7f4ec"; ctx.beginPath(); ctx.moveTo(-27, 39); ctx.lineTo(0, 67); ctx.lineTo(27, 39); ctx.lineTo(17, 32); ctx.lineTo(-17, 32); ctx.closePath(); ctx.fill();
  ctx.fillStyle = "#d85567"; ctx.beginPath(); ctx.moveTo(-9, 41); ctx.lineTo(0, 48); ctx.lineTo(9, 41); ctx.lineTo(5, 57); ctx.lineTo(0, 61); ctx.lineTo(-5, 57); ctx.closePath(); ctx.fill();
  // Cabelo comprido castanho, rosto e franja desenhados em traço simples.
  const hair = ctx.createLinearGradient(-45, -64, 48, 75); hair.addColorStop(0, "#5a392e"); hair.addColorStop(1, "#2f211f");
  ctx.fillStyle = hair; ctx.beginPath(); ctx.ellipse(0, -14, 51, 64, 0, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.roundRect(-46, -25, 18, 91, 9); ctx.roundRect(28, -25, 18, 91, 9); ctx.fill();
  ctx.fillStyle = "#f2c6a4"; ctx.beginPath(); ctx.ellipse(0, -10, 36, 44, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = hair; ctx.beginPath(); ctx.moveTo(-38, -21); ctx.quadraticCurveTo(-29, -58, 0, -53); ctx.quadraticCurveTo(29, -58, 38, -20); ctx.lineTo(25, -7); ctx.lineTo(12, -24); ctx.lineTo(2, -7); ctx.lineTo(-9, -24); ctx.lineTo(-24, -6); ctx.closePath(); ctx.fill();
  // Olhar tranquilo e um sorriso discreto, para a personagem ficar reconhecível como Osaka.
  ctx.strokeStyle = "#3a2925"; ctx.lineWidth = 2.7; ctx.lineCap = "round";
  ctx.beginPath(); ctx.moveTo(-22, -9); ctx.quadraticCurveTo(-15, -14, -8, -9); ctx.moveTo(8, -9); ctx.quadraticCurveTo(15, -14, 22, -9); ctx.stroke();
  ctx.fillStyle = "#3e2a26"; ctx.beginPath(); ctx.ellipse(-15, -5, 3.2, 4.2, 0, 0, Math.PI * 2); ctx.ellipse(15, -5, 3.2, 4.2, 0, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = "#a85d59"; ctx.lineWidth = 1.8; ctx.beginPath(); ctx.moveTo(-5, 13); ctx.quadraticCurveTo(0, 16, 5, 13); ctx.stroke();
  ctx.fillStyle = "rgba(235,131,133,0.42)"; ctx.beginPath(); ctx.ellipse(-24, 10, 6, 3, 0, 0, Math.PI * 2); ctx.ellipse(24, 10, 6, 3, 0, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

function renderTransferBill({ senderName, recipientName, amount, currency, currencyEmoji = "🪙" }) {
  const W = 1100, H = 430;
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext("2d");
  const clean = value => String(value || "Jogador").replace(/[\r\n]+/g, " ").slice(0, 22);
  const amountText = `${fmt(amount)} ${String(currency || "moedas").slice(0, 12)}`;
  const bg = ctx.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, "#d9f5df"); bg.addColorStop(0.48, "#a8d9bd"); bg.addColorStop(1, "#d4eed8");
  ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
  ctx.save(); ctx.beginPath(); ctx.roundRect(12, 12, W - 24, H - 24, 26); ctx.clip();
  ctx.strokeStyle = "rgba(23,104,69,0.12)"; ctx.lineWidth = 1;
  for (let x = -H; x < W + H; x += 22) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x + H, H); ctx.stroke(); }
  for (let x = 36; x < W; x += 90) for (let y = 35; y < H; y += 90) {
    ctx.strokeStyle = "rgba(23,104,69,0.10)"; ctx.beginPath(); ctx.arc(x, y, 23, 0, Math.PI * 2); ctx.stroke();
  }
  ctx.restore();
  ctx.strokeStyle = "#246e4f"; ctx.lineWidth = 5; ctx.beginPath(); ctx.roundRect(12, 12, W - 24, H - 24, 26); ctx.stroke();
  ctx.strokeStyle = "rgba(36,110,79,0.7)"; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.roundRect(26, 26, W - 52, H - 52, 20); ctx.stroke();

  ctx.fillStyle = "#174e3a"; ctx.font = `bold 20px ${FONT_BOLD}`; ctx.fillText("YSIS MC • BANCO DIGITAL", 48, 65);
  ctx.fillStyle = "#387c5b"; ctx.font = `bold 11px ${FONT_BOLD}`; ctx.fillText("CÉDULA COMEMORATIVA DE TRANSFERÊNCIA", 50, 86);
  ctx.textAlign = "right"; ctx.fillStyle = "#174e3a"; ctx.font = `bold 15px ${FONT_BOLD}`; ctx.fillText("Nº " + Date.now().toString().slice(-8), 1050, 62); ctx.textAlign = "left";

  // Valor e nomes ficam em áreas próprias para não encostar no retrato.
  ctx.fillStyle = "#236c4e"; ctx.font = `bold 13px ${FONT_BOLD}`; ctx.fillText("VALOR TRANSFERIDO", 54, 151);
  ctx.fillStyle = "#174e3a"; ctx.font = `bold 34px ${FONT_BOLD}`; ctx.fillText(`${currencyEmoji} ${fmt(amount)}`, 50, 195);
  ctx.fillStyle = "#387c5b"; ctx.font = `bold 15px ${FONT_BOLD}`; ctx.fillText(String(currency || "moedas").toUpperCase().slice(0, 18), 54, 220);
  ctx.fillStyle = "#174e3a"; ctx.font = `bold 13px ${FONT_BOLD}`; ctx.fillText("DE", 54, 274);
  ctx.fillStyle = "#2b684d"; ctx.font = `bold 17px ${FONT_BOLD}`; ctx.fillText(clean(senderName), 54, 298);
  ctx.fillStyle = "#174e3a"; ctx.font = `bold 13px ${FONT_BOLD}`; ctx.fillText("PARA", 54, 335);
  ctx.fillStyle = "#2b684d"; ctx.font = `bold 17px ${FONT_BOLD}`; ctx.fillText(clean(recipientName), 54, 359);

  // Medalhão central com retrato original desenhado no Canvas, sem arquivos externos.
  const seal = ctx.createLinearGradient(430, 115, 700, 315); seal.addColorStop(0, "#f6ffed"); seal.addColorStop(1, "#a4d8b7");
  ctx.fillStyle = seal; ctx.beginPath(); ctx.ellipse(560, 224, 112, 145, 0, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = "#3a8d65"; ctx.lineWidth = 3; ctx.beginPath(); ctx.ellipse(560, 224, 101, 133, 0, 0, Math.PI * 2); ctx.stroke();
  ctx.save(); ctx.beginPath(); ctx.ellipse(560, 222, 94, 124, 0, 0, Math.PI * 2); ctx.clip();
  ctx.fillStyle = "#c9ecd2"; ctx.fillRect(462, 96, 196, 260);
  drawOsakaPortrait(ctx, 560, 218, 1.06);
  ctx.restore();
  ctx.textAlign = "center"; ctx.fillStyle = "#174e3a"; ctx.font = `bold 24px ${FONT_BOLD}`; ctx.fillText("OSAKA", 560, 387);
  ctx.fillStyle = "#387c5b"; ctx.font = `bold 10px ${FONT_BOLD}`; ctx.fillText("YSIS MC • 2026", 560, 402); ctx.textAlign = "left";

  // Painel de autenticação à direita.
  ctx.fillStyle = "rgba(242,255,241,0.7)"; ctx.beginPath(); ctx.roundRect(735, 118, 315, 226, 18); ctx.fill();
  ctx.strokeStyle = "rgba(36,110,79,0.55)"; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.roundRect(735, 118, 315, 226, 18); ctx.stroke();
  ctx.fillStyle = "#236c4e"; ctx.font = `bold 13px ${FONT_BOLD}`; ctx.fillText("STATUS DA OPERAÇÃO", 758, 151);
  ctx.fillStyle = "#1b8b52"; ctx.font = `bold 24px ${FONT_BOLD}`; ctx.fillText("✓ APROVADA", 758, 186);
  ctx.fillStyle = "#174e3a"; ctx.font = `bold 12px ${FONT_BOLD}`; ctx.fillText("DESTINATÁRIO", 758, 225);
  ctx.fillStyle = "#2b684d"; ctx.font = `bold 18px ${FONT_BOLD}`; ctx.fillText(clean(recipientName), 758, 249);
  ctx.fillStyle = "#174e3a"; ctx.font = `bold 12px ${FONT_BOLD}`; ctx.fillText("PROCESSADA EM", 758, 284);
  ctx.fillStyle = "#2b684d"; ctx.font = `14px ${FONT}`; ctx.fillText(new Date().toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Fortaleza" }), 758, 307);
  ctx.fillStyle = "rgba(23,78,58,0.75)"; ctx.font = `bold 10px ${FONT_BOLD}`; ctx.fillText("ESTA CÉDULA É UMA COMPROVAÇÃO VIRTUAL", 50, 405);
  return canvas.toBuffer("image/png");
}

function buildPetHouseEmbed(profile, note = "") {
  const pets = (profile.ownedPets || []).filter(id => petCatalog[id]);
  const activeId = profile.activePet && pets.includes(profile.activePet) ? profile.activePet : pets[0];
  let description;
  if (!pets.length) {
    description = profile.starterPetClaimed
      ? "A casinha está vazia por enquanto. 🔒\n\nUsa `/lojapets` para comprar uma caixa e `/abrirlootboxpet` para conseguir um companheiro."
      : "Seu primeiro companheiro está à espera! 🐾\n\nClique em **Desbloquear pet** para receber gratuitamente um **Cachorrinho Dourado** e uma **Caixa de Pet Básica**. A recompensa inicial só pode ser resgatada uma vez.";
  } else {
    description = pets.map(id => {
      const pet = petCatalog[id], state = profile.pets?.[id] || {};
      const hearts = Math.max(0, Math.min(10, Number(state.hearts || 0)));
      const level = Math.floor(Math.max(0, Number(state.xp || 0)) / 100) + 1;
      const accessory = state.accessory && petAccessoryCatalog[state.accessory];
      return `${id === activeId ? "🔹" : "▫️"} **${pet.emoji || "🐾"} ${pet.name}** · ${pet.rarity}${id === activeId ? " — **selecionado**" : ""}\n❤️ ${hearts}/10 corações · Vínculo nível ${level}${accessory ? ` · 🎀 ${accessory.name}` : ""}`;
    }).join("\n\n");
    description += "\n\nEscolhe um pet no menu e usa **Alimentar** ou **Brincar**. Alimentar custa 50 moedas e tem intervalo de 4 horas; brincar tem intervalo de 1 hora.";
  }
  if (note) description = `${note}\n\n${description}`;
  return em("🏡 Sua casinha de pets", description, 0x4d91bd).setImage("attachment://ysis-casinha-pets.png");
}

function petHouseComponents(ownerId, profile) {
  const rows = [];
  const pets = (profile.ownedPets || []).filter(id => petCatalog[id]).slice(0, 25);
  const basicBoxes = Math.max(0, Number(profile.petBoxes?.basica || 0));
  if (pets.length) {
    const select = new StringSelectMenuBuilder()
      .setCustomId(`ysispet:select:${ownerId}`)
      .setPlaceholder("Escolha um pet da sua coleção")
      .addOptions(pets.map(id => ({
        label: `${petCatalog[id].emoji || "🐾"} ${petCatalog[id].name}`.slice(0, 100),
        description: `${petCatalog[id].rarity} · ${Math.max(0, Math.min(10, Number(profile.pets?.[id]?.hearts || 0)))}/10 corações`.slice(0, 100),
        value: id,
        default: profile.activePet === id
      })));
    rows.push(new ActionRowBuilder().addComponents(select));

    const actions = [
      new ButtonBuilder().setCustomId(`ysispet:feed:${ownerId}`).setLabel("Alimentar").setEmoji("🍖").setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId(`ysispet:play:${ownerId}`).setLabel("Brincar").setEmoji("🎾").setStyle(ButtonStyle.Success)
    ];
    if (basicBoxes > 0) {
      actions.push(new ButtonBuilder().setCustomId(`ysispet:openbox:${ownerId}:basica`).setLabel(`Abrir caixa básica (${basicBoxes})`).setEmoji("📦").setStyle(ButtonStyle.Secondary));
    }
    rows.push(new ActionRowBuilder().addComponents(actions));
  } else {
    const actions = [];
    if (!profile.starterPetClaimed) {
      actions.push(new ButtonBuilder().setCustomId(`ysispet:shop:${ownerId}`).setLabel("Desbloquear pet grátis").setEmoji("🐾").setStyle(ButtonStyle.Success));
    }
    if (basicBoxes > 0) {
      actions.push(new ButtonBuilder().setCustomId(`ysispet:openbox:${ownerId}:basica`).setLabel(`Abrir caixa básica (${basicBoxes})`).setEmoji("📦").setStyle(ButtonStyle.Secondary));
    }
    if (actions.length) rows.push(new ActionRowBuilder().addComponents(actions));
  }
  // Depois da recompensa inicial, o botão some. A loja continua em /lojapets.
  return rows;
}

function petBoxShopComponents(ownerId) {
  const keys = Object.keys(petBoxCatalog);
  const buttons = keys.map(key => {
    const box = petBoxCatalog[key];
    return new ButtonBuilder().setCustomId(`ysispet:buybox:${ownerId}:${key}`)
      .setLabel(`${box.name.replace("Caixa de Pet ", "")} • ${fmt(box.price)}`.slice(0, 80))
      .setEmoji(box.emoji).setStyle(key === "mistica" ? ButtonStyle.Danger : key === "rara" ? ButtonStyle.Primary : ButtonStyle.Secondary);
  });
  return [new ActionRowBuilder().addComponents(buttons), new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`ysispet:home:${ownerId}`).setLabel("Voltar à casinha").setEmoji("🏡").setStyle(ButtonStyle.Secondary)
  )];
}

function buildPetBoxShopEmbed(profile, guildId) {
  const description = Object.entries(petBoxCatalog).map(([key, box]) => {
    const odds = Object.entries(box.drops).filter(([, chance]) => chance > 0).map(([rarity, chance]) => `${rarity}: ${chance}%`).join(" · ");
    return `${box.emoji} **${box.name}** — ${moneyText(guildId, box.price)}\n${odds}\nVocê tem: **${profile.petBoxes?.[key] || 0}**`;
  }).join("\n\n");
  return em("🔓 Desbloquear um pet", `${description}\n\nEscolhe uma caixa abaixo. Depois podes abri-la aqui ou usar `/abrirlootboxpet`.`, 0x7d9ce8);
}

function openPetBoxForUser(profile, key) {
  const box = petBoxCatalog[key];
  if (!box) return { ok: false, message: "Caixa não encontrada." };
  if ((profile.petBoxes[key] || 0) < 1) return { ok: false, message: `Não tens uma ${box.name} guardada.` };
  profile.petBoxes[key]--;
  const roll = Math.random() * 100;
  let acc = 0, rarity = "Comum";
  for (const [r, weight] of Object.entries(box.drops)) { acc += weight; if (roll < acc) { rarity = r; break; } }
  const pool = Object.entries(petCatalog).filter(([, pet]) => pet.rarity === rarity);
  if (!pool.length) { profile.petBoxes[key]++; return { ok: false, message: "Não há pets dessa raridade configurados nesta caixa." }; }
  const [petId, pet] = pool[rand(0, pool.length - 1)];
  let duplicate = false;
  if (profile.ownedPets.includes(petId)) {
    duplicate = true;
    const state = profile.pets[petId] || (profile.pets[petId] = { hearts: 0, xp: 0, lastFeed: 0, lastPlay: 0, accessory: null });
    state.hearts = Math.min(10, (state.hearts || 0) + 2); state.xp = (state.xp || 0) + 40; profile.coins += 150;
  } else {
    profile.ownedPets.push(petId); profile.pets[petId] = { hearts: 0, xp: 0, lastFeed: 0, lastPlay: 0, accessory: null };
    if (!profile.activePet) profile.activePet = petId;
  }
  save();
  return { ok: true, petId, pet, duplicate, message: duplicate
    ? `📦 A caixa revelou **${pet.emoji || "🐾"} ${pet.name}** (${pet.rarity}), mas já o tinhas! Recebeu +2 corações, +40 XP e ganhaste 150 moedas pela duplicata.`
    : `🎉 Desbloqueaste **${pet.emoji || "🐾"} ${pet.name}**! Raridade: **${pet.rarity}**. O pet já está na tua casinha.` };
}

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
  economia: { title: "💰 Economia", intro: "Ganhe, guarde e movimente seu saldo. Os valores são salvos pelo bot.", commands: ["/daily — recompensa diária e sequência", "/trabalhar — receba pelo trabalho", "/saldo — carteira e banco", "/transferir ou /pagar — envie moedas e gere a cédula da Osaka", "/depositar — deposite no banco 🏦", "/sacar — retire do banco 💵", "/top — ranking de riqueza", "/rankxp — ranking de XP", "/cacar — caça por recompensas", "/pescar — procure recompensas", "/aventura — exploração com recompensa", "/minerar — encontre recursos", "/moeda — cara ou coroa", "/dado — role um dado"] },
  loja: { title: "🛍️ Lojas e pedidos", intro: "Use a economia para adquirir cargos e itens. Pedidos Minecraft precisam ser entregues pela equipe no jogo.", commands: ["/loja — ofertas de cargos do Discord", "/comprarcargo — compre um cargo", "/lojajogo — catálogo Minecraft", "/comprarjogo — abra um pedido de item", "/inventario — seus itens", "/vender — venda itens do inventário", "/anunciarloja — publicar no canal configurado", "/promocao — publicar promoção no canal configurado"] },
  social: { title: "🎮 Social e diversão", intro: "Comandos leves para interagir com a comunidade.", commands: ["/pergunta — consulte a bola mágica", "/ship — compatibilidade divertida", "/abracar — envie um abraço", "/beijar — mande um beijo", "/tapa — tapa de brincadeira", "/casar — peça em casamento", "/divorciar — encerre o casamento", "/rate — avaliação aleatória", "/ticket — abra atendimento privado"] },
  perfil: { title: "✨ Perfil e personalização", intro: "Personalize o cartão, colecione insígnias e cuide dos seus pets na casinha.", commands: ["/perfil — cartão personalizado com fundo, moldura e insígnias", "/conquistas — acompanhe suas conquistas", "/insignias — veja as insígnias exibidas no perfil", "/biografia — edite sua descrição", "/molduras e /comprarmoldura — coleção e loja de molduras", "/usarmoldura — selecione molduras que possui", "/fundos — veja os banners e raridades", "/comprarfundo e /usarfundo — compre/equipe banners", "/lojapets — caixas e acessórios", "/verpets — casinha interativa para cuidar dos pets", "/comprarcaixapet e /abrirlootboxpet — loot boxes", "/verpets — abra sua casinha para ver, escolher, alimentar e brincar com os pets", "/pet e /equiparpet — veja/escolha seu pet ativo", "/alimentarpet e /brincarpet — ganhe corações", "/acessoriospet — catálogo de acessórios", "/compraracessorio e /equiparacessorio — personalize o pet", "/destacarperfil — destaque por 24 horas", "/destaques — veja os perfis destacados", "/rep — dê reputação a um membro"] },
  equipe: { title: "🛡️ Painel da equipe", intro: "Os comandos do dono são exclusivos do cargo Dono. Os restantes respeitam as permissões da equipe.", commands: ["/promover — atribua um cargo autorizado", "/rebaixar — remova um cargo autorizado", "/cargo — administre cargos", "/configequipe — configure cargos de promoção/suporte", "/configmoeda — defina o nome e emoji da moeda", "/adicionarmoedas — ajuste saldo (dono)", "/removermoedas — retire saldo (dono)", "/setarmoedas — defina saldo exato (dono)", "/administrarrep — ajuste reputação (dono)", "/administrarconquista — conceda/remova conquistas (dono)", "/resetardaily — libere daily (dono)", "/administrardestaque — gerencie destaques (dono)", "/gerenciarperfil — itens, pets e insígnias (dono)", "/configcanais — selecione canais da loja/promoções", "/configurar — boas-vindas, saídas e logs", "/configloja — edite a loja de cargos", "/anunciar — anúncio geral", "/limpar — apague mensagens", "/expulsar — expulse um membro", "/banir — bane um membro", "/timeout — timeout temporário", "/avisar — registre advertência", "/avisos — consulte advertências", "/limparavisos — limpe advertências", "/lock e /unlock — bloqueie/libere um canal", "/pedidosjogo — veja pedidos pendentes", "/concluirpedido — confirme entrega", "/cancelarpedido — cancele e devolva saldo", "/dizer — envie texto como bot", "/fecharticket — feche um ticket"] }
};

function buildPanelEmbed(sectionKey, interaction) {
  const section = panelSections[sectionKey] || panelSections.geral;
  const cfg = interaction.guild ? guildConfig(interaction.guild.id) : { promotionRoles: [] };
  const member = interaction.member;
  const ownerOnlyCommands = new Set(["gerenciarperfil", "administrarrep", "administrarconquista", "resetardaily", "administrardestaque", "adicionarmoedas", "removermoedas", "setarmoedas"]);
  const visible = section.commands.filter(line => {
    const match = line.match(/^\/(\w+)/);
    if (!match) return true;
    if (ownerOnlyCommands.has(match[1])) return isOwner(interaction);
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
add(new SlashCommandBuilder().setName("molduras").setDescription("🖼️ Veja as molduras de perfil disponíveis."));
add(new SlashCommandBuilder().setName("destaques").setDescription("Veja os perfis que estão em destaque."));
add(new SlashCommandBuilder().setName("comprarmoldura").setDescription("Compre uma moldura de perfil.").addStringOption(o => o.setName("moldura").setDescription("Moldura para desbloquear").setRequired(true).addChoices(...Object.entries(frameCatalog).filter(([k]) => k !== "azul").map(([value, f]) => ({ name: `${f.emoji} ${f.name} — ${f.price} moedas`.slice(0, 100), value })))));
add(new SlashCommandBuilder().setName("usarmoldura").setDescription("Equipe uma moldura que você possui.").addStringOption(o => o.setName("moldura").setDescription("Apenas molduras do seu inventário").setAutocomplete(true).setRequired(true)));
add(new SlashCommandBuilder().setName("fundos").setDescription("🌌 Veja os fundos de perfil, raridades e preços."));
add(new SlashCommandBuilder().setName("comprarfundo").setDescription("Compre um banner animado para o perfil.").addStringOption(o => o.setName("fundo").setDescription("Banner para desbloquear").setRequired(true).addChoices(...Object.entries(bannerCatalog).filter(([key]) => key !== "cosmico").map(([value, b]) => ({ name: `${b.emoji || "🌌"} ${b.rarity} • ${b.name} — ${b.price} moedas`.slice(0, 100), value })))));
add(new SlashCommandBuilder().setName("usarfundo").setDescription("Equipe um banner que você possui.").addStringOption(o => o.setName("fundo").setDescription("Apenas banners do seu inventário").setAutocomplete(true).setRequired(true)));
add(new SlashCommandBuilder().setName("gerenciarperfil").setDescription("(Dono) Dê, retire ou equipe itens de perfil para um membro.").addStringOption(o => o.setName("acao").setDescription("Ação de administração").setRequired(true).addChoices({name:"Dar item",value:"dar"},{name:"Retirar item",value:"retirar"},{name:"Equipar item",value:"equipar"})).addStringOption(o => o.setName("tipo").setDescription("Tipo de item").setRequired(true).addChoices({name:"Moldura",value:"moldura"},{name:"Banner",value:"fundo"},{name:"Pet",value:"pet"},{name:"Acessório de pet",value:"acessorio"},{name:"Insígnia",value:"insignia"})).addUserOption(o => o.setName("usuario").setDescription("Membro alvo").setRequired(true)).addStringOption(o => o.setName("item").setDescription("Item do catálogo").setAutocomplete(true).setRequired(true)));
add(new SlashCommandBuilder().setName("administrarrep").setDescription("(Dono) Defina, adicione ou retire reputação de um membro.").addStringOption(o=>o.setName("acao").setDescription("Ação").setRequired(true).addChoices({name:"Definir",value:"definir"},{name:"Adicionar",value:"adicionar"},{name:"Retirar",value:"retirar"})).addUserOption(o=>o.setName("usuario").setDescription("Membro alvo").setRequired(true)).addIntegerOption(o=>o.setName("quantia").setDescription("Quantidade de reputação").setMinValue(0).setMaxValue(1000000).setRequired(true)));
add(new SlashCommandBuilder().setName("administrarconquista").setDescription("(Dono) Conceda ou retire uma conquista manualmente.").addStringOption(o=>o.setName("acao").setDescription("Ação").setRequired(true).addChoices({name:"Conceder",value:"dar"},{name:"Retirar",value:"retirar"})).addUserOption(o=>o.setName("usuario").setDescription("Membro alvo").setRequired(true)).addStringOption(o=>o.setName("conquista").setDescription("Conquista do catálogo").setAutocomplete(true).setRequired(true)));
add(new SlashCommandBuilder().setName("resetardaily").setDescription("(Dono) Libere a recompensa diária de um membro.").addUserOption(o=>o.setName("usuario").setDescription("Membro alvo").setRequired(true)));
add(new SlashCommandBuilder().setName("administrardestaque").setDescription("(Dono) Ative ou remova o destaque de perfil de um membro.").addStringOption(o=>o.setName("acao").setDescription("Ação").setRequired(true).addChoices({name:"Ativar",value:"ativar"},{name:"Remover",value:"remover"})).addUserOption(o=>o.setName("usuario").setDescription("Membro alvo").setRequired(true)).addIntegerOption(o=>o.setName("horas").setDescription("Duração em horas, se ativar").setMinValue(1).setMaxValue(720).setRequired(true)));
add(new SlashCommandBuilder().setName("lojapets").setDescription("🐾 Veja caixas de pets, acessórios e companheiros exclusivos."));
add(new SlashCommandBuilder().setName("comprarcaixapet").setDescription("Compre uma loot box de pet.").addStringOption(o => o.setName("caixa").setDescription("Tipo de caixa").setRequired(true).addChoices(...Object.entries(petBoxCatalog).map(([value,b])=>({name:`${b.emoji} ${b.name} — ${b.price} moedas`.slice(0,100),value})))));
add(new SlashCommandBuilder().setName("abrirlootboxpet").setDescription("Abra uma loot box de pet que você possui.").addStringOption(o => o.setName("caixa").setDescription("Caixa para abrir").setRequired(true).addChoices(...Object.entries(petBoxCatalog).map(([value,b])=>({name:b.name.slice(0,100),value})))));
add(new SlashCommandBuilder().setName("verpets").setDescription("Abra sua casinha para cuidar dos pets, alimentar e brincar."));
add(new SlashCommandBuilder().setName("pet").setDescription("Veja seu pet ativo, corações e vínculo."));
add(new SlashCommandBuilder().setName("equiparpet").setDescription("Escolha um pet que você já desbloqueou.").addStringOption(o=>o.setName("pet").setDescription("Pet do seu inventário").setAutocomplete(true).setRequired(true)));
add(new SlashCommandBuilder().setName("alimentarpet").setDescription("Alimente seu pet e ganhe um coração de vínculo."));
add(new SlashCommandBuilder().setName("brincarpet").setDescription("Brinque com seu pet para ganhar carinho e XP."));
add(new SlashCommandBuilder().setName("acessoriospet").setDescription("Veja acessórios exclusivos por espécie."));
add(new SlashCommandBuilder().setName("compraracessorio").setDescription("Compre um acessório para um pet que você possui.").addStringOption(o=>o.setName("acessorio").setDescription("Acessório compatível com seus pets").setAutocomplete(true).setRequired(true)));
add(new SlashCommandBuilder().setName("equiparacessorio").setDescription("Equipe no pet ativo um acessório compatível que você possui.").addStringOption(o=>o.setName("acessorio").setDescription("Acessório do seu inventário").setAutocomplete(true).setRequired(true)));
add(new SlashCommandBuilder().setName("destacarperfil").setDescription("Destaque seu perfil por 24 horas."));
add(new SlashCommandBuilder().setName("daily").setDescription("Receba moedas diárias."));
add(new SlashCommandBuilder().setName("saldo").setDescription("👛 Veja sua carteira e 🏦 seu banco."));
add(new SlashCommandBuilder().setName("trabalhar").setDescription("Trabalhe e ganhe moedas."));
add(new SlashCommandBuilder().setName("pagar").setDescription("💸 Envie moedas e receba uma cédula ilustrada.").addUserOption(o => o.setName("usuario").setDescription("Destinatário").setRequired(true)).addIntegerOption(o => o.setName("quantia").setDescription("Quantidade").setMinValue(1).setRequired(true)));
add(new SlashCommandBuilder().setName("transferir").setDescription("💵 Transfira moedas para outro jogador com a cédula da Osaka.").addUserOption(o => o.setName("usuario").setDescription("Jogador que vai receber").setRequired(true)).addIntegerOption(o => o.setName("quantia").setDescription("Quantidade de moedas").setMinValue(1).setRequired(true)));
add(new SlashCommandBuilder().setName("depositar").setDescription("🏦 Deposite moedas no banco.").addIntegerOption(o => o.setName("quantia").setDescription("Quantidade").setMinValue(1).setRequired(true)));
add(new SlashCommandBuilder().setName("sacar").setDescription("💵 Saque moedas do banco.").addIntegerOption(o => o.setName("quantia").setDescription("Quantidade").setMinValue(1).setRequired(true)));
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
add(new SlashCommandBuilder().setName("music").setDescription("Toque exatamente a música solicitada e opcionalmente repita.").addStringOption(o => o.setName("musica").setDescription("Nome da música ou link direto do vídeo/faixa").setMaxLength(500).setRequired(true)).addBooleanOption(o => o.setName("loop").setDescription("Repetir esta música quando terminar? (padrão: não)").setRequired(false)));
add(new SlashCommandBuilder().setName("pararmusic").setDescription("Pare a música e desconecte o bot do canal de voz."));
add(new SlashCommandBuilder().setName("loopmusic").setDescription("Ative ou desative o loop da música que está tocando.").addBooleanOption(o=>o.setName("ativado").setDescription("Repetir a faixa atual").setRequired(true)));

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
  if (!OPENAI_API_KEY) {
    throw new Error("A geração de imagens não está configurada. Adicione OPENAI_API_KEY nas variáveis do Railway e confirme que a API tem acesso a modelos de imagem.");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 90000);

  async function requestImage(model) {
    const body = {
      model,
      prompt: String(prompt).slice(0, 900),
      n: 1,
      size: "1024x1024",
      output_format: "png"
    };

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
      const err = new Error(json?.error?.message || `API de imagem respondeu ${res.status}`);
      err.status = res.status;
      err.apiCode = json?.error?.code || "";
      throw err;
    }

    const item = json.data?.[0];
    if (item?.b64_json) {
      return new AttachmentBuilder(Buffer.from(item.b64_json, "base64"), { name: "ysis-imagem.png" });
    }
    if (item?.url) {
      const imageRes = await fetch(item.url, { signal: controller.signal });
      if (!imageRes.ok) throw new Error("A API gerou a imagem, mas não consegui descarregá-la.");
      return new AttachmentBuilder(Buffer.from(await imageRes.arrayBuffer()), { name: "ysis-imagem.png" });
    }
    throw new Error("A API não devolveu os dados da imagem. Verifique o acesso ao modelo e a cobrança da API.");
  }

  try {
    try {
      return await requestImage(IMAGE_MODEL);
    } catch (error) {
      const modelUnavailable = error?.status === 404 || error?.apiCode === "model_not_found" ||
        /model.{0,60}(does not exist|not found|unsupported)|does not exist.{0,60}model/i.test(String(error?.message || ""));
      if (IMAGE_MODEL !== "gpt-image-2" && modelUnavailable) {
        console.warn(`Modelo de imagem ${IMAGE_MODEL} indisponível; a tentar gpt-image-2.`);
        return await requestImage("gpt-image-2");
      }
      throw error;
    }
  } catch (e) {
    if (e?.name === "AbortError") {
      throw new Error("A geração de imagem demorou demais (timeout). Tente um pedido mais simples.");
    }
    if (/organization.*verif|verify.*organization/i.test(String(e?.message || ""))) {
      throw new Error("A conta da API precisa de concluir a verificação da organização para usar o modelo de imagem.");
    }
    if (/insufficient_quota|billing|quota/i.test(String(e?.message || ""))) {
      throw new Error("A API está sem saldo ou atingiu o limite de utilização. Verifique a cobrança e os limites da sua conta OpenAI API.");
    }
    throw e;
  } finally {
    clearTimeout(timeout);
  }
}

function withTimeout(promise, timeoutMs, timeoutMessage) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(timeoutMessage)), timeoutMs);
    timer.unref?.();
  });
  return Promise.race([Promise.resolve(promise), timeout]).finally(() => clearTimeout(timer));
}

async function startMusic(interaction, query) {
  const updateStatus = message => {
    if (interaction?.deferred && typeof interaction.editReply === "function") {
      interaction.editReply({ content: message }).catch(() => {});
    }
  };
  const voiceChannel = interaction.member?.voice?.channel;
  if (!interaction.guild || !interaction.guildId) throw new Error("Esse comando precisa ser usado dentro de um servidor.");
  if (!voiceChannel) throw new Error("Entre em um canal de voz primeiro para eu tocar música.");

  const botMember = interaction.guild.members.me;
  if (!botMember) throw new Error("Não consegui localizar o membro do bot no servidor. Tente novamente em alguns segundos.");
  const permissions = botMember.permissionsIn(voiceChannel);
  if (!permissions.has(PermissionFlagsBits.Connect) || !permissions.has(PermissionFlagsBits.Speak)) {
    throw new Error("Preciso das permissões Conectar e Falar nesse canal de voz.");
  }

  const cleanedQuery = String(query || "").trim();
  if (!cleanedQuery) throw new Error("Informe o nome da música ou um link de vídeo do YouTube ou faixa do SoundCloud.");

  const isUrl = /^https?:\/\//i.test(cleanedQuery);
  let track;
  let stream;
  let originalPlatform = "youtube";

  if (isUrl) {
    const youtubeValidation = typeof play.yt_validate === "function" ? play.yt_validate(cleanedQuery) : false;
    const soundCloudValidation = typeof play.so_validate === "function" ? play.so_validate(cleanedQuery) : false;
    if (youtubeValidation && youtubeValidation !== "video") {
      throw new Error("Por enquanto, o comando aceita links de vídeos individuais, não playlists do YouTube.");
    }
    if (!youtubeValidation && !soundCloudValidation) {
      throw new Error("Link não suportado. Use um vídeo individual do YouTube ou uma faixa do SoundCloud.");
    }
    originalPlatform = soundCloudValidation ? "soundcloud" : "youtube";
    track = { url: cleanedQuery, title: cleanedQuery };

    // Obtém o título real do vídeo para permitir a pesquisa de uma cópia no SoundCloud se necessário.
    if (originalPlatform === "youtube" && typeof play.video_basic_info === "function") {
      try {
        const info = await withTimeout(play.video_basic_info(cleanedQuery), 10000, "A consulta dos dados do vídeo demorou demais.");
        track.title = info?.video_details?.title || track.title;
        track.author = info?.video_details?.channel?.name || info?.video_details?.author?.name || "";
      } catch (error) {
        console.warn("Não consegui consultar os metadados do vídeo antes da reprodução:", error?.message || error);
      }
    }
  } else {
    updateStatus(`🔎 Procurando **${cleanedQuery.slice(0, 150)}** no YouTube…`);
    try {
      const tracks = await withTimeout(
        play.search(cleanedQuery, { limit: 1 }),
        15000,
        "A pesquisa demorou mais de 15 segundos. Tente novamente ou envie um link direto."
      );
      if (!Array.isArray(tracks) || !tracks.length) throw new Error("Não encontrei essa música no YouTube.");
      track = tracks[0];
      originalPlatform = /soundcloud\.com/i.test(String(track.url || "")) ? "soundcloud" : "youtube";
    } catch (error) {
      console.error("Erro procurando música:", error?.stack || error);
      throw new Error(/15 segundos/.test(String(error?.message)) ? error.message : "Não consegui pesquisar essa música agora. Tente outro nome ou envie um link de vídeo do YouTube/SoundCloud.");
    }
  }

  const obtainStream = async candidate => withTimeout(
    play.stream(candidate.url || candidate, { discordPlayerCompatibility: true }),
    18000,
    "A fonte de música demorou mais de 18 segundos para abrir o áudio."
  );

  try {
    updateStatus(`🎵 Encontrei **${String(track.title || cleanedQuery).slice(0, 130)}**. A abrir o áudio…`);
    stream = await obtainStream(track);
  } catch (sourceError) {
    console.error("Falha ao abrir a fonte solicitada:", sourceError?.stack || sourceError);
    throw new Error(`Não consegui reproduzir exatamente a música solicitada na fonte original. Não vou trocar por outra faixa. Detalhe: ${sourceError?.message || sourceError}`);
  }

  if (!stream?.stream) throw new Error("A fonte não retornou um fluxo de áudio válido. Tente outra música.");

  updateStatus(`🎵 **${String(track.title || track.name || cleanedQuery).slice(0, 150)}** encontrada. Preparando o áudio…`);

  // Só substitui a sessão anterior depois que a nova faixa já foi localizada e preparada.
  const oldSession = musicSessions.get(interaction.guildId);
  if (oldSession) {
    try { oldSession.player?.stop(true); } catch {}
    try { oldSession.connection?.destroy(); } catch {}
    musicSessions.delete(interaction.guildId);
  }

  let connection;
  let player;
  try {
    updateStatus("🔊 Conectando ao canal de voz e iniciando a reprodução…");
    connection = joinVoiceChannel({
      channelId: voiceChannel.id,
      guildId: interaction.guildId,
      adapterCreator: interaction.guild.voiceAdapterCreator,
      selfDeaf: true
    });
    await entersState(connection, VoiceConnectionStatus.Ready, 12000);

    player = createAudioPlayer({ behaviors: { noSubscriber: NoSubscriberBehavior.Pause } });
    const resource = createAudioResource(stream.stream, { inputType: stream.type });
    connection.subscribe(player);

    const started = new Promise((resolve, reject) => {
      let timer;
      const cleanup = () => {
        clearTimeout(timer);
        player.off(AudioPlayerStatus.Playing, onPlaying);
        player.off("error", onError);
      };
      const onPlaying = () => { cleanup(); resolve(); };
      const onError = error => { cleanup(); reject(new Error(`Falha no player de áudio: ${error?.message || error}`)); };
      timer = setTimeout(() => {
        cleanup();
        reject(new Error("O bot conectou, mas o áudio não começou a tocar em 10 segundos. A fonte pode estar a bloquear o alojamento."));
      }, 10000);
      timer.unref?.();
      player.once(AudioPlayerStatus.Playing, onPlaying);
      player.once("error", onError);
    });
    player.play(resource);
    await started;

    const session = { connection, player, track, query: cleanedQuery, loop: Boolean(interaction.options?.getBoolean?.("loop")), textChannelId: interaction.channelId, restarting: false };
    musicSessions.set(interaction.guildId, session);
    player.on("error", error => {
      console.error("Erro no player de áudio:", error?.stack || error);
      const current = musicSessions.get(interaction.guildId);
      if (current?.player === player) musicSessions.delete(interaction.guildId);
      try { connection.destroy(); } catch {}
    });
    player.on(AudioPlayerStatus.Idle, async () => {
      const current = musicSessions.get(interaction.guildId);
      if (!current || current.player !== player) return;
      if (current.loop && !current.restarting) {
        current.restarting = true;
        try {
          const nextStream = await withTimeout(play.stream(current.track.url, { discordPlayerCompatibility: true }), 18000, "A faixa demorou demais para reiniciar em loop.");
          if (!nextStream?.stream) throw new Error("A fonte não devolveu áudio para repetir a mesma faixa.");
          const resource = createAudioResource(nextStream.stream, { inputType: nextStream.type });
          current.player.play(resource);
        } catch (loopError) {
          console.error("Falha no loop da mesma faixa:", loopError?.stack || loopError);
          current.loop = false;
          try { current.connection.destroy(); } catch {}
          musicSessions.delete(interaction.guildId);
        } finally { current.restarting = false; }
        return;
      }
      try { current.connection.destroy(); } catch {}
      musicSessions.delete(interaction.guildId);
    });
    connection.on("error", error => console.error("Erro de conexão de voz:", error?.stack || error));
    return track;
  } catch (error) {
    try { player?.stop(true); } catch {}
    try { connection?.destroy(); } catch {}
    try { stream?.stream?.destroy?.(); } catch {}
    throw error;
  }
}

client.once("ready", async () => {
  console.log(`Online como ${client.user.tag}`);

  if (!GUILD_ID) {
    console.warn("GUILD_ID não configurado: o bot iniciou, mas os comandos Slash não serão atualizados. Adicione o ID do servidor nas variáveis do Railway para registrar os comandos.");
    return;
  }

  try {
    const rest = new REST({ version: "10" }).setToken(TOKEN);
    const applicationId = CLIENT_ID || client.user.id;
    await rest.put(
      Routes.applicationGuildCommands(applicationId, GUILD_ID),
      { body: cmd }
    );
    console.log(`${cmd.length} comandos registrados no servidor ${GUILD_ID}.`);
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
  const isPetHouseControl = (i.isButton() || i.isStringSelectMenu?.()) && String(i.customId || "").startsWith("ysispet:");
  if (isPetHouseControl) {
    const [prefix, action, ownerId, itemKey] = String(i.customId).split(":");
    if (ownerId !== i.user.id) return i.reply({ content: "🔒 Esta casinha é privada. Usa `/verpets` para abrir a tua.", ephemeral: true });
    const profile = user(i.user.id);
    const showHome = async note => i.update({
      embeds: [buildPetHouseEmbed(profile, note)],
      components: petHouseComponents(i.user.id, profile),
      attachments: [],
      files: [new AttachmentBuilder(await renderPetHouseCard(profile), { name: "ysis-casinha-pets.png" })]
    });
    const showShop = async () => i.update({ embeds: [buildPetBoxShopEmbed(profile, i.guildId)], components: petBoxShopComponents(i.user.id), attachments: [] });

    if (i.isStringSelectMenu?.() && action === "select") {
      const petId = i.values[0];
      if (!profile.ownedPets.includes(petId) || !petCatalog[petId]) return i.reply({ content: "Esse pet não está na tua coleção.", ephemeral: true });
      profile.activePet = petId; save();
      return showHome(`🐾 Selecionaste **${petCatalog[petId].name}**.`);
    }

    if (action === "shop") {
      // Desbloqueio inicial gratuito: um cachorrinho ilustrado + uma caixa básica.
      // O estado é persistido para impedir recompensas duplicadas por cliques repetidos.
      if (!profile.starterPetClaimed && profile.ownedPets.length === 0) {
        const starterPetId = "cachorro";
        profile.starterPetClaimed = true;
        if (!profile.ownedPets.includes(starterPetId)) profile.ownedPets.push(starterPetId);
        profile.pets[starterPetId] = profile.pets[starterPetId] || { hearts: 0, xp: 0, lastFeed: 0, lastPlay: 0, accessory: null };
        profile.activePet = starterPetId;
        profile.petBoxes.basica = Math.max(0, Number(profile.petBoxes.basica || 0)) + 1;
        save();
        return showHome("🎉 **Presente inicial desbloqueado!** Você recebeu um 🐶 **Cachorrinho Dourado** e uma 📦 **Caixa de Pet Básica**. O botão de desbloqueio foi removido; a caixa pode ser aberta aqui ou por `/abrirlootboxpet`.");
      }
      return showShop();
    }
    if (action === "home") return showHome();
    if (action === "buybox") {
      const box = petBoxCatalog[itemKey];
      if (!box) return i.reply({ content: "Esta caixa não existe.", ephemeral: true });
      if (profile.coins < box.price) return i.reply({ content: `Saldo insuficiente. Precisas de ${moneyText(i.guildId, box.price)}.`, ephemeral: true });
      profile.coins -= box.price;
      profile.petBoxes[itemKey] = (profile.petBoxes[itemKey] || 0) + 1;
      save();
      return i.update({
        embeds: [em(`✅ ${box.name} comprada!`, `A caixa foi guardada no teu inventário.\n\n**Caixas deste tipo:** ${profile.petBoxes[itemKey]}\n**Saldo restante:** ${moneyText(i.guildId, profile.coins)}\n\nPodes abrir agora ou guardar para depois.`, 0x57b987)],
        components: [new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId(`ysispet:openbox:${i.user.id}:${itemKey}`).setLabel("Abrir caixa agora").setEmoji("🎁").setStyle(ButtonStyle.Success),
          new ButtonBuilder().setCustomId(`ysispet:home:${i.user.id}`).setLabel("Voltar à casinha").setEmoji("🏡").setStyle(ButtonStyle.Secondary)
        )], attachments: []
      });
    }
    if (action === "openbox") {
      const result = openPetBoxForUser(profile, itemKey);
      if (!result.ok) return i.reply({ content: `❌ ${result.message}`, ephemeral: true });
      return showHome(result.message);
    }
    if (["feed", "play"].includes(action)) {
      if (!profile.ownedPets.length) return showHome("🔒 Ainda não tens pets. Usa **Desbloquear pet** para comprar uma caixa.");
      if (!profile.activePet || !profile.ownedPets.includes(profile.activePet)) profile.activePet = profile.ownedPets[0];
      const petId = profile.activePet;
      const state = profile.pets[petId] || (profile.pets[petId] = { hearts: 0, xp: 0, lastFeed: 0, lastPlay: 0, accessory: null });
      if (action === "feed") {
        const left = 4 * 60 * 60 * 1000 - (Date.now() - (state.lastFeed || 0));
        if (left > 0) return showHome(`🍖 **${petCatalog[petId].name}** ainda está satisfeito. Tenta novamente em ${Math.ceil(left / 3600000)} hora(s).`);
        if ((state.hearts || 0) >= 10) return showHome(`❤️ **${petCatalog[petId].emoji || "🐾"} ${petCatalog[petId].name}** já tem 10 corações. Brinca com ele para aumentar o vínculo.`);
        const cost = 50;
        if (profile.coins < cost) return showHome(`🪙 Precisas de ${moneyText(i.guildId, cost)} para comprar comida.`);
        profile.coins -= cost; state.hearts = Math.min(10, (state.hearts || 0) + 1); state.xp = (state.xp || 0) + 25; state.lastFeed = Date.now(); save();
        return showHome(`🍖 Alimentaste **${petCatalog[petId].emoji || "🐾"} ${petCatalog[petId].name}**! Ganhou **+1 coração** ❤️ e **+25 XP de vínculo**.`);
      }
      const left = 60 * 60 * 1000 - (Date.now() - (state.lastPlay || 0));
      if (left > 0) return showHome(`🎾 **${petCatalog[petId].name}** precisa descansar. Tenta novamente em ${Math.ceil(left / 60000)} minuto(s).`);
      const xp = rand(20, 55); state.xp = (state.xp || 0) + xp; state.lastPlay = Date.now();
      let gained = 0; if ((state.hearts || 0) < 10) { state.hearts++; gained = 1; }
      save();
      return showHome(`🎾 Brincaste com **${petCatalog[petId].emoji || "🐾"} ${petCatalog[petId].name}**! ${gained ? "Ganhou **+1 coração** ❤️ e" : "O vínculo já está no máximo e"} recebeu **+${xp} XP de vínculo**.`);
    }
  }

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
    const typed = String(i.options.getFocused() || "").toLocaleLowerCase("pt-BR");
    if (i.commandName === "comprarcargo" && i.guild) {
      const cfg = guildConfig(i.guild.id);
      const offers = Object.entries(cfg.roleShop)
        .map(([roleId, offer]) => {
          const role = i.guild.roles.cache.get(roleId);
          if (!role) return null;
          return { name: `${role.name} — ${fmt(offer.price)} ${currencyName(i.guild.id)}`.slice(0, 100), value: roleId, search: `${role.name} ${roleId}`.toLocaleLowerCase("pt-BR") };
        }).filter(Boolean).filter(o => o.search.includes(typed)).slice(0, 25).map(({ name, value }) => ({ name, value }));
      await i.respond(offers).catch(() => {});
      return;
    }
    const autoUser = user(i.user.id);
    let options = [];
    if (i.commandName === "usarmoldura") {
      const keys = isOwner(i) ? Object.keys(frameCatalog) : autoUser.ownedFrames;
      options = keys.filter(key=>frameCatalog[key]).map(key=>({name:`${frameCatalog[key].emoji || "🖼️"} ${frameCatalog[key].name}${isOwner(i)&&!autoUser.ownedFrames.includes(key)?" • dono":""}`.slice(0,100),value:key}));
    } else if (i.commandName === "usarfundo") {
      const keys = isOwner(i) ? Object.keys(bannerCatalog) : autoUser.ownedBanners;
      options = keys.filter(key=>bannerCatalog[key]).map(key=>({name:`${bannerCatalog[key].emoji || "🌌"} ${bannerCatalog[key].rarity} • ${bannerCatalog[key].name}${isOwner(i)&&!autoUser.ownedBanners.includes(key)?" • dono":""}`.slice(0,100),value:key}));
    } else if (i.commandName === "equiparpet") {
      options = autoUser.ownedPets.filter(key=>petCatalog[key]).map(key=>({name:`${petCatalog[key].emoji || "🐾"} ${petCatalog[key].name} • ${petCatalog[key].rarity}`.slice(0,100),value:key}));
    } else if (i.commandName === "compraracessorio") {
      options = Object.entries(petAccessoryCatalog).filter(([key,a])=>autoUser.ownedPets.includes(a.petId)).map(([key,a])=>({name:`${a.name} — ${a.price} moedas`.slice(0,100),value:key}));
    } else if (i.commandName === "equiparacessorio") {
      const activePetId=autoUser.activePet;
      options = autoUser.ownedPetAccessories.filter(key=>petAccessoryCatalog[key] && petAccessoryCatalog[key].petId===activePetId).map(key=>({name:petAccessoryCatalog[key].name.slice(0,100),value:key}));
    } else if (i.commandName === "gerenciarperfil") {
      if (!isOwner(i)) { await i.respond([]).catch(()=>{}); return; }
      const type = i.options.getString("tipo");
      const catalogs = { moldura: frameCatalog, fundo: bannerCatalog, pet: petCatalog, acessorio: petAccessoryCatalog, insignia: insigniaCatalog };
      const catalog = catalogs[type] || {};
      options = Object.entries(catalog).map(([key,item])=>({name:`${item.emoji || "✨"} ${item.name || key} (${key})`.slice(0,100),value:key}));
    } else if (i.commandName === "administrarconquista") {
      options = achievementCatalog.map(item=>({name:`${item.name} (${item.id})`.slice(0,100),value:item.id}));
    }
    options = options.filter(o=>`${o.name} ${o.value}`.toLocaleLowerCase("pt-BR").includes(typed)).slice(0,25);
    await i.respond(options).catch(()=>{});
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
    if (["adicionarmoedas", "removermoedas", "setarmoedas"].includes(name) && !isOwner(i)) {
      return reply("⛔ Apenas o dono do YSIS MC pode ajustar moedas manualmente.", true);
    }
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
      const loop = i.options.getBoolean("loop") || false;
      const track = await startMusic(i, query);
      return i.editReply(`🎶 Tocando agora: **${track.title || track.name || query}**\n🔁 Loop: **${loop ? "ativado" : "desativado"}**\nPedido por ${me}.`);
    }
    if (name === "loopmusic") {
      const session = musicSessions.get(i.guildId);
      if (!session) return reply("Não há música tocando agora para configurar o loop.", true);
      session.loop = i.options.getBoolean("ativado", true);
      return reply(`🔁 Loop ${session.loop ? "ativado: a mesma faixa será repetida" : "desativado"}.`, true);
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
        const isGif = card.length >= 6 && card.toString("ascii", 0, 3) === "GIF";
        const attachment = new AttachmentBuilder(card, { name: isGif ? "ysis-perfil.gif" : "ysis-perfil.png" });
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
      if (name === "insignias") {
        const ownedKeys = [...(p.ownedInsignias || [])];
        const targetMember = i.guild.members.cache.get(target.id) || await i.guild.members.fetch(target.id).catch(() => null);
        if ((OWNER_USER_ID && target.id === OWNER_USER_ID) || targetMember?.roles?.cache?.has(OWNER_ROLE_ID)) {
          if (!ownedKeys.includes("dono")) ownedKeys.unshift("dono");
        }
        const owned = ownedKeys.map(key=>insigniaCatalog[key]).filter(Boolean);
        const ownedText = owned.length ? owned.map(b=>`🏵️ **${b.name}** — ${b.desc}`).join("\n") : "Ainda não tem insígnias especiais. O dono pode concedê-las pelo comando `/gerenciarperfil`.";
        const allText = Object.entries(insigniaCatalog).map(([key,b])=>`${ownedKeys.includes(key)?"✅":"🔒"} **${b.name}** — ${b.desc}`).join("\n");
        const embed = em(`🏵️ Insígnias • ${target.username}`, `**Insígnias exibidas no perfil:**\n${ownedText}\n\n**Catálogo:**\n${allText}`, 0xf1c40f).setThumbnail(target.displayAvatarURL({ size: 512 }));
        return i.reply({ embeds: [embed], ephemeral: target.id === me.id });
      }
      const description = achievementCatalog.map(a => { const got = a.test(p) || (p.ownedAchievements || []).includes(a.id); return `${got ? "🏅" : "🔒"} ${a.icon} **${a.name}** — ${a.desc}${got ? " *(desbloqueada)*" : ""}`; }).join("\n");
      const embed = em(`🏆 Conquistas • ${target.username}`, `**Desbloqueadas:** ${unlocked.length}/${achievementCatalog.length}\n\n${description}`, 0xf1c40f).setThumbnail(target.displayAvatarURL({ size: 512 }));
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
      if (!frameCatalog[key]) return reply("❌ Moldura não encontrada.", true);
      if (!u.ownedFrames.includes(key) && !isOwner(i)) return reply("🔒 Você ainda não possui essa moldura. Ela não aparece na lista de seleção porque não está no seu inventário.", true);
      u.frame = key;
      save();
      return reply(`✅ ${frameCatalog[key].emoji} Moldura **${frameCatalog[key].name}** equipada!`, true);
    }

    if (name === "fundos") {
      const desc = Object.entries(bannerCatalog).map(([key,b])=>`${u.ownedBanners.includes(key)?"✅":"🔒"} **${b.emoji || "🌌"} ${b.name}** — *${b.rarity}* · ${key === "cosmico" ? "Grátis" : `${fmt(b.price)} ${currencyName(i.guild.id)}`}
${u.banner===key?"✨ Equipado":""}`).join("\n\n");
      return i.reply({ephemeral:true,embeds:[em("🌌 Banners animados",`${desc}\n\nCompre com \`/comprarfundo\` e equipe com \`/usarfundo\`. A raridade define o brilho; apenas Lendários e Míticos animam em GIF.`,0x8e64d7)]});
    }

    if (name === "comprarfundo") {
      const key=i.options.getString("fundo"); const b=bannerCatalog[key];
      if(!b) return reply("❌ Banner não encontrado.",true);
      if(u.ownedBanners.includes(key)) return reply("Você já possui esse banner.",true);
      if(u.coins<b.price) return reply(`Saldo insuficiente. Você precisa de ${moneyText(i.guild.id,b.price)}.`,true);
      u.coins-=b.price; u.ownedBanners.push(key); save();
      return reply(`✅ ${b.emoji || "🌌"} Banner **${b.name}** desbloqueado! Raridade: **${b.rarity}**. Use \`/usarfundo\` para equipar.`,true);
    }

    if (name === "usarfundo") {
      const key=i.options.getString("fundo"); const b=bannerCatalog[key];
      if(!b) return reply("❌ Banner não encontrado.",true);
      if(!u.ownedBanners.includes(key) && !isOwner(i)) return reply("🔒 Você não possui esse banner. A lista só mostra banners desbloqueados.",true);
      u.banner=key; save();
      return reply(`✅ ${b.emoji || "🌌"} Banner **${b.name}** equipado no perfil. Raridade: **${b.rarity}**.`,true);
    }

    if (name === "gerenciarperfil") {
      if (!isOwner(i)) return reply("⛔ Este comando é exclusivo do dono do YSIS MC.",true);
      const action=i.options.getString("acao"); const type=i.options.getString("tipo"); const target=i.options.getUser("usuario"); const key=i.options.getString("item");
      if(target.bot) return reply("Não é possível administrar itens de perfil de bots.",true);
      const profile=user(target.id);
      const listConfig = {
        moldura:{catalog:frameCatalog,list:"ownedFrames",equipped:"frame"},
        fundo:{catalog:bannerCatalog,list:"ownedBanners",equipped:"banner"},
        insignia:{catalog:insigniaCatalog,list:"ownedInsignias"}
      };
      if(type==="pet") {
        const pet=petCatalog[key]; if(!pet) return reply("Pet não encontrado.",true);
        if(action==="dar") {
          if(!profile.ownedPets.includes(key)) profile.ownedPets.push(key);
          if(!profile.pets[key]) profile.pets[key]={hearts:0,xp:0,lastFeed:0,lastPlay:0,accessory:null};
          if(!profile.activePet) profile.activePet=key;
        } else if(action==="retirar") {
          profile.ownedPets=profile.ownedPets.filter(x=>x!==key); delete profile.pets[key];
          if(profile.activePet===key) profile.activePet=profile.ownedPets[0]||null;
        } else {
          if(!profile.ownedPets.includes(key)) return reply("Primeiro dê esse pet ao membro com a ação Dar item.",true);
          profile.activePet=key;
        }
        save(); return reply(`✅ Ação **${action}** aplicada ao pet **${pet.name}** de ${target}.`,true);
      }
      if(type==="acessorio") {
        const acc=petAccessoryCatalog[key]; if(!acc) return reply("Acessório não encontrado.",true);
        if(action==="dar") {
          if(!profile.ownedPetAccessories.includes(key)) profile.ownedPetAccessories.push(key);
        } else if(action==="retirar") {
          profile.ownedPetAccessories=profile.ownedPetAccessories.filter(x=>x!==key);
          if(profile.pets[acc.petId]?.accessory===key) profile.pets[acc.petId].accessory=null;
        } else {
          if(!profile.ownedPets.includes(acc.petId)) return reply(`O membro precisa possuir primeiro o pet ${petCatalog[acc.petId].name}.`,true);
          if(!profile.ownedPetAccessories.includes(key)) profile.ownedPetAccessories.push(key);
          if(!profile.pets[acc.petId]) profile.pets[acc.petId]={hearts:0,xp:0,lastFeed:0,lastPlay:0,accessory:null};
          profile.pets[acc.petId].accessory=key;
        }
        save(); return reply(`✅ Ação **${action}** aplicada ao acessório **${acc.name}** de ${target}.`,true);
      }
      const cfg=listConfig[type]; if(!cfg) return reply("Tipo de item inválido.",true);
      if(!cfg.catalog[key]) return reply("Item não encontrado no catálogo.",true);
      if(action==="dar") {
        if(!profile[cfg.list].includes(key)) profile[cfg.list].push(key);
        if(cfg.equipped) profile[cfg.equipped]=key;
      } else if(action==="retirar") {
        profile[cfg.list]=profile[cfg.list].filter(x=>x!==key);
        const defaultItem=type==="moldura"?"azul":type==="fundo"?"cosmico":null;
        if(cfg.equipped && profile[cfg.equipped]===key) profile[cfg.equipped]=defaultItem;
        if(type==="moldura"&&!profile.ownedFrames.includes("azul")) profile.ownedFrames.unshift("azul");
        if(type==="fundo"&&!profile.ownedBanners.includes("cosmico")) profile.ownedBanners.unshift("cosmico");
      } else {
        if(!profile[cfg.list].includes(key)) profile[cfg.list].push(key);
        if(cfg.equipped) profile[cfg.equipped]=key;
      }
      save(); return reply(`✅ **${action}** • ${cfg.catalog[key].name} para ${target}.`,true);
    }

    if (name === "verpets") {
      if (!u.activePet && u.ownedPets.length) u.activePet = u.ownedPets[0];
      save();
      return i.reply({
        ephemeral: true,
        embeds: [buildPetHouseEmbed(u)],
        components: petHouseComponents(me.id, u),
        files: [new AttachmentBuilder(await renderPetHouseCard(u), { name: "ysis-casinha-pets.png" })]
      });
    }

    if (name === "lojapets") {
      const boxes=Object.entries(petBoxCatalog).map(([key,b])=>`${b.emoji} **${b.name}** — ${moneyText(i.guild.id,b.price)}\nProbabilidades: ${Object.entries(b.drops).filter(([,n])=>n>0).map(([rarity,n])=>`${rarity} ${n}%`).join(" · ")}`).join("\n\n");
      const accessories=Object.entries(petAccessoryCatalog).map(([key,a])=>`🎀 **${a.name}** (${petCatalog[a.petId].emoji || "🐾"} ${petCatalog[a.petId].name}) — ${fmt(a.price)} moedas`).join("\n");
      return i.reply({ephemeral:true,embeds:[em("🐾 Loja de pets",`${boxes}\n\n**Acessórios por espécie**\n${accessories}\n\nCompre uma caixa, abra-a e depois use \`/verpets\`, \`/alimentarpet\` e \`/brincarpet\`.`,0x69bfa0)]});
    }

    if (name === "comprarcaixapet") {
      const key=i.options.getString("caixa"); const box=petBoxCatalog[key];
      if(!box) return reply("Caixa não encontrada.",true);
      if(u.coins<box.price) return reply(`Saldo insuficiente. Você precisa de ${moneyText(i.guild.id,box.price)}.`,true);
      u.coins-=box.price; u.petBoxes[key]=(u.petBoxes[key]||0)+1; save();
      return reply(`✅ Compraste ${box.emoji} **${box.name}**. Agora use \`/abrirlootboxpet\` e escolha essa caixa.`,true);
    }

    if (name === "abrirlootboxpet") {
      const key = i.options.getString("caixa");
      const result = openPetBoxForUser(u, key);
      if (!result.ok) return reply(`❌ ${result.message} Compra uma caixa em \`/lojapets\` ou usa \`/verpets\`.`, true);
      return reply(`${result.message} Usa \`/verpets\` para ver a casinha e cuidar dos teus pets.`, true);
    }

    if (name === "pet") {
      if (!u.ownedPets.length) return reply("A tua casinha está vazia. Usa `/verpets` e carrega em **Desbloquear pet** para comprar uma caixa.", true);
      const active = u.activePet && petCatalog[u.activePet] ? u.activePet : u.ownedPets[0];
      u.activePet = active; save();
      const state = u.pets[active] || { hearts: 0, xp: 0, accessory: null, lastFeed: 0, lastPlay: 0 };
      const accessory = state.accessory && petAccessoryCatalog[state.accessory];
      const hearts = Math.max(0, Math.min(10, Number(state.hearts || 0)));
      return i.reply({ ephemeral: true, embeds: [em(`${petCatalog[active].emoji || "🐾"} ${petCatalog[active].name}`, `**Raridade:** ${petCatalog[active].rarity}\n**Corações:** ${hearts}/10\n**Vínculo:** nível ${Math.floor((state.xp || 0) / 100) + 1} · ${state.xp || 0} XP\n**Acessório:** ${accessory ? accessory.name : "Nenhum"}\n\nAbre o comando /verpets para escolher, alimentar e brincar com os teus pets.`, 0x74c69d)] });
    }

    if (name === "equiparpet") {
      const key=i.options.getString("pet");
      if(!petCatalog[key]||!u.ownedPets.includes(key)) return reply("Esse pet não está na sua coleção. A seleção mostra apenas pets que você possui.",true);
      u.activePet=key; save();
      return reply(`✅ **${petCatalog[key].emoji || "🐾"} ${petCatalog[key].name}** selecionado como pet ativo. Use \`/verpets\` para cuidar dele; ele também aparece ao lado do avatar no cartão de perfil.`,true);
    }

    if (name === "alimentarpet") {
      const key=u.activePet; if(!key||!u.ownedPets.includes(key)) return reply("Você precisa ter e equipar um pet primeiro. Use \`/lojapets\`.",true);
      const state=u.pets[key]; const left=4*60*60*1000-(Date.now()-(state.lastFeed||0));
      if(left>0) return reply(`🍖 Seu pet ainda está satisfeito. Tente novamente em ${Math.ceil(left/3600000)} hora(s).`,true);
      const cost=50; if(u.coins<cost) return reply(`Você precisa de ${moneyText(i.guild.id,cost)} para comprar comida para o pet.`,true);
      if((state.hearts||0)>=10) return reply("Seu pet já está com o vínculo no máximo (10 corações). Brinque com ele para ganhar XP.",true);
      u.coins-=cost; state.hearts=Math.min(10,(state.hearts||0)+1); state.xp=(state.xp||0)+25; state.lastFeed=Date.now(); save();
      return reply(`🍖 Você alimentou **${petCatalog[key].emoji || "🐾"} ${petCatalog[key].name}** e ganhou **+1 coração**! ❤️ ${state.hearts}/10 · +25 XP de vínculo.`,true);
    }

    if (name === "brincarpet") {
      const key=u.activePet; if(!key||!u.ownedPets.includes(key)) return reply("Você precisa ter e equipar um pet primeiro. Use \`/lojapets\`.",true);
      const state=u.pets[key]; const left=60*60*1000-(Date.now()-(state.lastPlay||0));
      if(left>0) return reply(`Seu pet precisa descansar. Tente novamente em ${Math.ceil(left/60000)} minuto(s).`,true);
      const xp=rand(20,55); state.xp=(state.xp||0)+xp; state.lastPlay=Date.now();
      let gained=0; if((state.hearts||0)<10){state.hearts++;gained=1;}
      save(); return reply(`🎾 Você brincou com **${petCatalog[key].emoji || "🐾"} ${petCatalog[key].name}**! ${gained?"Ganhou **+1 coração** ❤️ e":"O vínculo já está no máximo;"} recebeu **+${xp} XP de vínculo**.`,true);
    }

    if (name === "acessoriospet") {
      const desc=Object.entries(petAccessoryCatalog).map(([key,a])=>`${u.ownedPetAccessories.includes(key)?"✅":"🔒"} **${a.name}** — ${petCatalog[a.petId].name} · ${fmt(a.price)} moedas${u.activePet===a.petId?" · compatível com o pet ativo":""}`).join("\n");
      return i.reply({ephemeral:true,embeds:[em("🎀 Acessórios de pet",`${desc}\n\nCada acessório é exclusivo da sua espécie e só aparece quando equipado no pet compatível.`,0xc084fc)]});
    }

    if (name === "compraracessorio") {
      const key=i.options.getString("acessorio"); const item=petAccessoryCatalog[key];
      if(!item) return reply("Acessório não encontrado.",true);
      if(!u.ownedPets.includes(item.petId)) return reply(`Você precisa possuir o pet **${petCatalog[item.petId].name}** para comprar este acessório.`,true);
      if(u.ownedPetAccessories.includes(key)) return reply("Você já possui esse acessório.",true);
      if(u.coins<item.price) return reply(`Saldo insuficiente. Você precisa de ${moneyText(i.guild.id,item.price)}.`,true);
      u.coins-=item.price; u.ownedPetAccessories.push(key); save();
      return reply(`✅ Você comprou **${item.name}**. Equipe o pet compatível com \`/equiparpet\` e use \`/equiparacessorio\`.`,true);
    }

    if (name === "equiparacessorio") {
      const key=i.options.getString("acessorio"); const item=petAccessoryCatalog[key];
      if(!item||!u.ownedPetAccessories.includes(key)) return reply("Esse acessório não está no seu inventário.",true);
      if(!u.activePet||item.petId!==u.activePet) return reply(`**${item.name}** só serve para ${petCatalog[item.petId].name}. Equipe esse pet primeiro.`,true);
      const state=u.pets[u.activePet]||(u.pets[u.activePet]={hearts:0,xp:0,lastFeed:0,lastPlay:0,accessory:null}); state.accessory=key; save();
      return reply(`🎀 **${item.name}** equipado em **${petCatalog[item.petId].name}**! O acessório fica guardado na sua casinha de pets.`,true);
    }

    if (name === "administrarrep") {
      if(!isOwner(i)) return reply("⛔ Apenas o dono pode administrar reputação.",true);
      const target=i.options.getUser("usuario"); const action=i.options.getString("acao"); const amount=i.options.getInteger("quantia");
      if(target.bot) return reply("Não é possível ajustar reputação de bots.",true);
      const profile=user(target.id);
      if(action==="definir") profile.reputation=amount;
      else if(action==="adicionar") profile.reputation+=amount;
      else profile.reputation=Math.max(0,profile.reputation-amount);
      save(); return reply(`✅ Reputação de ${target} atualizada: **${profile.reputation}**.`,true);
    }

    if (name === "administrarconquista") {
      if(!isOwner(i)) return reply("⛔ Apenas o dono pode administrar conquistas.",true);
      const target=i.options.getUser("usuario"); const action=i.options.getString("acao"); const key=i.options.getString("conquista");
      const conquest=achievementCatalog.find(a=>a.id===key); if(!conquest) return reply("Conquista não encontrada.",true);
      if(target.bot) return reply("Não é possível atribuir conquistas a bots.",true);
      const profile=user(target.id);
      if(action==="dar") { if(!profile.ownedAchievements.includes(key)) profile.ownedAchievements.push(key); }
      else profile.ownedAchievements=profile.ownedAchievements.filter(id=>id!==key);
      save(); return reply(`✅ Conquista **${conquest.name}** ${action==="dar"?"concedida a":"retirada de"} ${target}.`,true);
    }

    if (name === "resetardaily") {
      if(!isOwner(i)) return reply("⛔ Apenas o dono pode resetar o daily.",true);
      const target=i.options.getUser("usuario"); if(target.bot) return reply("Não é possível resetar daily de bots.",true);
      const profile=user(target.id); profile.lastDaily=0; profile.dailyStreak=0; save();
      return reply(`✅ O daily de ${target} foi liberado. Ele pode usar \`/daily\` novamente.`,true);
    }

    if (name === "administrardestaque") {
      if(!isOwner(i)) return reply("⛔ Apenas o dono pode administrar destaques.",true);
      const target=i.options.getUser("usuario"); const action=i.options.getString("acao"); const hours=i.options.getInteger("horas");
      if(target.bot) return reply("Não é possível destacar perfis de bots.",true);
      const profile=user(target.id); profile.featuredUntil=action==="ativar"?Date.now()+hours*3600000:0; save();
      return reply(action==="ativar"?`✅ Perfil de ${target} destacado por ${hours} hora(s).`:`✅ Destaque removido do perfil de ${target}.`,true);
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
      return reply(`💰 **Seu saldo — ${me.username}**\n👛 **Carteira:** ${moneyText(i.guild.id, u.coins)}\n🏦 **Banco:** ${moneyText(i.guild.id, u.bank)}\n💎 **Patrimônio total:** ${moneyText(i.guild.id, u.coins + u.bank)}`, true);
    }

    if (name === "trabalhar") {
      const left = cooldown(u, "lastWork", 3600000);
      if (left) return reply(`⏳ Tente novamente em ${Math.ceil(left / 60000)} min.`, true);

      const n = rand(40, 120);
      u.coins += n;
      save();
      return reply(`🧰 Você ganhou ${moneyText(i.guild.id, n)} trabalhando.`, true);
    }

    if (name === "pagar" || name === "transferir") {
      const t = i.options.getUser("usuario");
      const n = i.options.getInteger("quantia");
      if (!Number.isSafeInteger(n) || n < 1) return reply("❌ A quantia precisa ser um número inteiro positivo.", true);
      if (!t || t.bot || t.id === me.id) return reply("❌ Escolha outro jogador (não pode ser você nem um bot).", true);
      if (u.coins < n) return reply(`❌ Saldo insuficiente na carteira. Você tem ${moneyText(i.guild.id, u.coins)}.`, true);
      const recipientMember = await i.guild.members.fetch(t.id).catch(() => null);
      if (!recipientMember) return reply("❌ Esse jogador não está neste servidor.", true);

      // Renderiza a cédula antes de alterar os saldos, para evitar cobrar caso a imagem falhe.
      const bill = renderTransferBill({
        senderName: me.globalName || me.username,
        recipientName: recipientMember.displayName || t.username,
        amount: n,
        currency: currencyName(i.guild.id),
        currencyEmoji: currencyEmoji(i.guild.id)
      });
      const receiverProfile = user(t.id);
      u.coins -= n;
      receiverProfile.coins += n;
      save();
      const fileName = "ysis-cedula-osaka.png";
      const embed = em("💸 Transferência concluída!", `👛 Você enviou **${fmt(n)} ${currencyName(i.guild.id)}** para ${t}.
🏦 A quantia foi creditada na carteira de **${recipientMember.displayName || t.username}**.

🧾 Guarde a cédula da Osaka como comprovante desta operação.`, 0x43a978).setImage(`attachment://${fileName}`);
      return i.reply({ ephemeral: true, embeds: [embed], files: [new AttachmentBuilder(bill, { name: fileName })] });
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
      return reply(`${name === "depositar" ? "🏦 Depósito realizado" : "💵 Saque realizado"}: ${moneyText(i.guild.id, n)}.`, true);
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
