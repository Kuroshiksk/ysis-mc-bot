const {
  SlashCommandBuilder,
  ChannelType,
} = require('discord.js');

const textChannelOption = (option, name = 'canal') => option
  .setName(name)
  .setDescription('Canal de texto do servidor')
  .addChannelTypes(ChannelType.GuildText)
  .setRequired(true);

const commands = [
  new SlashCommandBuilder()
    .setName('regras')
    .setDescription('Consultar e administrar as regras do YSIS MC')
    .addSubcommand(s => s.setName('mostrar').setDescription('Ver as regras atuais do servidor'))
    .addSubcommand(s => s.setName('configurar').setDescription('Definir o texto das regras (admin)')
      .addStringOption(o => o.setName('texto').setDescription('Texto completo das regras (até 4000 caracteres)').setMaxLength(4000).setRequired(true)))
    .addSubcommand(s => s.setName('publicar').setDescription('Publicar as regras num canal (admin)')
      .addChannelOption(o => textChannelOption(o)))
    .addSubcommand(s => s.setName('canal').setDescription('Definir o canal padrão das regras (admin)')
      .addChannelOption(o => textChannelOption(o))),

  new SlashCommandBuilder()
    .setName('cargo')
    .setDescription('Gerir cargos do servidor')
    .addSubcommand(s => s.setName('criar').setDescription('Criar um cargo (admin)')
      .addStringOption(o => o.setName('nome').setDescription('Nome do novo cargo').setMaxLength(100).setRequired(true))
      .addStringOption(o => o.setName('cor').setDescription('Cor hexadecimal, por exemplo #5865F2').setRequired(false)))
    .addSubcommand(s => s.setName('atribuir').setDescription('Atribuir um cargo a um membro (admin)')
      .addUserOption(o => o.setName('membro').setDescription('Membro que vai receber o cargo').setRequired(true))
      .addRoleOption(o => o.setName('cargo').setDescription('Cargo a atribuir').setRequired(true)))
    .addSubcommand(s => s.setName('remover').setDescription('Retirar um cargo de um membro (admin)')
      .addUserOption(o => o.setName('membro').setDescription('Membro que vai perder o cargo').setRequired(true))
      .addRoleOption(o => o.setName('cargo').setDescription('Cargo a retirar').setRequired(true)))
    .addSubcommand(s => s.setName('apagar').setDescription('Apagar um cargo (admin)')
      .addRoleOption(o => o.setName('cargo').setDescription('Cargo a apagar').setRequired(true))),

  new SlashCommandBuilder()
    .setName('canal')
    .setDescription('Gerir canais do servidor')
    .addSubcommand(s => s.setName('criar').setDescription('Criar um canal (admin)')
      .addStringOption(o => o.setName('nome').setDescription('Nome do canal').setMaxLength(100).setRequired(true))
      .addStringOption(o => o.setName('tipo').setDescription('Tipo de canal').setRequired(true)
        .addChoices({ name: 'Texto', value: 'texto' }, { name: 'Voz', value: 'voz' }, { name: 'Categoria', value: 'categoria' }))
      .addChannelOption(o => o.setName('categoria').setDescription('Categoria onde criar o canal').addChannelTypes(ChannelType.GuildCategory).setRequired(false)))
    .addSubcommand(s => s.setName('apagar').setDescription('Apagar um canal (admin)')
      .addChannelOption(o => o.setName('canal').setDescription('Canal que será apagado').setRequired(true)))
    .addSubcommand(s => s.setName('renomear').setDescription('Renomear um canal (admin)')
      .addChannelOption(o => o.setName('canal').setDescription('Canal a renomear').setRequired(true))
      .addStringOption(o => o.setName('nome').setDescription('Novo nome').setMaxLength(100).setRequired(true)))
    .addSubcommand(s => s.setName('lentidao').setDescription('Definir o modo lento de um canal (admin)')
      .addChannelOption(o => o.setName('canal').setDescription('Canal de texto').addChannelTypes(ChannelType.GuildText).setRequired(true))
      .addIntegerOption(o => o.setName('segundos').setDescription('0 para desativar; máximo 21600').setMinValue(0).setMaxValue(21600).setRequired(true))),

  new SlashCommandBuilder()
    .setName('aviso')
    .setDescription('Enviar um aviso num canal (admin)')
    .addChannelOption(o => textChannelOption(o))
    .addStringOption(o => o.setName('mensagem').setDescription('Texto do aviso').setMaxLength(4000).setRequired(true)),

  new SlashCommandBuilder()
    .setName('limpar')
    .setDescription('Apagar mensagens recentes de um canal (admin)')
    .addIntegerOption(o => o.setName('quantidade').setDescription('Quantidade entre 1 e 100').setMinValue(1).setMaxValue(100).setRequired(true))
    .addChannelOption(o => o.setName('canal').setDescription('Canal onde limpar; se omitido, usa este canal').addChannelTypes(ChannelType.GuildText).setRequired(false)),

  new SlashCommandBuilder()
    .setName('logs')
    .setDescription('Configurar o canal de registos do servidor (admin)')
    .addSubcommand(s => s.setName('definir').setDescription('Escolher o canal de registos')
      .addChannelOption(o => textChannelOption(o)))
    .addSubcommand(s => s.setName('ver').setDescription('Ver o canal de registos atual')),

  new SlashCommandBuilder()
    .setName('painel')
    .setDescription('Receber o link do painel administrativo do YSIS MC'),

  new SlashCommandBuilder()
    .setName('servidor')
    .setDescription('Ver informações básicas do servidor'),

  new SlashCommandBuilder()
    .setName('ajuda')
    .setDescription('Ver a lista de comandos do YSIS MC'),
].map(command => command.toJSON());

module.exports = { commands };
