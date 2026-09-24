const configurations = require('../data/school-configurations.json');
const { validateSchoolConfiguration } = require('./schemas/school-configuration');

function getSchoolConfiguration(schoolId) {
  const configuration = configurations.find((item) => item.schoolId === schoolId);
  if (!configuration) throw new Error(`No configuration found for school ${schoolId}.`);
  validateSchoolConfiguration(configuration);
  return configuration;
}

function validateAllSchoolConfigurations() {
  configurations.forEach(validateSchoolConfiguration);
  return configurations.length;
}

module.exports = {
  configurations,
  getSchoolConfiguration,
  validateAllSchoolConfigurations
};
