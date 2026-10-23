require('dotenv').config();
const crypto = require('node:crypto');
const path = require('node:path');
const express = require('express');
const session = require('express-session');
const helmet = require('helmet');
const {
  Client, GatewayIntentBits, Partials, REST, Routes, Events,
  EmbedBuilder, ChannelType, PermissionsBitField, Colors,
} = require('discord.js');
const { commands } = require('./commands');
const { getGuildConfig, updateGuildConfig } = require('./storage');
const { canManageGuild } = require('./permissions');

const requiredEnv = ['DISCORD_TOKEN', 'DISCORD_CLIENT_ID', 'DISCORD_CLIENT_SECRET', 'DASHBOARD_URL', 'DISCORD_REDIRECT_URI', 'SESSION_SECRET'];
const missingEnv = requiredEnv.filter(key => !process.env[key]);
if (missingEnv.length) {
  console.error(`Faltam variáveis no .env: ${missingEnv.join(', ')}`);
  process.exit(1);
}

const app = express();
app.set('trust proxy', 1);
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"], scriptSrc: ["'self'", "'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'"], imgSrc: ["'self'", 'data:', 'https://cdn.discordapp.com'],
      connectSrc: ["'self'"], objectSrc: ["'none'"], frameAncestors: ["'none'"],
    },
  },
}));
app.use(express.json({ limit: '35kb' }));
app.use(session({
  name: 'ysis.sid', secret: process.env.SESSION_SECRET, resave: false, saveUninitialized: false,
  cookie: { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', maxAge: 7 * 24 * 60 * 60 * 1000 },
}));
app.use(express.static(path.join(__dirname, '..', 'public'), { index: false }));

const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers], partials: [Partials.GuildMember] });
const PORT = Number(process.env.PORT || 3000);
const DASHBOARD_URL = process.env.DASHBOARD_URL.replace(/\/$/, '');
const OAUTH_REDIRECT = process.env.DISCORD_REDIRECT_URI;
const cooldownState = new Map();

function jsonError(res, status, message) { return res.status(status).json({ error: message }); }
function isAdminInteraction(interaction, permission = 'ManageGuild') {
  const permissions = interaction.memberPermissions;
  return Boolean(permissions && (permissions.has(PermissionsBitField.Flags.Administrator) || permissions.has(PermissionsBitField.Flags[permission])));
}
async function audit(guild, title, description, color = Colors.Blurple) {
  try {
    const config = getGuildConfig(guild.id);
    if (!config.logChannelId) return;
    const channel = await guild.channels.fetch(config.logChannelId).catch(() => null);
    if (!channel || !channel.isTextBased()) return;
    await channel.send({ embeds: [new EmbedBuilder().setColor(color).setTitle(title).setDescription(description.slice(0, 4000)).setTimestamp()] });
  } catch (error) { console.error('Falha ao escrever log:', error.message); }
}
function normalizeChannel(c) {
  return { id: c.id, name: c.name, type: c.type, parentId: c.parentId || '', position: c.position };
}
async function getManagedGuild(req, res, guildId, permission = 'ManageGuild') {
  if (!req.session.user || !req.session.accessToken) { jsonError(res, 401, 'Entre com o Discord para continuar.'); return null; }
  const memberGuild = (req.session.guilds || []).find(g => g.id === guildId);
  if (!memberGuild || !canManageGuild(memberGuild, permission)) { jsonError(res, 403, 'Não tens permissão para administrar este servidor.'); return null; }
  const guild = client.guilds.cache.get(guildId);
  if (!guild) { jsonError(res, 404, 'O bot não está neste servidor. Adiciona o bot e atualiza a página.'); return null; }
  return guild;
}
function getUserGuild(req, guildId) { return (req.session.guilds || []).find(g => g.id === guildId); }
function requireLogin(req, res, next) {
  if (!req.session.user) return jsonError(res, 401, 'Entra com a tua conta Discord primeiro.');
  next();
}

app.get('/auth/discord', (req, res) => {
  const state = crypto.randomBytes(24).toString('hex');
  req.session.oauthState = state;
  const url = new URL('https://discord.com/oauth2/authorize');
  url.searchParams.set('client_id', process.env.DISCORD_CLIENT_ID);
  url.searchParams.set('redirect_uri', OAUTH_REDIRECT);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', 'identify guilds');
  url.searchParams.set('state', state);
  res.redirect(url.toString());
});

app.get('/auth/callback', async (req, res) => {
  try {
    const { code, state, error } = req.query;
    if (error) return res.redirect('/?auth=cancelled');
    if (!code || !state || state !== req.session.oauthState) return res.status(400).send('Autenticação inválida. Volta ao painel e tenta novamente.');
    delete req.session.oauthState;
    const tokenResponse = await fetch('https://discord.com/api/oauth2/token', {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_id: process.env.DISCORD_CLIENT_ID, client_secret: process.env.DISCORD_CLIENT_SECRET, grant_type: 'authorization_code', code: String(code), redirect_uri: OAUTH_REDIRECT }),
    });
    if (!tokenResponse.ok) throw new Error('Não foi possível validar o login do Discord.');
    const tokenData = await tokenResponse.json();
    const headers = { Authorization: `Bearer ${tokenData.access_token}` };
    const [userResponse, guildsResponse] = await Promise.all([
      fetch('https://discord.com/api/users/@me', { headers }),
      fetch('https://discord.com/api/users/@me/guilds', { headers }),
    ]);
    if (!userResponse.ok || !guildsResponse.ok) throw new Error('O Discord não devolveu os dados da conta.');
    const user = await userResponse.json();
    const guilds = await guildsResponse.json();
    req.session.user = { id: user.id, username: user.global_name || user.username, avatar: user.avatar, discriminator: user.discriminator };
    req.session.accessToken = tokenData.access_token;
    req.session.guilds = guilds.map(g => ({ id: g.id, name: g.name, icon: g.icon, owner: g.owner, permissions: g.permissions }));
    res.redirect('/');
  } catch (error) {
    console.error('OAuth:', error.message);
    res.status(500).send('Não foi possível entrar com o Discord. Confere o Client Secret e o Redirect URI nas variáveis do projeto.');
  }
});

app.get('/auth/logout', (req, res) => req.session.destroy(() => res.redirect('/')));
app.get('/api/me', (req, res) => res.json({ user: req.session.user || null }));
app.get('/api/guilds', requireLogin, (req, res) => {
  const available = (req.session.guilds || []).filter(g =>
    (g.owner || canManageGuild(g, 'ManageGuild')) && client.guilds.cache.has(g.id)
  ).map(g => ({ id: g.id, name: g.name, icon: g.icon, owner: g.owner }));
  res.json({ guilds: available });
});

app.get('/api/guilds/:guildId/overview', requireLogin, async (req, res) => {
  const guild = await getManagedGuild(req, res, req.params.guildId, 'ManageGuild'); if (!guild) return;
  try {
    const [roles, channels] = await Promise.all([guild.roles.fetch(), guild.channels.fetch()]);
    const config = getGuildConfig(guild.id);
    res.json({
      guild: { id: guild.id, name: guild.name, icon: guild.iconURL({ size: 128 }), memberCount: guild.memberCount },
      config,
      roles: [...roles.values()].filter(r => r.id !== guild.id).sort((a,b) => b.position-a.position).map(r => ({ id:r.id, name:r.name, color:r.hexColor, position:r.position, managed:r.managed })),
      channels: [...channels.values()].filter(Boolean).sort((a,b) => a.rawPosition-b.rawPosition).map(normalizeChannel),
    });
  } catch (e) { jsonError(res, 500, `Falha ao carregar servidor: ${e.message}`); }
});

app.put('/api/guilds/:guildId/rules', requireLogin, async (req, res) => {
  const guild = await getManagedGuild(req, res, req.params.guildId, 'ManageGuild'); if (!guild) return;
  const rulesText = String(req.body.rulesText || '').trim();
  const rulesChannelId = String(req.body.rulesChannelId || '');
  if (!rulesText || rulesText.length > 4000) return jsonError(res, 400, 'As regras devem ter entre 1 e 4000 caracteres.');
  if (rulesChannelId) {
    const channel = guild.channels.cache.get(rulesChannelId);
    if (!channel || channel.type !== ChannelType.GuildText) return jsonError(res, 400, 'Seleciona um canal de texto válido.');
  }
  const config = updateGuildConfig(guild.id, { rulesText, rulesChannelId });
  res.json({ ok: true, config });
});

app.post('/api/guilds/:guildId/rules/publish', requireLogin, async (req, res) => {
  const guild = await getManagedGuild(req, res, req.params.guildId, 'ManageGuild'); if (!guild) return;
  const config = getGuildConfig(guild.id);
  const channelId = String(req.body.channelId || config.rulesChannelId || '');
  const channel = guild.channels.cache.get(channelId);
  if (!channel || channel.type !== ChannelType.GuildText) return jsonError(res, 400, 'Escolhe um canal de texto para publicar as regras.');
  const me = guild.members.me;
  if (!me || !channel.permissionsFor(me).has([PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.EmbedLinks])) return jsonError(res, 403, 'O bot precisa de Ver canal, Enviar mensagens e Incorporar links nesse canal.');
  await channel.send({ embeds: [new EmbedBuilder().setColor(0x5865F2).setTitle('📜 Regras do YSIS MC').setDescription(config.rulesText).setFooter({ text: 'YSIS MC • Lê as regras antes de jogar' }).setTimestamp()] });
  updateGuildConfig(guild.id, { rulesChannelId: channel.id });
  await audit(guild, 'Regras publicadas', `As regras foram publicadas em ${channel}.`);
  res.json({ ok: true, message: `Regras publicadas em #${channel.name}.` });
});

app.post('/api/guilds/:guildId/roles', requireLogin, async (req, res) => {
  const guild = await getManagedGuild(req, res, req.params.guildId, 'ManageRoles'); if (!guild) return;
  const name = String(req.body.name || '').trim();
  const color = String(req.body.color || '').trim();
  if (!name || name.length > 100) return jsonError(res, 400, 'O nome do cargo deve ter entre 1 e 100 caracteres.');
  if (color && !/^#?[0-9a-fA-F]{6}$/.test(color)) return jsonError(res, 400, 'Usa uma cor hexadecimal, como #5865F2.');
  try {
    const options = { name, reason: `Criado pelo painel YSIS MC por ${req.session.user.username}` };
    if (color) options.color = parseInt(color.replace('#',''), 16);
    const role = await guild.roles.create(options);
    await audit(guild, 'Cargo criado', `Cargo ${role} criado pelo painel.`);
    res.json({ ok: true, role: { id: role.id, name: role.name, color: role.hexColor } });
  } catch (e) { jsonError(res, 400, `Não foi possível criar o cargo: ${e.message}`); }
});

app.delete('/api/guilds/:guildId/roles/:roleId', requireLogin, async (req, res) => {
  const guild = await getManagedGuild(req, res, req.params.guildId, 'ManageRoles'); if (!guild) return;
  try {
    const role = await guild.roles.fetch(req.params.roleId);
    if (!role || role.id === guild.id || role.managed) return jsonError(res, 400, 'Esse cargo não pode ser apagado pelo painel.');
    const me = guild.members.me;
    if (!me || role.position >= me.roles.highest.position) return jsonError(res, 403, 'O cargo está acima ou no mesmo nível do cargo do bot.');
    const name = role.name;
    await role.delete(`Apagado pelo painel YSIS MC por ${req.session.user.username}`);
    await audit(guild, 'Cargo apagado', `O cargo **${name}** foi apagado.`);
    res.json({ ok: true, message: `Cargo ${name} apagado.` });
  } catch (e) { jsonError(res, 400, `Não foi possível apagar o cargo: ${e.message}`); }
});

app.post('/api/guilds/:guildId/roles/assign', requireLogin, async (req, res) => {
  const guild = await getManagedGuild(req, res, req.params.guildId, 'ManageRoles'); if (!guild) return;
  const userId = String(req.body.userId || '').trim(); const roleId = String(req.body.roleId || '').trim();
  if (!/^\d{17,20}$/.test(userId) || !roleId) return jsonError(res, 400, 'Informa um ID de utilizador Discord válido e escolhe um cargo.');
  try {
    const [member, role] = await Promise.all([guild.members.fetch(userId), guild.roles.fetch(roleId)]);
    const me = guild.members.me;
    if (!role || role.managed || !me || role.position >= me.roles.highest.position) return jsonError(res, 403, 'O bot não pode gerir esse cargo. Coloca o cargo do bot acima dele.');
    await member.roles.add(role, `Atribuído pelo painel YSIS MC por ${req.session.user.username}`);
    await audit(guild, 'Cargo atribuído', `O cargo **${role.name}** foi atribuído a ${member.user.tag}.`);
    res.json({ ok: true, message: `Cargo ${role.name} atribuído a ${member.user.username}.` });
  } catch (e) { jsonError(res, 400, `Não foi possível atribuir o cargo: ${e.message}`); }
});

app.post('/api/guilds/:guildId/roles/remove', requireLogin, async (req, res) => {
  const guild = await getManagedGuild(req, res, req.params.guildId, 'ManageRoles'); if (!guild) return;
  const userId = String(req.body.userId || '').trim(); const roleId = String(req.body.roleId || '').trim();
  if (!/^\d{17,20}$/.test(userId) || !roleId) return jsonError(res, 400, 'Informa um ID de utilizador Discord válido e escolhe um cargo.');
  try {
    const [member, role] = await Promise.all([guild.members.fetch(userId), guild.roles.fetch(roleId)]);
    const me = guild.members.me;
    if (!role || role.managed || !me || role.position >= me.roles.highest.position) return jsonError(res, 403, 'O bot não pode gerir esse cargo. Coloca o cargo do bot acima dele.');
    await member.roles.remove(role, `Retirado pelo painel YSIS MC por ${req.session.user.username}`);
    await audit(guild, 'Cargo retirado', `O cargo **${role.name}** foi retirado de ${member.user.tag}.`);
    res.json({ ok: true, message: `Cargo ${role.name} retirado de ${member.user.username}.` });
  } catch (e) { jsonError(res, 400, `Não foi possível retirar o cargo: ${e.message}`); }
});

app.post('/api/guilds/:guildId/channels', requireLogin, async (req, res) => {
  const guild = await getManagedGuild(req, res, req.params.guildId, 'ManageChannels'); if (!guild) return;
  const name = String(req.body.name || '').trim().toLowerCase().replace(/\s+/g, '-');
  const typeName = String(req.body.type || 'texto'); const categoryId = String(req.body.categoryId || '');
  if (!name || name.length > 100) return jsonError(res, 400, 'Informa um nome de canal entre 1 e 100 caracteres.');
  const typeMap = { texto: ChannelType.GuildText, voz: ChannelType.GuildVoice, categoria: ChannelType.GuildCategory };
  const type = typeMap[typeName]; if (!type) return jsonError(res, 400, 'Tipo de canal inválido.');
  const category = categoryId ? guild.channels.cache.get(categoryId) : null;
  if (categoryId && (!category || category.type !== ChannelType.GuildCategory)) return jsonError(res, 400, 'A categoria selecionada não é válida.');
  try {
    const channel = await guild.channels.create({ name, type, ...(category && type !== ChannelType.GuildCategory ? { parent: category.id } : {}), reason: `Criado pelo painel YSIS MC por ${req.session.user.username}` });
    await audit(guild, 'Canal criado', `Canal ${channel} criado pelo painel.`);
    res.json({ ok: true, channel: normalizeChannel(channel) });
  } catch (e) { jsonError(res, 400, `Não foi possível criar o canal: ${e.message}`); }
});

app.delete('/api/guilds/:guildId/channels/:channelId', requireLogin, async (req, res) => {
  const guild = await getManagedGuild(req, res, req.params.guildId, 'ManageChannels'); if (!guild) return;
  try {
    const channel = await guild.channels.fetch(req.params.channelId);
    if (!channel) return jsonError(res, 404, 'Canal não encontrado.');
    const name = channel.name;
    await channel.delete(`Apagado pelo painel YSIS MC por ${req.session.user.username}`);
    const config = getGuildConfig(guild.id);
    const patch = {};
    if (config.rulesChannelId === channel.id) patch.rulesChannelId = '';
    if (config.logChannelId === channel.id) patch.logChannelId = '';
    if (Object.keys(patch).length) updateGuildConfig(guild.id, patch);
    await audit(guild, 'Canal apagado', `O canal **${name}** foi apagado.`);
    res.json({ ok: true, message: `Canal ${name} apagado.` });
  } catch (e) { jsonError(res, 400, `Não foi possível apagar o canal: ${e.message}`); }
});

app.patch('/api/guilds/:guildId/channels/:channelId', requireLogin, async (req, res) => {
  const guild = await getManagedGuild(req, res, req.params.guildId, 'ManageChannels'); if (!guild) return;
  const channel = guild.channels.cache.get(req.params.channelId);
  if (!channel) return jsonError(res, 404, 'Canal não encontrado.');
  try {
    if (req.body.name !== undefined) {
      const name = String(req.body.name).trim().toLowerCase().replace(/\s+/g, '-');
      if (!name || name.length > 100) return jsonError(res, 400, 'Nome inválido.');
      await channel.setName(name);
    }
    if (req.body.slowmode !== undefined) {
      if (channel.type !== ChannelType.GuildText) return jsonError(res, 400, 'O modo lento só funciona em canais de texto.');
      const slowmode = Number(req.body.slowmode);
      if (!Number.isInteger(slowmode) || slowmode < 0 || slowmode > 21600) return jsonError(res, 400, 'O modo lento deve ficar entre 0 e 21600 segundos.');
      await channel.setRateLimitPerUser(slowmode);
    }
    await audit(guild, 'Canal atualizado', `O canal <#${channel.id}> foi editado pelo painel.`);
    res.json({ ok: true, message: 'Canal atualizado.' });
  } catch (e) { jsonError(res, 400, `Não foi possível atualizar o canal: ${e.message}`); }
});

app.put('/api/guilds/:guildId/logs', requireLogin, async (req, res) => {
  const guild = await getManagedGuild(req, res, req.params.guildId, 'ManageGuild'); if (!guild) return;
  const channelId = String(req.body.channelId || '');
  if (channelId) {
    const channel = guild.channels.cache.get(channelId);
    if (!channel || channel.type !== ChannelType.GuildText) return jsonError(res, 400, 'Escolhe um canal de texto válido.');
  }
  updateGuildConfig(guild.id, { logChannelId: channelId });
  res.json({ ok: true, message: channelId ? 'Canal de registos atualizado.' : 'Registos desativados.' });
});

app.post('/api/guilds/:guildId/announcement', requireLogin, async (req, res) => {
  const guild = await getManagedGuild(req, res, req.params.guildId, 'ManageMessages'); if (!guild) return;
  const channelId = String(req.body.channelId || ''); const message = String(req.body.message || '').trim();
  const channel = guild.channels.cache.get(channelId);
  if (!channel || channel.type !== ChannelType.GuildText) return jsonError(res, 400, 'Escolhe um canal de texto válido.');
  if (!message || message.length > 4000) return jsonError(res, 400, 'O aviso deve ter entre 1 e 4000 caracteres.');
  try {
    const me = guild.members.me;
    if (!me || !channel.permissionsFor(me).has([PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.EmbedLinks])) return jsonError(res, 403, 'O bot precisa de permissão para enviar mensagens e incorporar links.');
    await channel.send({ embeds: [new EmbedBuilder().setColor(0x5865F2).setTitle('📢 Aviso • YSIS MC').setDescription(message).setFooter({ text: `Publicado por ${req.session.user.username}` }).setTimestamp()] });
    await audit(guild, 'Aviso publicado', `Um aviso foi publicado em ${channel}.`);
    res.json({ ok: true, message: `Aviso publicado em #${channel.name}.` });
  } catch (e) { jsonError(res, 400, `Não foi possível publicar: ${e.message}`); }
});

app.get(/^(?!\/api\/).*/, (req, res, next) => {
  if (req.path.startsWith('/api/')) return next();
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});
app.use((err, req, res, next) => {
  console.error(err);
  if (res.headersSent) return next(err);
  res.status(500).json({ error: 'Erro inesperado no painel.' });
});

client.once(Events.ClientReady, c => console.log(`Bot online: ${c.user.tag}`));
client.on(Events.InteractionCreate, async interaction => {
  if (!interaction.isChatInputCommand() || !interaction.guild) return;
  const guild = interaction.guild;
  const name = interaction.commandName;
  try {
    if (name === 'ajuda') {
      const e = new EmbedBuilder().setColor(0x5865F2).setTitle('YSIS MC • Comandos')
        .setDescription('**Regras**\n`/regras mostrar` · ver regras\n`/regras configurar` · definir texto (admin)\n`/regras publicar` · publicar regras (admin)\n`/regras canal` · escolher canal das regras (admin)\n\n**Cargos**\n`/cargo criar` · criar cargo (admin)\n`/cargo atribuir` · atribuir cargo (admin)\n`/cargo remover` · retirar cargo (admin)\n`/cargo apagar` · apagar cargo (admin)\n\n**Canais**\n`/canal criar` · criar texto, voz ou categoria\n`/canal apagar` · apagar canal\n`/canal renomear` · mudar nome\n`/canal lentidao` · configurar modo lento\n\n**Administração**\n`/aviso` · publicar aviso\n`/limpar` · apagar mensagens recentes\n`/logs definir` · escolher canal de registos\n`/logs ver` · ver configuração\n`/servidor` · informação do servidor\n`/painel` · link do painel (admin)');
      return interaction.reply({ embeds: [e], ephemeral: true });
    }
    if (name === 'painel') {
      if (!isAdminInteraction(interaction, 'ManageGuild')) return interaction.reply({ content: 'Precisas da permissão **Gerir servidor** para abrir o painel administrativo.', ephemeral: true });
      return interaction.reply({ content: `🔧 Painel administrativo do YSIS MC: ${DASHBOARD_URL}`, ephemeral: true });
    }
    if (name === 'servidor') {
      const e = new EmbedBuilder().setColor(0x5865F2).setTitle(guild.name).setThumbnail(guild.iconURL({ size: 256 }))
        .addFields({ name: 'Membros', value: String(guild.memberCount), inline: true }, { name: 'Canais', value: String(guild.channels.cache.size), inline: true }, { name: 'Cargos', value: String(guild.roles.cache.size - 1), inline: true });
      return interaction.reply({ embeds: [e], ephemeral: true });
    }
    if (name === 'regras') {
      const sub = interaction.options.getSubcommand();
      if (sub === 'mostrar') {
        const cfg = getGuildConfig(guild.id);
        return interaction.reply({ embeds: [new EmbedBuilder().setColor(0x5865F2).setTitle('📜 Regras do YSIS MC').setDescription(cfg.rulesText).setFooter({ text: 'YSIS MC • Respeita a comunidade' })], ephemeral: true });
      }
      if (!isAdminInteraction(interaction, 'ManageGuild')) return interaction.reply({ content: 'Precisas da permissão **Gerir servidor** para fazer isso.', ephemeral: true });
      if (sub === 'configurar') {
        const text = interaction.options.getString('texto', true);
        updateGuildConfig(guild.id, { rulesText: text });
        await audit(guild, 'Regras atualizadas', `As regras foram atualizadas por ${interaction.user.tag}.`);
        return interaction.reply({ content: '✅ Texto das regras atualizado. Usa `/regras publicar` para publicar no canal.', ephemeral: true });
      }
      const channel = interaction.options.getChannel('canal', true);
      if (sub === 'canal') {
        updateGuildConfig(guild.id, { rulesChannelId: channel.id });
        return interaction.reply({ content: `✅ Canal de regras definido para ${channel}.`, ephemeral: true });
      }
      if (sub === 'publicar') {
        if (channel.type !== ChannelType.GuildText) return interaction.reply({ content: 'Escolhe um canal de texto.', ephemeral: true });
        const cfg = getGuildConfig(guild.id);
        if (!channel.permissionsFor(guild.members.me).has([PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.EmbedLinks])) return interaction.reply({ content: 'O bot precisa de Ver canal, Enviar mensagens e Incorporar links.', ephemeral: true });
        await channel.send({ embeds: [new EmbedBuilder().setColor(0x5865F2).setTitle('📜 Regras do YSIS MC').setDescription(cfg.rulesText).setFooter({ text: 'YSIS MC • Lê as regras antes de jogar' }).setTimestamp()] });
        updateGuildConfig(guild.id, { rulesChannelId: channel.id });
        await audit(guild, 'Regras publicadas', `As regras foram publicadas em ${channel}.`);
        return interaction.reply({ content: `✅ Regras publicadas em ${channel}.`, ephemeral: true });
      }
    }
    if (name === 'cargo') {
      if (!isAdminInteraction(interaction, 'ManageRoles')) return interaction.reply({ content: 'Precisas da permissão **Gerir cargos** para fazer isso.', ephemeral: true });
      const sub = interaction.options.getSubcommand();
      const me = guild.members.me;
      if (sub === 'criar') {
        const roleName = interaction.options.getString('nome', true);
        const color = interaction.options.getString('cor');
        if (color && !/^#?[0-9a-fA-F]{6}$/.test(color)) return interaction.reply({ content: 'Usa uma cor hexadecimal, por exemplo `#5865F2`.', ephemeral: true });
        const options = { name: roleName, reason: `Criado por ${interaction.user.tag}` };
        if (color) options.color = parseInt(color.replace('#',''), 16);
        const role = await guild.roles.create(options);
        await audit(guild, 'Cargo criado', `Cargo ${role} criado por ${interaction.user.tag}.`);
        return interaction.reply({ content: `✅ Cargo ${role} criado.`, ephemeral: true });
      }
      const role = interaction.options.getRole('cargo', true);
      if (!role || role.managed || !me || role.position >= me.roles.highest.position) return interaction.reply({ content: 'O bot não pode gerir esse cargo. Coloca o cargo do bot acima dele.', ephemeral: true });
      if (sub === 'apagar') {
        const roleName = role.name; await role.delete(`Apagado por ${interaction.user.tag}`);
        await audit(guild, 'Cargo apagado', `O cargo **${roleName}** foi apagado.`);
        return interaction.reply({ content: `✅ Cargo **${roleName}** apagado.`, ephemeral: true });
      }
      const user = interaction.options.getUser('membro', true);
      const member = await guild.members.fetch(user.id);
      if (sub === 'atribuir') await member.roles.add(role, `Atribuído por ${interaction.user.tag}`);
      else await member.roles.remove(role, `Retirado por ${interaction.user.tag}`);
      await audit(guild, sub === 'atribuir' ? 'Cargo atribuído' : 'Cargo retirado', `Cargo **${role.name}** ${sub === 'atribuir' ? 'atribuído a' : 'retirado de'} ${user.tag}.`);
      return interaction.reply({ content: `✅ Cargo **${role.name}** ${sub === 'atribuir' ? 'atribuído a' : 'retirado de'} ${user.tag}.`, ephemeral: true });
    }
    if (name === 'canal') {
      if (!isAdminInteraction(interaction, 'ManageChannels')) return interaction.reply({ content: 'Precisas da permissão **Gerir canais** para fazer isso.', ephemeral: true });
      const sub = interaction.options.getSubcommand();
      if (sub === 'criar') {
        const channelName = interaction.options.getString('nome', true).trim().toLowerCase().replace(/\s+/g, '-');
        const typeValue = interaction.options.getString('tipo', true);
        const category = interaction.options.getChannel('categoria');
        const type = { texto: ChannelType.GuildText, voz: ChannelType.GuildVoice, categoria: ChannelType.GuildCategory }[typeValue];
        const channel = await guild.channels.create({ name: channelName, type, ...(category && type !== ChannelType.GuildCategory ? { parent: category.id } : {}), reason: `Criado por ${interaction.user.tag}` });
        await audit(guild, 'Canal criado', `Canal ${channel} criado por ${interaction.user.tag}.`);
        return interaction.reply({ content: `✅ Canal ${channel} criado.`, ephemeral: true });
      }
      if (sub === 'apagar') {
        const channel = interaction.options.getChannel('canal', true); const channelName = channel.name;
        await channel.delete(`Apagado por ${interaction.user.tag}`);
        const cfg = getGuildConfig(guild.id); const patch = {};
        if (cfg.rulesChannelId === channel.id) patch.rulesChannelId = '';
        if (cfg.logChannelId === channel.id) patch.logChannelId = '';
        if (Object.keys(patch).length) updateGuildConfig(guild.id, patch);
        await audit(guild, 'Canal apagado', `Canal **${channelName}** apagado por ${interaction.user.tag}.`);
        return interaction.reply({ content: `✅ Canal **${channelName}** apagado.`, ephemeral: true });
      }
      if (sub === 'renomear') {
        const channel = interaction.options.getChannel('canal', true); const newName = interaction.options.getString('nome', true).trim().toLowerCase().replace(/\s+/g, '-');
        await channel.setName(newName, `Renomeado por ${interaction.user.tag}`);
        await audit(guild, 'Canal renomeado', `O canal agora chama-se **${newName}**.`);
        return interaction.reply({ content: `✅ Canal renomeado para **${newName}**.`, ephemeral: true });
      }
      const channel = interaction.options.getChannel('canal', true); const seconds = interaction.options.getInteger('segundos', true);
      await channel.setRateLimitPerUser(seconds, `Modo lento alterado por ${interaction.user.tag}`);
      return interaction.reply({ content: seconds ? `✅ Modo lento definido para ${seconds} segundos em ${channel}.` : `✅ Modo lento desativado em ${channel}.`, ephemeral: true });
    }
    if (name === 'aviso') {
      if (!isAdminInteraction(interaction, 'ManageMessages')) return interaction.reply({ content: 'Precisas da permissão **Gerir mensagens** para publicar avisos.', ephemeral: true });
      const channel = interaction.options.getChannel('canal', true); const message = interaction.options.getString('mensagem', true);
      await channel.send({ embeds: [new EmbedBuilder().setColor(0x5865F2).setTitle('📢 Aviso • YSIS MC').setDescription(message).setFooter({ text: `Publicado por ${interaction.user.username}` }).setTimestamp()] });
      await audit(guild, 'Aviso publicado', `Aviso enviado para ${channel} por ${interaction.user.tag}.`);
      return interaction.reply({ content: `✅ Aviso publicado em ${channel}.`, ephemeral: true });
    }
    if (name === 'limpar') {
      if (!isAdminInteraction(interaction, 'ManageMessages')) return interaction.reply({ content: 'Precisas da permissão **Gerir mensagens** para limpar mensagens.', ephemeral: true });
      const amount = interaction.options.getInteger('quantidade', true); const channel = interaction.options.getChannel('canal') || interaction.channel;
      const deleted = await channel.bulkDelete(amount, true);
      await audit(guild, 'Mensagens apagadas', `${interaction.user.tag} apagou ${deleted.size} mensagens em ${channel}.`, Colors.Orange);
      return interaction.reply({ content: `🧹 Foram apagadas ${deleted.size} mensagens recentes em ${channel}. Mensagens com mais de 14 dias não são removidas por este comando.`, ephemeral: true });
    }
    if (name === 'logs') {
      const sub = interaction.options.getSubcommand();
      if (!isAdminInteraction(interaction, 'ManageGuild')) return interaction.reply({ content: 'Precisas da permissão **Gerir servidor** para configurar os registos.', ephemeral: true });
      const cfg = getGuildConfig(guild.id);
      if (sub === 'ver') {
        const channel = cfg.logChannelId ? guild.channels.cache.get(cfg.logChannelId) : null;
        return interaction.reply({ content: channel ? `📋 Os registos são enviados para ${channel}.` : '📋 Ainda não existe um canal de registos configurado.', ephemeral: true });
      }
      const channel = interaction.options.getChannel('canal', true);
      if (channel.type !== ChannelType.GuildText) return interaction.reply({ content: 'Escolhe um canal de texto.', ephemeral: true });
      updateGuildConfig(guild.id, { logChannelId: channel.id });
      return interaction.reply({ content: `✅ Registos configurados para ${channel}.`, ephemeral: true });
    }
  } catch (error) {
    console.error(`Erro no comando /${name}:`, error);
    const message = 'O comando falhou. Verifica as permissões do bot, a hierarquia dos cargos e as permissões do canal.';
    if (interaction.deferred || interaction.replied) await interaction.followUp({ content: message, ephemeral: true }).catch(() => {});
    else await interaction.reply({ content: message, ephemeral: true }).catch(() => {});
  }
});

app.listen(PORT, () => console.log(`Painel web iniciado na porta ${PORT}`));
client.login(process.env.DISCORD_TOKEN).catch(error => { console.error('Falha no login do bot:', error.message); process.exit(1); });
