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
let db = { guilds: {}, warnings: [], actions: [] };
let writeQueue = Promise.resolve();

async function loadDb() {
  try {
    const raw = await fs.readFile(dataFile, 'utf8');
    const parsed = JSON.parse(raw);
    db = { ...db, ...parsed, guilds: parsed.guilds || {}, warnings: parsed.warnings || [], actions: parsed.actions || [] };
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
  return interaction.reply({ content: `⛔ ${message}`, ephemeral: true });
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
  if (interaction.deferred || interaction.replied) return interaction.followUp({ content, ephemeral: true });
  return interaction.reply({ content, ephemeral: true });
}

client.once(Events.ClientReady, c => console.log(`YSIS MC Administração online como ${c.user.tag}`));

client.on(Events.InteractionCreate, async interaction => {
  if (!interaction.isChatInputCommand() || !interaction.guild) return;
  try {
    const name = interaction.commandName;
    const adminOnly = ['configurar', 'cargo-set', 'cargo-remover', 'promover'];
    const modOnly = ['banir', 'expulsar', 'mutar', 'desmutar', 'limpar', 'aviso', 'avisar-privado', 'anunciar', 'historico'];
    if (adminOnly.includes(name) && !isAdmin(interaction)) return deny(interaction, 'Este comando é exclusivo da administração.');
    if (modOnly.includes(name) && !isModerator(interaction)) return deny(interaction, 'Este comando é exclusivo da moderação e administração.');

    if (name === 'configurar') {
      const cfg = settings(interaction.guildId);
      const mod = interaction.options.getRole('moderador');
      const admin = interaction.options.getRole('administrador');
      const logs = interaction.options.getChannel('canal-logs');
      const announcements = interaction.options.getChannel('canal-avisos');
      if (!mod && !admin && !logs && !announcements) {
        return safeReply(interaction, 'Indica pelo menos uma opção para alterar. Ex.: `/configurar moderador:@Moderador canal-logs:#logs`.');
      }
      if (mod) cfg.moderatorRoleId = mod.id;
      if (admin) cfg.adminRoleId = admin.id;
      if (logs) cfg.logChannelId = logs.id;
      if (announcements) cfg.announcementChannelId = announcements.id;
      await saveDb();
      return safeReply(interaction, '✅ Configuração guardada. As opções não indicadas foram mantidas.');
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
    if (interaction.deferred || interaction.replied) await interaction.followUp({ content: message, ephemeral: true }).catch(() => {});
    else await interaction.reply({ content: message, ephemeral: true }).catch(() => {});
  }
});

loadDb()
  .then(() => client.login(token))
  .catch(error => {
    console.error('Não foi possível carregar a base de dados:', error);
    process.exit(1);
  });
