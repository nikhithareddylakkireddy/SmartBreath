const SAFETY_NOTICE = 'SmartBreath provides environmental risk information and protective-action guidance. It does not diagnose medical conditions and is not an emergency dispatcher.';

const PROTECTIVE_ACTIONS = [
  'Move outdoor activities indoors when conditions are unsafe.',
  'Adjust filtered ventilation according to the institution plan.',
  'Restrict outdoor activity during elevated or critical particulate exposure.',
  'Use mask guidance only where appropriate and authorized by institution policy.',
  'Contact configured responsible school personnel for serious events.'
];

function assertEscalationContactsConfigured(config) {
  const contacts = (config.contacts || []).filter(
    (contact) => contact.type === 'escalation' && contact.enabled && contact.verifiedByInstitution === true
  );
  if (contacts.length === 0) {
    throw new Error('No institution-verified escalation contacts are configured.');
  }
  return contacts;
}

function formatProtectiveMessage(schoolName, risk, simulated = false) {
  const demoPrefix = simulated ? '[SIMULATED DEMO] ' : '';
  return `${demoPrefix}${schoolName} has ${risk} air-quality risk. Follow the school protective-action plan. ${SAFETY_NOTICE}`;
}

module.exports = {
  PROTECTIVE_ACTIONS,
  SAFETY_NOTICE,
  assertEscalationContactsConfigured,
  formatProtectiveMessage
};
