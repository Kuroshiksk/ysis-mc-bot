const { PermissionsBitField } = require('discord.js');

function isAllowed(userGuild, requiredPermission = 'ManageGuild') {
  if (!userGuild) return false;
  if (userGuild.owner) return true;
  try {
    const bits = BigInt(userGuild.permissions || '0');
    if ((bits & PermissionsBitField.Flags.Administrator) === PermissionsBitField.Flags.Administrator) return true;
    const flag = PermissionsBitField.Flags[requiredPermission];
    return typeof flag === 'bigint' && (bits & flag) === flag;
  } catch { return false; }
}

function canManageGuild(userGuild, requiredPermission = 'ManageGuild') {
  return isAllowed(userGuild, requiredPermission);
}
module.exports = { canManageGuild };
