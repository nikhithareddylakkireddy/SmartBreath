const { requireString, requireEnum, validate } = require('../validation');

const CONTACT_TYPES = ['schoolAdministrator', 'schoolStaff', 'parentGuardian', 'escalation'];

function validateContact(contact) {
  const errors = [];
  if (!contact || typeof contact !== 'object') return validate('Contact', ['contact must be an object']);

  requireString(contact.contactId, 'contactId', errors);
  requireString(contact.name, 'name', errors);
  requireEnum(contact.type, 'type', CONTACT_TYPES, errors);
  requireString(contact.channel, 'channel', errors);
  requireString(contact.destination, 'destination', errors);
  if (contact.type === 'escalation' && contact.verifiedByInstitution !== true) {
    errors.push('escalation contacts must be institution-verified');
  }
  if (typeof contact.enabled !== 'boolean') errors.push('enabled must be a boolean');

  return validate('Contact', errors);
}

function validateContacts(contacts) {
  if (!Array.isArray(contacts) || contacts.length === 0) {
    return validate('Contacts', ['contacts must be a non-empty array']);
  }
  contacts.forEach(validateContact);
  return true;
}

module.exports = { CONTACT_TYPES, validateContact, validateContacts };
