require('dotenv').config();
const fs = require('node:fs/promises');
const path = require('node:path');
const {
  Client, GatewayIntentBits, Events, PermissionFlagsBits, EmbedBuilder
} = require('discord.js');

const token = process.env.DISCORD_TOKEN;
if (!token) {
  console.error('A variável DISCORD_TOKEN não foi definida.');
  process.exit(1);
}

const dataFile = process.env.DATA_FILE || path.join(__dirname, 'data.json');
const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers] });
const ownerId = process.env.OWNER_ID;
const checkIntervalMs = Math.max(30000, Number(process.env.ATERNOS_CHECK_INTERVAL_MS || 60000));
let db = { guilds: {}, warnings: [], actions: [], players: {} };
let writeQueue = Promise.resolve();

async function loadDb() {
  try {
    const raw = await fs.readFile(dataFile, 'utf8');
    const parsed = JSON.parse(raw);
    db = { ...db, ...parsed, guilds: parsed.guilds || {}, warnings: parsed.warnings || [], actions: parsed.actions || [], players: parsed.players || {} };
  } catch (e) {
    if (e.code !== 'ENOENT') throw e;
    await saveDb();
  }
}
function saveDb() {
  writeQueue = writeQueue.then(async () => {
    await fs.mkdir(path.dirname(dataFile), { recursive: true });
    const temp = `${dataFile}.tmp`;
    await fs.writeFile(temp, JSON.stringify(db, null, 2), 'utf8');
    await fs.rename(temp, dataFile);
  });
  return writeQueue;
}
function settings(guildId) {
  if (!db.guilds[guildId]) db.guilds[guildId] = {};
  return db.guilds[guildId];
}
function record(guildId, actorId, targetId, type, reason) {
  db.actions.push({ guildId, actorId, targetId, type, reason: reason || 'Não informado', at: new Date().toISOString() });
  if (db.actions.length > 5000) db.actions = db.actions.slice(-5000);
}
function isAdmin(interaction) {
  const cfg = settings(interaction.guildId);
  return interaction.memberPermissions?.has(PermissionFlagsBits.Administrator) ||
    (cfg.adminRoleId && interaction.member.roles?.cache?.has(cfg.adminRoleId));
}
function isModerator(interaction) {
  const cfg = settings(interaction.guildId);
  return isAdmin(interaction) ||
    interaction.memberPermissions?.has(PermissionFlagsBits.BanMembers) ||
    interaction.memberPermissions?.has(PermissionFlagsBits.KickMembers) ||
    interaction.memberPermissions?.has(PermissionFlagsBits.ModerateMembers) ||
    interaction.memberPermissions?.has(PermissionFlagsBits.ManageMessages) ||
    (cfg.moderatorRoleId && interaction.member.roles?.cache?.has(cfg.moderatorRoleId));
}
async function deny(interaction, message = 'Não tens permissão para usar este comando.') {
  return safeReply(interaction, `⛔ ${message}`);
}
async function logAction(interaction, title, description) {
  const channelId = settings(interaction.guildId).logChannelId;
  if (!channelId) return;
  const channel = await interaction.guild.channels.fetch(channelId).catch(() => null);
  if (!channel?.isTextBased()) return;
  const embed = new EmbedBuilder().setColor(0x5865F2).setTitle(title).setDescription(description).setTimestamp();
  await channel.send({ embeds: [embed] }).catch(() => {});
}
async function fetchTarget(interaction, user) {
  return interaction.guild.members.fetch(user.id).catch(() => null);
}
function canActOn(interaction, target) {
  if (!target) return 'Não consegui encontrar esse membro no servidor.';
  if (target.id === interaction.user.id) return 'Não podes aplicar esta ação a ti próprio.';
  if (target.id === interaction.guild.ownerId) return 'Não podes aplicar esta ação ao dono do servidor.';
  const actor = interaction.member;
  if (actor.id !== interaction.guild.ownerId && actor.roles.highest.comparePositionTo(target.roles.highest) <= 0) {
    return 'O cargo do alvo é igual ou superior ao teu.';
  }
  const botMember = interaction.guild.members.me;
  if (!botMember || botMember.roles.highest.comparePositionTo(target.roles.highest) <= 0) {
    return 'O cargo do bot precisa de estar acima do cargo do membro.';
  }
  return null;
}
async function safeReply(interaction, content) {
  if (interaction.deferred || interaction.replied) return interaction.editReply(content);
  return interaction.reply({ content, ephemeral: true });
}

function playerData(userId) {
  if (!db.players[userId]) db.players[userId] = { coins: 0, xp: 0, pets: [] };
  return db.players[userId];
}
function isOwner(interaction) { return Boolean(ownerId && interaction.user.id === ownerId); }
function serverAddress(guildId) { return settings(guildId).minecraftAddress || process.env.MINECRAFT_SERVER_ADDRESS || ''; }
function parseAddress(raw) {
  const value = String(raw || '').trim().replace(/^https?:\/\//i, '').replace(/\/$/, '');
  if (!value) return null;
  const parts = value.split(':');
  if (parts.length > 2) return { host: value, port: 25565, display: value };
  return { host: parts[0], port: parts[1] ? Number(parts[1]) : 25565, display: value };
}
async function queryMinecraft(raw) {
  const parsed = parseAddress(raw);
  if (!parsed || !parsed.host || !Number.isInteger(parsed.port) || parsed.port < 1 || parsed.port > 65535) return { configured: false };
  const url = `https://api.mcsrvstat.us/3/${encodeURIComponent(parsed.host)}${parsed.port !== 25565 ? `:${parsed.port}` : ''}`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(10000), headers: { 'User-Agent': 'YSIS-MC-Discord-Bot/1.0' } });
    if (!res.ok) return { configured: true, online: false, error: `Consulta falhou (HTTP ${res.status}).`, address: parsed };
    const data = await res.json();
    return { configured: true, online: Boolean(data.online), players: data.players?.online ?? 0, max: data.players?.max ?? 0, version: data.version || 'Desconhecida', address: parsed };
  } catch { return { configured: true, online: false, error: 'Não foi possível consultar o servidor neste momento.', address: parsed }; }
}
async function sendStatusNotice(guild, cfg, status) {
  if (!cfg.statusChannelId) return;
  const channel = await guild.channels.fetch(cfg.statusChannelId).catch(() => null);
  if (!channel?.isTextBased()) return;
  const embed = new EmbedBuilder().setColor(0x35C46A).setTitle('🟢 YSIS MC está online!').setDescription('O servidor Minecraft ficou online. Já podes entrar e jogar com os teus amigos.').addFields({name:'IP',value:status.address.display,inline:true},{name:'Jogadores',value:`${status.players}/${status.max || '?'}`,inline:true},{name:'Versão',value:String(status.version).slice(0,100),inline:true}).setTimestamp();
  await channel.send({embeds:[embed], allowedMentions:{parse:[]}}).catch(e=>console.error('Falha ao enviar aviso Aternos:',e.message));
}
async function monitorServers() {
  for (const guild of client.guilds.cache.values()) {
    const cfg = settings(guild.id); const raw = serverAddress(guild.id); if (!raw || !cfg.statusChannelId) continue;
    const status = await queryMinecraft(raw);
    if (!status.configured) continue;
    const wasOnline = cfg.lastServerOnline === true;
    if (status.online && !wasOnline) await sendStatusNotice(guild, cfg, status);
    cfg.lastServerOnline = status.online;
    cfg.lastServerCheck = new Date().toISOString();
    await saveDb().catch(e=>console.error('Falha ao guardar estado Aternos:',e.message));
  }
}
client.on(Events.GuildMemberAdd, async member => {
  const cfg = settings(member.guild.id);
  if (cfg.welcomeChannelId) {
    const ch = await member.guild.channels.fetch(cfg.welcomeChannelId).catch(()=>null);
    if (ch?.isTextBased()) await ch.send({embeds:[new EmbedBuilder().setColor(0x35C46A).setTitle('👋 Bem-vindo ao YSIS MC!').setDescription(`Olá ${member}, sê bem-vindo ao servidor! Lê as regras e prepara-te para começar a tua história.`).setThumbnail(member.user.displayAvatarURL()).setFooter({text:`Membro nº ${member.guild.memberCount}`}).setTimestamp()],allowedMentions:{users:[member.id]}}).catch(()=>{});
  }
});
client.on(Events.GuildMemberRemove, async member => {
  const cfg = settings(member.guild.id); if (!cfg.goodbyeChannelId) return;
  const ch = await member.guild.channels.fetch(cfg.goodbyeChannelId).catch(()=>null);
  if (ch?.isTextBased()) await ch.send({embeds:[new EmbedBuilder().setColor(0x747F8D).setTitle('👋 Até à próxima!').setDescription(`**${member.user.tag}** saiu do YSIS MC.`).setTimestamp()],allowedMentions:{parse:[]}}).catch(()=>{});
});
client.once(Events.ClientReady, c => console.log(`YSIS MC Administração online como ${c.user.tag}`));

client.on(Events.InteractionCreate, async interaction => {
  if (!interaction.isChatInputCommand() || !interaction.guild) return;
  try {
    // Acknowledge immediately so Discord does not time out while the command runs.
    await interaction.deferReply({ ephemeral: true });
    const name = interaction.commandName;
    const ownerCommands = ['setar-moedas','adicionar-moedas','remover-moedas','setar-xp','adicionar-xp','remover-xp','setar-pet'];
    if (ownerCommands.includes(name)) {
      if (!isOwner(interaction)) return deny(interaction, 'Este comando é exclusivo do dono do bot. Configura OWNER_ID no Railway com o teu ID de utilizador do Discord.');
      const user = interaction.options.getUser('membro', true); const amount = interaction.options.getInteger('quantidade'); const p = playerData(user.id);
      if (name.endsWith('moedas')) {
        if (name === 'setar-moedas') p.coins = amount;
        if (name === 'adicionar-moedas') p.coins += amount;
        if (name === 'remover-moedas') p.coins = Math.max(0, p.coins - amount);
        record(interaction.guildId, interaction.user.id, user.id, name, `Saldo: ${p.coins} moedas`);
        await saveDb(); await logAction(interaction, `/${name}`, `**Jogador:** <@${user.id}>\n**Saldo:** ${p.coins} moedas\n**Dono:** <@${interaction.user.id}>`);
        return safeReply(interaction, `✅ Saldo local de ${user.tag}: **${p.coins} moedas**. Nota: este saldo só sincroniza com o RPG se ambos usarem a mesma base de dados.`);
      }
      if (name.endsWith('-xp')) {
        if (name === 'setar-xp') p.xp = amount;
        if (name === 'adicionar-xp') p.xp += amount;
        if (name === 'remover-xp') p.xp = Math.max(0, p.xp - amount);
        record(interaction.guildId, interaction.user.id, user.id, name, `XP: ${p.xp}`); await saveDb();
        await logAction(interaction, `/${name}`, `**Jogador:** <@${user.id}>\n**XP:** ${p.xp}\n**Dono:** <@${interaction.user.id}>`);
        return safeReply(interaction, `✅ XP local de ${user.tag}: **${p.xp}**. Para aparecer no RPG, é necessária base de dados partilhada.`);
      }
      const pet = interaction.options.getString('pet', true); p.pets.push({ name: pet, at: new Date().toISOString(), by: interaction.user.id });
      record(interaction.guildId, interaction.user.id, user.id, name, `Pet: ${pet}`); await saveDb();
      await logAction(interaction, '/setar-pet', `**Jogador:** <@${user.id}>\n**Pet:** ${pet}\n**Dono:** <@${interaction.user.id}>`);
      return safeReply(interaction, `✅ Pet **${pet}** registado para ${user.tag}. A integração com o inventário do RPG depende da base de dados partilhada.`);
    }
    const adminOnly = ['configurar', 'cargo-set', 'cargo-remover', 'promover'];
    const modOnly = ['banir', 'expulsar', 'mutar', 'desmutar', 'limpar', 'aviso', 'avisar-privado', 'anunciar', 'historico'];
    if (adminOnly.includes(name) && !isAdmin(interaction)) return deny(interaction, 'Este comando é exclusivo da administração.');
    if (modOnly.includes(name) && !isModerator(interaction)) return deny(interaction, 'Este comando é exclusivo da moderação e administração.');

    if (name === 'painel-admin') {
      const embed = new EmbedBuilder().setColor(0x5865F2).setTitle('YSIS MC • Painel de administração').setDescription('Configura os sistemas com `/configurar` e usa os comandos abaixo.').addFields(
        {name:'👋 Comunidade',value:'`/configurar canal-boas-vindas canal-despedidas`',inline:false},
        {name:'📢 Comunicação',value:'`/configurar canal-avisos canal-anuncios canal-logs`',inline:false},
        {name:'🛒 Loja',value:'`/configurar canal-loja` e `/publicar-loja`',inline:false},
        {name:'⛏️ Aternos',value:'`/configurar canal-status ip-servidor`\n`/status-servidor` e `/ip-servidor`',inline:false},
        {name:'👑 Dono',value:'`/setar-moedas`, `/adicionar-moedas`, `/remover-moedas`, `/setar-xp`, `/adicionar-xp`, `/remover-xp`, `/setar-pet`',inline:false}
      ).setFooter({text:'Os comandos do dono exigem OWNER_ID no Railway.'});
      return safeReply(interaction, { embeds: [embed] });
    }
    if (name === 'ip-servidor' || name === 'enviar-ip') {
      if (name === 'enviar-ip' && !isAdmin(interaction) && !isOwner(interaction)) return deny(interaction, 'Só a administração pode enviar o IP a outro membro.');
      const recipient = name === 'ip-servidor' ? interaction.user : interaction.options.getUser('membro', true);
      const raw = serverAddress(interaction.guildId);
      if (!raw) return deny(interaction, 'O IP ainda não foi configurado. Um administrador deve usar `/configurar ip-servidor`.');
      const parsed = parseAddress(raw); const sent = await recipient.send({embeds:[new EmbedBuilder().setColor(0x5865F2).setTitle('⛏️ YSIS MC — Dados do servidor').setDescription('Usa estes dados para entrar no Minecraft.').addFields({name:'IP / Endereço',value:parsed.display},{name:'Porta',value:String(parsed.port),inline:true}).setFooter({text:'YSIS MC'})]}).then(()=>true).catch(()=>false);
      return safeReply(interaction, sent ? `✅ Dados enviados por mensagem privada a ${recipient.tag}.` : 'Não consegui enviar a mensagem privada. A pessoa precisa permitir DMs do servidor.');
    }
    if (name === 'status-servidor') {
      const raw = serverAddress(interaction.guildId); if (!raw) return deny(interaction, 'Configura primeiro o IP com `/configurar ip-servidor`.');
      const status = await queryMinecraft(raw);
      if (!status.configured) return interaction.editReply('Não consegui interpretar o endereço configurado. Usa host ou host:porta.');
      if (!status.online) return interaction.editReply(`🔴 O servidor parece estar **offline** ou não respondeu à consulta. Endereço: ${raw}. O Aternos pode demorar a responder.`);
      return interaction.editReply({embeds:[new EmbedBuilder().setColor(0x35C46A).setTitle('🟢 YSIS MC está online').addFields({name:'IP',value:status.address.display,inline:true},{name:'Jogadores',value:`${status.players}/${status.max || '?'}`,inline:true},{name:'Versão',value:String(status.version).slice(0,100),inline:true}).setTimestamp()]});
    }
    if (name === 'publicar-loja') {
      if (!isAdmin(interaction) && !isOwner(interaction)) return deny(interaction, 'Só a administração pode publicar produtos.');
      const cfg = settings(interaction.guildId); const channelId = cfg.storeChannelId; if (!channelId) return deny(interaction, 'Configura o canal da loja com `/configurar canal-loja`.');
      const channel = await interaction.guild.channels.fetch(channelId).catch(()=>null); if (!channel?.isTextBased()) return deny(interaction, 'O canal da loja configurado não está disponível.');
      const product = interaction.options.getString('produto',true), price = interaction.options.getString('preco',true), details = interaction.options.getString('detalhes') || 'Consulta a administração para mais informações.', link = interaction.options.getString('link');
      const embed = new EmbedBuilder().setColor(0xF1C40F).setTitle(`🛒 ${product}`).setDescription(details).addFields({name:'Preço',value:price}).setFooter({text:'YSIS MC • Loja'}).setTimestamp(); if (link && /^https?:\/\//i.test(link)) embed.addFields({name:'Comprar / consultar',value:link});
      await channel.send({embeds:[embed],allowedMentions:{parse:[]}}); record(interaction.guildId,interaction.user.id,null,'publicar-loja',product); await saveDb(); return safeReply(interaction, `✅ Produto **${product}** publicado em ${channel}.`);
    }

    if (name === 'configurar') {
      const cfg = settings(interaction.guildId);
      const mod = interaction.options.getRole('moderador');
      const admin = interaction.options.getRole('administrador');
      const logs = interaction.options.getChannel('canal-logs');
      const announcements = interaction.options.getChannel('canal-avisos');
      const welcome = interaction.options.getChannel('canal-boas-vindas');
      const goodbye = interaction.options.getChannel('canal-despedidas');
      const news = interaction.options.getChannel('canal-anuncios');
      const store = interaction.options.getChannel('canal-loja');
      const statusChannel = interaction.options.getChannel('canal-status');
      const ip = interaction.options.getString('ip-servidor');
      if (!mod && !admin && !logs && !announcements && !welcome && !goodbye && !news && !store && !statusChannel && !ip) {
        return safeReply(interaction, 'Indica pelo menos uma opção para alterar. Ex.: `/configurar moderador:@Moderador canal-logs:#logs`.');
      }
      if (mod) cfg.moderatorRoleId = mod.id;
      if (admin) cfg.adminRoleId = admin.id;
      if (logs) cfg.logChannelId = logs.id;
      if (announcements) cfg.announcementChannelId = announcements.id;
      if (welcome) cfg.welcomeChannelId = welcome.id;
      if (goodbye) cfg.goodbyeChannelId = goodbye.id;
      if (news) cfg.newsChannelId = news.id;
      if (store) cfg.storeChannelId = store.id;
      if (statusChannel) cfg.statusChannelId = statusChannel.id;
      if (ip) { cfg.minecraftAddress = ip.trim(); cfg.lastServerOnline = false; }
      await saveDb();
      return safeReply(interaction, '✅ Configuração guardada. O monitor Aternos verifica periodicamente o endereço configurado.');
    }

    if (name === 'banir' || name === 'expulsar' || name === 'mutar' || name === 'desmutar') {
      const user = interaction.options.getUser('membro', true);
      const target = await fetchTarget(interaction, user);
      const problem = canActOn(interaction, target);
      if (problem) return deny(interaction, problem);
      const reason = interaction.options.getString('motivo') || 'Não informado';
      if (name === 'banir') {
        if (!interaction.memberPermissions.has(PermissionFlagsBits.BanMembers)) return deny(interaction, 'Precisas da permissão Ban Members.');
        await target.ban({ reason: `${interaction.user.tag}: ${reason}` });
      } else if (name === 'expulsar') {
        if (!interaction.memberPermissions.has(PermissionFlagsBits.KickMembers)) return deny(interaction, 'Precisas da permissão Kick Members.');
        await target.kick(`${interaction.user.tag}: ${reason}`);
      } else if (name === 'mutar') {
        if (!interaction.memberPermissions.has(PermissionFlagsBits.ModerateMembers)) return deny(interaction, 'Precisas da permissão Moderate Members.');
        const minutes = interaction.options.getInteger('minutos', true);
        await target.timeout(minutes * 60 * 1000, `${interaction.user.tag}: ${reason}`);
      } else {
        if (!interaction.memberPermissions.has(PermissionFlagsBits.ModerateMembers)) return deny(interaction, 'Precisas da permissão Moderate Members.');
        await target.timeout(null, `${interaction.user.tag}: ${reason}`);
      }
      record(interaction.guildId, interaction.user.id, user.id, name, reason);
      await saveDb();
      await logAction(interaction, `/${name}`, `**Membro:** <@${user.id}>\n**Responsável:** <@${interaction.user.id}>\n**Motivo:** ${reason}`);
      return safeReply(interaction, `✅ Ação \`/${name}\` aplicada a ${user.tag}.`);
    }

    if (name === 'limpar') {
      if (!interaction.memberPermissions.has(PermissionFlagsBits.ManageMessages)) return deny(interaction, 'Precisas da permissão Manage Messages.');
      const count = interaction.options.getInteger('quantidade', true);
      const messages = await interaction.channel.bulkDelete(count, true);
      record(interaction.guildId, interaction.user.id, null, 'limpar', `${messages.size} mensagens`);
      await saveDb();
      await logAction(interaction, '/limpar', `**Responsável:** <@${interaction.user.id}>\n**Mensagens apagadas:** ${messages.size}\n**Canal:** <#${interaction.channelId}>`);
      return safeReply(interaction, `🧹 Apagadas ${messages.size} mensagens recentes. Mensagens com mais de 14 dias não podem ser apagadas em massa.`);
    }

    if (name === 'aviso') {
      const user = interaction.options.getUser('membro', true);
      const reason = interaction.options.getString('motivo', true);
      const item = { guildId: interaction.guildId, userId: user.id, actorId: interaction.user.id, reason, at: new Date().toISOString() };
      db.warnings.push(item);
      record(interaction.guildId, interaction.user.id, user.id, 'aviso', reason);
      await saveDb();
      const target = await interaction.guild.members.fetch(user.id).catch(() => null);
      if (target) await target.send(`⚠️ Recebeste uma advertência no servidor **${interaction.guild.name}**.\nMotivo: ${reason}`).catch(() => {});
      await logAction(interaction, '/aviso', `**Membro:** <@${user.id}>\n**Responsável:** <@${interaction.user.id}>\n**Motivo:** ${reason}`);
      return safeReply(interaction, `⚠️ Advertência registada para ${user.tag}. A mensagem privada pode não ter sido entregue.`);
    }

    if (name === 'avisar-privado') {
      const user = interaction.options.getUser('membro', true);
      const message = interaction.options.getString('mensagem', true);
      const sent = await user.send(`📩 **Mensagem da administração do ${interaction.guild.name}**\n\n${message}`).then(() => true).catch(() => false);
      record(interaction.guildId, interaction.user.id, user.id, 'avisar-privado', message);
      await saveDb();
      await logAction(interaction, '/avisar-privado', `**Destinatário:** <@${user.id}>\n**Responsável:** <@${interaction.user.id}>\n**Entregue:** ${sent ? 'Sim' : 'Não; mensagens privadas fechadas'}`);
      return safeReply(interaction, sent ? `✅ Mensagem enviada a ${user.tag}.` : 'Não foi possível enviar. O membro pode ter as mensagens privadas fechadas.');
    }

    if (name === 'anunciar') {
      const channel = interaction.options.getChannel('canal', true);
      const title = interaction.options.getString('titulo', true);
      const message = interaction.options.getString('mensagem', true);
      const embed = new EmbedBuilder().setColor(0x5865F2).setTitle(title).setDescription(message).setFooter({ text: `YSIS MC • publicado por ${interaction.user.tag}` }).setTimestamp();
      await channel.send({ embeds: [embed], allowedMentions: { parse: [] } });
      record(interaction.guildId, interaction.user.id, null, 'anunciar', `${title}: ${message}`);
      await saveDb();
      await logAction(interaction, '/anunciar', `**Responsável:** <@${interaction.user.id}>\n**Canal:** <#${channel.id}>\n**Título:** ${title}`);
      return safeReply(interaction, `📣 Anúncio publicado em ${channel}.`);
    }

    if (name === 'cargo-set' || name === 'cargo-remover' || name === 'promover') {
      const user = interaction.options.getUser('membro', true);
      const role = interaction.options.getRole('cargo', true);
      const target = await fetchTarget(interaction, user);
      const problem = canActOn(interaction, target);
      if (problem) return deny(interaction, problem);
      if (role.managed || role.id === interaction.guild.id) return deny(interaction, 'Esse cargo não pode ser atribuído manualmente.');
      if (interaction.guild.members.me.roles.highest.comparePositionTo(role) <= 0) return deny(interaction, 'O cargo do bot precisa estar acima do cargo escolhido.');
      if (interaction.member.id !== interaction.guild.ownerId && interaction.member.roles.highest.comparePositionTo(role) <= 0) return deny(interaction, 'Não podes gerir um cargo igual ou superior ao teu.');
      if (!interaction.memberPermissions.has(PermissionFlagsBits.ManageRoles)) return deny(interaction, 'Precisas da permissão Manage Roles.');
      if (name === 'cargo-remover') await target.roles.remove(role);
      else await target.roles.add(role);
      const reason = name === 'promover' ? (interaction.options.getString('motivo') || 'Promoção') : name;
      record(interaction.guildId, interaction.user.id, user.id, name, `${role.name} — ${reason}`);
      await saveDb();
      await logAction(interaction, `/${name}`, `**Membro:** <@${user.id}>\n**Cargo:** <@&${role.id}>\n**Responsável:** <@${interaction.user.id}>\n**Motivo:** ${reason}`);
      return safeReply(interaction, `✅ ${name === 'cargo-remover' ? 'Cargo removido de' : name === 'promover' ? 'Promoção aplicada a' : 'Cargo atribuído a'} ${user.tag}: ${role.name}.`);
    }

    if (name === 'historico') {
      const user = interaction.options.getUser('membro', true);
      const warnings = db.warnings.filter(w => w.guildId === interaction.guildId && w.userId === user.id).slice(-10);
      const actions = db.actions.filter(a => a.guildId === interaction.guildId && a.targetId === user.id).slice(-10);
      const lines = [];
      warnings.forEach(w => lines.push(`⚠️ Advertência — ${new Date(w.at).toLocaleString('pt-BR')} — ${w.reason} (por <@${w.actorId}>)`));
      actions.forEach(a => lines.push(`• ${a.type} — ${new Date(a.at).toLocaleString('pt-BR')} — ${a.reason} (por <@${a.actorId}>)`));
      return safeReply(interaction, lines.length ? `**Histórico de ${user.tag}**\n${lines.join('\n').slice(0, 1850)}` : `Não há registos guardados para ${user.tag}.`);
    }
  } catch (error) {
    console.error(`Erro no comando /${interaction.commandName}:`, error);
    const message = 'Ocorreu um erro. Confirma as permissões do bot e os registos do Railway.';
    if (interaction.deferred || interaction.replied) await interaction.editReply({ content: message }).catch(() => {});
    else await interaction.reply({ content: message, ephemeral: true }).catch(() => {});
  }
});

loadDb()
  .then(() => client.login(token))
  .catch(error => {
    console.error('Não foi possível carregar a base de dados:', error);
    process.exit(1);
  });

client.on(Events.ClientReady, () => { setTimeout(() => monitorServers().catch(console.error), 15000); setInterval(() => monitorServers().catch(console.error), checkIntervalMs); });
