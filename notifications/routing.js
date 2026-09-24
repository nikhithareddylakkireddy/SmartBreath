const { validateContacts } = require('../domain');

function routeRecipients(config, severity) {
  validateContacts(config.contacts);
  const channels = new Set(config.notificationSettings.channels || []);
  const types = severity === 'critical'
    ? ['schoolAdministrator', 'schoolStaff', 'parentGuardian', 'escalation']
    : ['schoolAdministrator', 'schoolStaff'];
  return config.contacts.filter((contact) =>
    types.includes(contact.type) &&
    contact.enabled === true &&
    channels.has(contact.channel) &&
    (contact.type !== 'escalation' || contact.verifiedByInstitution === true)
  ).map((contact) => ({
    contactId: contact.contactId,
    type: contact.type,
    channel: contact.channel,
    destination: contact.destination
  }));
}

module.exports = { routeRecipients };
