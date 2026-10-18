const {
  Client, GatewayIntentBits, SlashCommandBuilder, REST, Routes,
  EmbedBuilder, PermissionFlagsBits, ChannelType
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
  console.error("Configure DISCORD_TOKEN, CLIENT_ID e GUILD_ID nas variáveis do Railway.");
  process.exit(1);
}

const DATA_FILE = path.join(process.cwd(), "ysis-data.json");
const freshData = () => ({ users: {}, warns: {}, marriages: {} });
let data = freshData();
try {
  if (fs.existsSync(DATA_FILE)) data = { ...freshData(), ...JSON.parse(fs.readFileSync(DATA_FILE, "utf8")) };
} catch (e) { console.error("Erro lendo dados:", e); }
function save() {
  try { fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), "utf8"); }
  catch (e) { console.error("Erro salvando dados:", e); }
}
function user(id) {
  if (!data.users[id]) data.users[id] = {
    coins: 150, bank: 0, inventory: {}, xp: 0, lastDaily: 0,
    dailyStreak: 0, lastWork: 0, lastAdventure: 0, lastFish: 0, lastMine: 0, lastXP: 0
  };
  const u = data.users[id];
  for (const [k, v] of Object.entries({coins:150,bank:0,xp:0,lastDaily:0,dailyStreak:0,lastWork:0,lastAdventure:0,lastFish:0,lastMine:0,lastXP:0})) {
    if (typeof u[k] !== "number" || !Number.isFinite(u[k])) u[k] = v;
  }
  if (!u.inventory || typeof u.inventory !== "object" || Array.isArray(u.inventory)) u.inventory = {};
  return u;
}
const rand = (a,b) => Math.floor(Math.random()*(b-a+1))+a;
const fmt = n => Number(n || 0).toLocaleString("pt-BR");
function em(title, desc = "", color = 0x2878ff) {
  const e = new EmbedBuilder().setColor(color).setTitle(title).setTimestamp()
    .setFooter({text:"YSIS MC • Sua lenda, seu império"});
  if (desc) e.setDescription(desc);
  return e;
}
const level = xp => Math.floor(Math.sqrt(Math.max(0,xp)/100));
const bar = (n,max) => { const f=Math.max(0,Math.min(10,Math.floor((max? n/max:0)*10))); return "🟦".repeat(f)+"⬛".repeat(10-f); };
const shop = {
  cafe:{name:"Café",emoji:"☕",price:15,sell:8,desc:"Item de roleplay."},
  espada:{name:"Espada de Diamante",emoji:"⚔️",price:250,sell:120,unique:true,desc:"Uma espada poderosa."},
  picareta:{name:"Picareta de Diamante",emoji:"⛏️",price:200,sell:100,unique:true,desc:"Ferramenta de mineração."},
  escudo:{name:"Escudo",emoji:"🛡️",price:150,sell:75,unique:true,desc:"Proteção extra."},
  diamante:{name:"Diamante",emoji:"💎",price:180,sell:100,desc:"Material valioso."},
  peixe:{name:"Peixe",emoji:"🐟",price:25,sell:15,desc:"Peixe fresco."},
  esmeralda:{name:"Esmeralda",emoji:"💚",price:300,sell:160,desc:"Uma gema valiosa."},
  netherite:{name:"Fragmento de Netherite",emoji:"🔥",price:500,sell:280,desc:"Material lendário."},
  elytra:{name:"Elytra",emoji:"🪽",price:1200,sell:600,unique:true,desc:"Asas para voar."},
  totem:{name:"Totem da Imortalidade",emoji:"☠️",price:800,sell:400,unique:true,desc:"Item raro."}
};
const itemName = k => shop[k] ? `${shop[k].emoji} ${shop[k].name}` : k;
const choices = Object.entries(shop).map(([value,v])=>({name:`${v.emoji} ${v.name}`.slice(0,100),value}));
const cmd = [];
const add = c => cmd.push(c.toJSON());
add(new SlashCommandBuilder().setName("ajuda").setDescription("Veja os comandos do YSIS MC."));
add(new SlashCommandBuilder().setName("ip").setDescription("Veja o IP do Minecraft."));
add(new SlashCommandBuilder().setName("site").setDescription("Veja o site do YSIS MC."));
add(new SlashCommandBuilder().setName("servidor").setDescription("Informações do servidor Discord."));
add(new SlashCommandBuilder().setName("avatar").setDescription("Veja um avatar.").addUserOption(o=>o.setName("usuario").setDescription("Pessoa").setRequired(false)));
add(new SlashCommandBuilder().setName("perfil").setDescription("Veja um perfil.").addUserOption(o=>o.setName("usuario").setDescription("Pessoa").setRequired(false)));
add(new SlashCommandBuilder().setName("daily").setDescription("Receba moedas diárias."));
add(new SlashCommandBuilder().setName("saldo").setDescription("Veja seu saldo.").addUserOption(o=>o.setName("usuario").setDescription("Pessoa").setRequired(false)));
add(new SlashCommandBuilder().setName("trabalhar").setDescription("Trabalhe e ganhe moedas."));
add(new SlashCommandBuilder().setName("pagar").setDescription("Envie moedas.").addUserOption(o=>o.setName("usuario").setDescription("Destinatário").setRequired(true)).addIntegerOption(o=>o.setName("quantia").setDescription("Quantidade").setMinValue(1).setRequired(true)));
add(new SlashCommandBuilder().setName("depositar").setDescription("Deposite moedas no banco.").addIntegerOption(o=>o.setName("quantia").setDescription("Quantidade").setMinValue(1).setRequired(true)));
add(new SlashCommandBuilder().setName("sacar").setDescription("Saque moedas do banco.").addIntegerOption(o=>o.setName("quantia").setDescription("Quantidade").setMinValue(1).setRequired(true)));
add(new SlashCommandBuilder().setName("top").setDescription("Ranking de moedas."));
add(new SlashCommandBuilder().setName("apostar").setDescription("Aposte moedas.").addIntegerOption(o=>o.setName("quantia").setDescription("Quantidade").setMinValue(1).setRequired(true)));
add(new SlashCommandBuilder().setName("loja").setDescription("Veja a loja."));
add(new SlashCommandBuilder().setName("comprar").setDescription("Compre um item.").addStringOption(o=>o.setName("item").setDescription("Item").setRequired(true).addChoices(...choices)));
add(new SlashCommandBuilder().setName("inventario").setDescription("Veja seu inventário.").addUserOption(o=>o.setName("usuario").setDescription("Pessoa").setRequired(false)));
add(new SlashCommandBuilder().setName("vender").setDescription("Venda um item.").addStringOption(o=>o.setName("item").setDescription("Item").setRequired(true).addChoices(...choices)).addIntegerOption(o=>o.setName("quantidade").setDescription("Quantidade").setMinValue(1).setRequired(false)));
for (const [name,desc] of [["pescar","Pesque recompensas."],["aventura","Explore e encontre tesouros."],["minerar","Mine recursos."]]) add(new SlashCommandBuilder().setName(name).setDescription(desc));
add(new SlashCommandBuilder().setName("moeda").setDescription("Jogue cara ou coroa."));
add(new SlashCommandBuilder().setName("dado").setDescription("Role um dado."));
add(new SlashCommandBuilder().setName("pergunta").setDescription("Pergunte à bola mágica.").addStringOption(o=>o.setName("texto").setDescription("Pergunta").setMaxLength(300).setRequired(true)));
add(new SlashCommandBuilder().setName("ship").setDescription("Compatibilidade divertida.").addUserOption(o=>o.setName("pessoa1").setDescription("Pessoa 1").setRequired(true)).addUserOption(o=>o.setName("pessoa2").setDescription("Pessoa 2").setRequired(true)));
for (const [name,desc] of [["abracar","Dê um abraço."],["beijar","Mande um beijo."],["tapa","Tapa de brincadeira."]]) add(new SlashCommandBuilder().setName(name).setDescription(desc).addUserOption(o=>o.setName("usuario").setDescription("Pessoa").setRequired(true)));
add(new SlashCommandBuilder().setName("casar").setDescription("Peça alguém em casamento.").addUserOption(o=>o.setName("usuario").setDescription("Pessoa").setRequired(true)));
add(new SlashCommandBuilder().setName("divorciar").setDescription("Termine seu casamento no bot."));
add(new SlashCommandBuilder().setName("rate").setDescription("Avalie algo de 0 a 10.").addStringOption(o=>o.setName("texto").setDescription("O que avaliar").setRequired(true)));
add(new SlashCommandBuilder().setName("limpar").setDescription("Apague mensagens.").setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages).addIntegerOption(o=>o.setName("quantidade").setDescription("1 a 100").setMinValue(1).setMaxValue(100).setRequired(true)));
add(new SlashCommandBuilder().setName("expulsar").setDescription("Expulse um membro.").setDefaultMemberPermissions(PermissionFlagsBits.KickMembers).addUserOption(o=>o.setName("usuario").setDescription("Membro").setRequired(true)).addStringOption(o=>o.setName("motivo").setDescription("Motivo").setMaxLength(500).setRequired(false)));
add(new SlashCommandBuilder().setName("banir").setDescription("Bane um membro.").setDefaultMemberPermissions(PermissionFlagsBits.BanMembers).addUserOption(o=>o.setName("usuario").setDescription("Membro").setRequired(true)).addStringOption(o=>o.setName("motivo").setDescription("Motivo").setMaxLength(500).setRequired(false)));
add(new SlashCommandBuilder().setName("timeout").setDescription("Silencie temporariamente.").setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers).addUserOption(o=>o.setName("usuario").setDescription("Membro").setRequired(true)).addIntegerOption(o=>o.setName("minutos").setDescription("Minutos").setMinValue(1).setMaxValue(40320).setRequired(true)).addStringOption(o=>o.setName("motivo").setDescription("Motivo").setMaxLength(500).setRequired(false)));
add(new SlashCommandBuilder().setName("avisar").setDescription("Registre advertência.").setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers).addUserOption(o=>o.setName("usuario").setDescription("Membro").setRequired(true)).addStringOption(o=>o.setName("motivo").setDescription("Motivo").setRequired(true).setMaxLength(500)));
for (const [name,desc] of [["avisos","Veja advertências."],["limparavisos","Apague advertências."]]) add(new SlashCommandBuilder().setName(name).setDescription(desc).setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers).addUserOption(o=>o.setName("usuario").setDescription("Membro").setRequired(true)));
add(new SlashCommandBuilder().setName("lock").setDescription("Bloqueie o canal.").setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels));
add(new SlashCommandBuilder().setName("unlock").setDescription("Desbloqueie o canal.").setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels));
add(new SlashCommandBuilder().setName("dizer").setDescription("Envie uma mensagem pelo bot.").setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages).addStringOption(o=>o.setName("texto").setDescription("Mensagem").setRequired(true).setMaxLength(1800)));
add(new SlashCommandBuilder().setName("anunciar").setDescription("Publique anúncio.").setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages).addStringOption(o=>o.setName("titulo").setDescription("Título").setRequired(true).setMaxLength(200)).addStringOption(o=>o.setName("texto").setDescription("Conteúdo").setRequired(true).setMaxLength(3500)).addChannelOption(o=>o.setName("canal").setDescription("Canal destino").addChannelTypes(ChannelType.GuildText).setRequired(false)));
add(new SlashCommandBuilder().setName("ticket").setDescription("Abra ticket privado."));
add(new SlashCommandBuilder().setName("fecharticket").setDescription("Feche o ticket atual."));

const client = new Client({intents:[GatewayIntentBits.Guilds,GatewayIntentBits.GuildMembers,GatewayIntentBits.GuildMessages,GatewayIntentBits.MessageContent]});
async function log(guild,title,desc) {
  try {
    const ch = LOG_CHANNEL_ID ? await guild.channels.fetch(LOG_CHANNEL_ID).catch(()=>null) : guild.channels.cache.find(c=>c.name==="logs-moderação");
    if (ch?.isTextBased()) await ch.send({embeds:[em(title,desc,0xf39c12)]});
  } catch(e) { console.error("Log:",e.message); }
}
client.once("ready", async () => {
  console.log(`Online como ${client.user.tag}`);
  try {
    const rest = new REST({version:"10"}).setToken(TOKEN);
    await rest.put(Routes.applicationGuildCommands(CLIENT_ID,GUILD_ID),{body:cmd});
    console.log(`${cmd.length} comandos registrados.`);
  } catch(e) { console.error("Registro dos comandos:",e); }
});
client.on("guildMemberAdd", async m => {
  try {
    const ch = (WELCOME_CHANNEL_ID && await m.guild.channels.fetch(WELCOME_CHANNEL_ID).catch(()=>null)) || m.guild.systemChannel;
    if(ch?.isTextBased()) await ch.send({embeds:[em("👋 Bem-vindo(a) ao YSIS MC!",`Olá ${m}! Bem-vindo(a) ao **${m.guild.name}**!\n\n⛏️ **IP:** \`${IP}:${PORT}\`\n🌐 **Site:** ${SITE}\n📜 Leia as regras e divirta-se!`).setThumbnail(m.user.displayAvatarURL())]});
  } catch(e) { console.error("Boas-vindas:",e.message); }
});
client.on("guildMemberRemove", async m => {
  try {
    const ch = (GOODBYE_CHANNEL_ID && await m.guild.channels.fetch(GOODBYE_CHANNEL_ID).catch(()=>null)) || m.guild.systemChannel;
    if(ch?.isTextBased()) await ch.send(`👋 **${m.user.username}** saiu do servidor. Até a próxima!`);
  } catch(e) { console.error("Despedida:",e.message); }
});
const spamMap = new Map();
client.on("messageCreate", async m => {
  if(!m.guild || m.author.bot) return;
  const u=user(m.author.id), now=Date.now();
  if(now-u.lastXP>=60000) {
    const old=level(u.xp); u.xp+=rand(10,18); u.lastXP=now; save();
    if(level(u.xp)>old) m.channel.send(`🎉 Parabéns ${m.author}, você chegou ao nível **${level(u.xp)}**!`).catch(()=>{});
  }
  const k=`${m.guild.id}:${m.author.id}`, arr=(spamMap.get(k)||[]).filter(t=>now-t<7000);
  arr.push(now); spamMap.set(k,arr);
  if(arr.length>=7 || (m.mentions.users.size>=6 && arr.length>=3)) {
    try { if(m.deletable) await m.delete(); await log(m.guild,"🚨 Possível flood",`Membro: ${m.author} (\`${m.author.id}\`)\nCanal: ${m.channel}\nMensagens recentes: ${arr.length}`); spamMap.set(k,[]); }
    catch(e) { console.error("Antispam:",e.message); }
  }
});
function cooldown(u,key,ms) { const left=ms-(Date.now()-(u[key]||0)); if(left>0)return left; u[key]=Date.now(); return 0; }
client.on("interactionCreate", async i => {
 if(!i.isChatInputCommand()) return;
 const name=i.commandName, me=i.user, u=user(me.id);
 const reply=(content,ephemeral=false)=>i.reply({content,ephemeral});
 try {
  if(name==="ajuda") return i.reply({ephemeral:true,embeds:[em("📚 Comandos YSIS MC","**Geral:** `/ip` `/site` `/servidor` `/avatar` `/perfil`\n**Economia:** `/daily` `/saldo` `/trabalhar` `/pagar` `/depositar` `/sacar` `/top` `/apostar`\n**Loja:** `/loja` `/comprar` `/inventario` `/vender`\n**Jogos:** `/pescar` `/aventura` `/minerar` `/moeda` `/dado` `/pergunta` `/ship`\n**Social:** `/abracar` `/beijar` `/tapa` `/casar` `/divorciar` `/rate`\n**Moderação:** `/limpar` `/expulsar` `/banir` `/timeout` `/avisar` `/avisos` `/limparavisos` `/lock` `/unlock` `/dizer` `/anunciar`\n**Tickets:** `/ticket` `/fecharticket`")]});
  if(name==="ip") return i.reply({embeds:[em("⛏️ IP do YSIS MC",`**Endereço:** \`${IP}\`\n**Porta:** \`${PORT}\`\n**Painel:** ${ATERNOS}`)]});
  if(name==="site") return i.reply({embeds:[em("🌐 Site do YSIS MC",SITE)]});
  if(name==="servidor") return i.reply({embeds:[em(`🌍 ${i.guild.name}`,`**Membros:** ${i.guild.memberCount}\n**Criado:** <t:${Math.floor(i.guild.createdTimestamp/1000)}:D>\n**Dono:** <@${i.guild.ownerId}>`)]});
  if(name==="avatar") {const t=i.options.getUser("usuario")||me;return i.reply({embeds:[em(`🖼️ Avatar de ${t.username}`).setImage(t.displayAvatarURL({size:1024}))]});}
  if(name==="perfil") {const t=i.options.getUser("usuario")||me,p=user(t.id),lv=level(p.xp);return i.reply({embeds:[em(`👤 Perfil de ${t.username}`,`**Nível:** ${lv} ${bar(p.xp-lv*lv*100,(lv+1)**2*100-lv*lv*100)}\n**XP:** ${fmt(p.xp)}\n**Carteira:** 💰 ${fmt(p.coins)}\n**Banco:** 🏦 ${fmt(p.bank)}\n**Casamento:** ${data.marriages[t.id]?`<@${data.marriages[t.id]}>`:"Solteiro(a)"}`).setThumbnail(t.displayAvatarURL())]});}
  if(name==="daily") {const elapsed=Date.now()-u.lastDaily;if(elapsed<86400000)return reply(`⏳ Volte em ${Math.ceil((86400000-elapsed)/3600000)} hora(s).`,true);u.dailyStreak=elapsed<172800000?u.dailyStreak+1:1;const reward=100+Math.min(u.dailyStreak-1,7)*25;u.coins+=reward;u.lastDaily=Date.now();save();return reply(`🎁 Você recebeu **${reward} moedas**! Sequência: **${u.dailyStreak} dia(s)**.`);}
  if(name==="saldo") {const t=i.options.getUser("usuario")||me,p=user(t.id);return reply(`💰 **${t.username}**\nCarteira: **${fmt(p.coins)}**\nBanco: **${fmt(p.bank)}**\nTotal: **${fmt(p.coins+p.bank)}**`);}
  if(name==="trabalhar") {const left=cooldown(u,"lastWork",3600000);if(left)return reply(`⏳ Tente novamente em ${Math.ceil(left/60000)} min.`,true);const n=rand(40,120);u.coins+=n;save();return reply(`🧰 Você ganhou **${n} moedas** trabalhando.`);}
  if(name==="pagar") {const t=i.options.getUser("usuario"),n=i.options.getInteger("quantia");if(t.bot||t.id===me.id)return reply("❌ Escolha outra pessoa.",true);if(u.coins<n)return reply("❌ Saldo insuficiente na carteira.",true);u.coins-=n;user(t.id).coins+=n;save();return reply(`💸 ${me} enviou **${fmt(n)} moedas** para ${t}.`);}
  if(name==="depositar"||name==="sacar") {const n=i.options.getInteger("quantia");if(name==="depositar"){if(u.coins<n)return reply("❌ Saldo insuficiente.",true);u.coins-=n;u.bank+=n;}else{if(u.bank<n)return reply("❌ Saldo bancário insuficiente.",true);u.bank-=n;u.coins+=n;}save();return reply(`🏦 Operação concluída: **${fmt(n)} moedas**.`);}
  if(name==="top") {const rows=Object.entries(data.users).sort((a,b)=>(b[1].coins+b[1].bank)-(a[1].coins+a[1].bank)).slice(0,10);return i.reply({embeds:[em("🏆 Ranking YSIS MC",rows.map(([id,p],n)=>`**${n+1}.** <@${id}> — 💰 ${fmt(p.coins+p.bank)} | Nível ${level(p.xp)}`).join("\n")||"Ainda sem jogadores no ranking.")]});}
  if(name==="apostar") {const n=i.options.getInteger("quantia");if(u.coins<n)return reply("❌ Você não tem esse valor.",true);u.coins-=n;const win=Math.random()<.45;if(win)u.coins+=n*2;save();return reply(win?`🎉 Você ganhou **${fmt(n*2)} moedas**!`:`🎲 Você perdeu **${fmt(n)} moedas**.`);}
  if(name==="loja") return i.reply({embeds:[em("🛒 Loja do YSIS MC",Object.entries(shop).map(([k,v])=>`${v.emoji} **${v.name}** — ${v.price} moedas\n${v.desc}`).join("\n\n"))]});
  if(name==="comprar") {const k=i.options.getString("item"),it=shop[k];if(u.coins<it.price)return reply("❌ Moedas insuficientes.",true);if(it.unique&&u.inventory[k])return reply("❌ Você já possui esse item único.",true);u.coins-=it.price;u.inventory[k]=(u.inventory[k]||0)+1;save();return reply(`✅ Você comprou ${it.emoji} **${it.name}**.`);}
  if(name==="inventario") {const t=i.options.getUser("usuario")||me,p=user(t.id);return i.reply({embeds:[em(`🎒 Inventário de ${t.username}`,Object.entries(p.inventory).map(([k,n])=>`${itemName(k)} × **${n}**`).join("\n")||"Inventário vazio.")]});}
  if(name==="vender") {const k=i.options.getString("item"),n=i.options.getInteger("quantidade")||1,it=shop[k];if((u.inventory[k]||0)<n)return reply("❌ Você não tem essa quantidade.",true);u.inventory[k]-=n;if(!u.inventory[k])delete u.inventory[k];const total=it.sell*n;u.coins+=total;save();return reply(`💰 Você vendeu **${n}× ${it.name}** por **${fmt(total)} moedas**.`);}
  if(["pescar","aventura","minerar"].includes(name)) {const key={pescar:"lastFish",aventura:"lastAdventure",minerar:"lastMine"}[name],left=cooldown(u,key,name==="aventura"?3600000:300000);if(left)return reply(`⏳ Aguarde ${Math.ceil(left/60000)} min.`,true);const reward=rand(20,100);u.coins+=reward;let found="🧭 recursos";if(name==="pescar"){found="🐟 um peixe";u.inventory.peixe=(u.inventory.peixe||0)+1;}if(name==="minerar"){found=Math.random()<.25?"💎 um diamante":"⛏️ minérios";if(found.includes("diamante"))u.inventory.diamante=(u.inventory.diamante||0)+1;}if(name==="aventura")found=Math.random()<.2?"🔥 um fragmento de netherite":"🧭 recursos";save();return reply(`✨ Você encontrou ${found} e ganhou **${reward} moedas**.`);}
  if(name==="moeda")return reply(Math.random()<.5?"🪙 Deu **cara**!":"🪙 Deu **coroa**!");
  if(name==="dado")return reply(`🎲 Você tirou **${rand(1,6)}**.`);
  if(nam
