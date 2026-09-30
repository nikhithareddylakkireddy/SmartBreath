const { validateContacts } = require('../domain');

function routeRecipients(config, severity) {
  validateContacts(config.contacts);
  const channels = new Set(config.notificationSettings.channels || []);
  const types = severity === 'critical' || severity === 'high'
    ? ['schoolAdministrator', 'schoolStaff', 'parentGuardian', 'escalation']
    : ['schoolAdministrator', 'schoolStaff'];
  const standard = config.contacts.filter((contact) =>
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
  if (!['critical', 'high'].includes(severity) || config.notificationSettings.parentAlerts !== true) {
    return standard;
  }
  const parents = parentRoutingDecisions(config, severity)
    .filter((decision) => decision.allowed);
  return standard.concat(parents.flatMap(({ parent, channel }) => {
    const recipients = [];
    if (channel === 'email' && parent.emailEnabled && parent.email) recipients.push({
      contactId: parent.parentId,
      type: 'parentGuardian',
      channel: 'email',
      destination: parent.email,
      parentId: parent.parentId,
      studentReference: parent.studentReference
    });
    if (channel === 'whatsapp' && parent.whatsappEnabled && parent.phone) recipients.push({
      contactId: parent.parentId,
      type: 'parentGuardian',
      channel: 'whatsapp',
      destination: parent.phone,
      parentId: parent.parentId,
      studentReference: parent.studentReference
    });
    return recipients;
  }));
}

function parentRoutingDecisions(config, severity) {
  if (!['critical', 'high'].includes(severity) || config.notificationSettings.parentAlerts !== true) return [];
  return (config.parentContacts || []).map((parent) => {
    const decisions = [];
    for (const [channel, enabled] of [['email', parent.emailEnabled], ['whatsapp', parent.whatsappEnabled]]) {
      let reason = null;
      if (parent.schoolId !== config.schoolId) reason = 'school mismatch';
      else if (parent.active !== true) reason = 'contact inactive';
      else if (parent.verified !== true) reason = 'contact unverified';
      else if (parent.notificationConsent !== true) reason = 'notification consent disabled';
      else if (enabled !== true) reason = `parent ${channel} disabled`;
      else if (!(config.notificationSettings.channels || []).includes(channel)) {
        reason = `institution ${channel} channel disabled`;
      }
      decisions.push({ parent, channel, allowed: !reason, reason });
    }
    return decisions;
  }).flat();
}

module.exports = { routeRecipients, parentRoutingDecisions };
