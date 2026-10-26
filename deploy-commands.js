require('dotenv').config();
const { REST, Routes, SlashCommandBuilder, PermissionFlagsBits, ChannelType } = require('discord.js');

const commands = [
  new SlashCommandBuilder().setName('banir').setDescription('Bane um membro do servidor.')
    .addUserOption(o => o.setName('membro').setDescription('Membro a banir').setRequired(true))
    .addStringOption(o => o.setName('motivo').setDescription('Motivo do banimento').setMaxLength(500))
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers),

  new SlashCommandBuilder().setName('expulsar').setDescription('Expulsa um membro do servidor.')
    .addUserOption(o => o.setName('membro').setDescription('Membro a expulsar').setRequired(true))
    .addStringOption(o => o.setName('motivo').setDescription('Motivo da expulsão').setMaxLength(500))
    .setDefaultMemberPermissions(PermissionFlagsBits.KickMembers),

  new SlashCommandBuilder().setName('mutar').setDescription('Impede um membro de falar temporariamente.')
    .addUserOption(o => o.setName('membro').setDescription('Membro a mutar').setRequired(true))
    .addIntegerOption(o => o.setName('minutos').setDescription('Duração em minutos (1 a 40320)').setRequired(true).setMinValue(1).setMaxValue(40320))
    .addStringOption(o => o.setName('motivo').setDescription('Motivo').setMaxLength(500))
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),

  new SlashCommandBuilder().setName('desmutar').setDescription('Retira o mute temporário de um membro.')
    .addUserOption(o => o.setName('membro').setDescription('Membro a desmutar').setRequired(true))
    .addStringOption(o => o.setName('motivo').setDescription('Motivo').setMaxLength(500))
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),

  new SlashCommandBuilder().setName('limpar').setDescription('Apaga até 100 mensagens recentes deste canal.')
    .addIntegerOption(o => o.setName('quantidade').setDescription('Quantidade de mensagens (1 a 100)').setRequired(true).setMinValue(1).setMaxValue(100))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),

  new SlashCommandBuilder().setName('aviso').setDescription('Regista uma advertência para um membro.')
    .addUserOption(o => o.setName('membro').setDescription('Membro advertido').setRequired(true))
    .addStringOption(o => o.setName('motivo').setDescription('Motivo da advertência').setRequired(true).setMaxLength(500)),

  new SlashCommandBuilder().setName('avisar-privado').setDescription('Envia um aviso por mensagem privada.')
    .addUserOption(o => o.setName('membro').setDescription('Destinatário').setRequired(true))
    .addStringOption(o => o.setName('mensagem').setDescription('Texto do aviso').setRequired(true).setMaxLength(1800)),

  new SlashCommandBuilder().setName('anunciar').setDescription('Publica um anúncio num canal.')
    .addChannelOption(o => o.setName('canal').setDescription('Canal onde publicar').addChannelTypes(ChannelType.GuildText).setRequired(true))
    .addStringOption(o => o.setName('titulo').setDescription('Título do anúncio').setRequired(true).setMaxLength(200))
    .addStringOption(o => o.setName('mensagem').setDescription('Conteúdo do anúncio').setRequired(true).setMaxLength(3500)),

  new SlashCommandBuilder().setName('cargo-set').setDescription('Atribui um cargo a um membro.')
    .addUserOption(o => o.setName('membro').setDescription('Membro').setRequired(true))
    .addRoleOption(o => o.setName('cargo').setDescription('Cargo a atribuir').setRequired(true)),

  new SlashCommandBuilder().setName('cargo-remover').setDescription('Remove um cargo de um membro.')
    .addUserOption(o => o.setName('membro').setDescription('Membro').setRequired(true))
    .addRoleOption(o => o.setName('cargo').setDescription('Cargo a remover').setRequired(true)),

  new SlashCommandBuilder().setName('promover').setDescription('Atribui um cargo de promoção a um membro.')
    .addUserOption(o => o.setName('membro').setDescription('Membro').setRequired(true))
    .addRoleOption(o => o.setName('cargo').setDescription('Cargo da promoção').setRequired(true))
    .addStringOption(o => o.setName('motivo').setDescription('Motivo da promoção').setMaxLength(500)),

  new SlashCommandBuilder().setName('configurar').setDescription('Configura os cargos e canais do bot.')
    .addRoleOption(o => o.setName('moderador').setDescription('Cargo que pode usar comandos de moderação'))
    .addRoleOption(o => o.setName('administrador').setDescription('Cargo administrativo do bot'))
    .addChannelOption(o => o.setName('canal-logs').setDescription('Canal de registos').addChannelTypes(ChannelType.GuildText))
    .addChannelOption(o => o.setName('canal-avisos').setDescription('Canal padrão de avisos').addChannelTypes(ChannelType.GuildText))
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  new SlashCommandBuilder().setName('historico').setDescription('Consulta as advertências e ações registadas de um membro.')
    .addUserOption(o => o.setName('membro').setDescription('Membro').setRequired(true))
].map(c => c.toJSON());

async function main() {
  const token = process.env.DISCORD_TOKEN;
  const clientId = process.env.DISCORD_CLIENT_ID;
  const guildId = process.env.DISCORD_GUILD_ID;
  if (!token || !clientId || !guildId) {
    console.error('Faltam DISCORD_TOKEN, DISCORD_CLIENT_ID ou DISCORD_GUILD_ID nas variáveis de ambiente.');
    process.exit(1);
  }
  const rest = new REST({ version: '10' }).setToken(token);
  await rest.put(Routes.applicationGuildCommands(clientId, guildId), { body: commands });
  console.log(`Comandos registados no servidor ${guildId}.`);
}
main().catch(error => {
  console.error('Falha ao registar comandos:', error);
  process.exit(1);
});
