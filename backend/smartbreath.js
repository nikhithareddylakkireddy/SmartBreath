const schools = require('../data/schools.json');

function normalizeAqi(aqi) {
  if (aqi >= 151) return 'severe';
  if (aqi >= 101) return 'high';
  if (aqi >= 81) return 'moderate';
  if (aqi >= 51) return 'watch';
  return 'good';
}

function getSchoolSummary(school) {
  return {
    ...school,
    severity: normalizeAqi(school.aqi),
    riskLevel: school.aqi > 120 ? 'High' : school.aqi > 80 ? 'Elevated' : 'Stable',
    childrenExposed: Math.max(1, Math.round(school.children * (school.aqi / 200)))
  };
}

function buildDashboard() {
  const schoolSummaries = schools.map(getSchoolSummary);
  const avgAqi = Math.round(schoolSummaries.reduce((total, school) => total + school.aqi, 0) / schoolSummaries.length);
  const criticalCount = schoolSummaries.filter((school) => school.aqi >= 101).length;
  const alertCount = schoolSummaries.filter((school) => school.aqi >= 81).length;

  return {
    generatedAt: new Date().toISOString(),
    summary: {
      totalSchools: schoolSummaries.length,
      averageAqi: avgAqi,
      activeAlerts: alertCount,
      criticalSchools: criticalCount,
      safeSchools: schoolSummaries.filter((school) => school.aqi < 81).length
    },
    schools: schoolSummaries
  };
}

function getAlerts() {
  return schools
    .filter((school) => school.aqi >= 80)
    .map((school) => ({
      id: school.id,
      school: school.name,
      zone: school.zone,
      aqi: school.aqi,
      severity: normalizeAqi(school.aqi),
      message: `${school.name} in ${school.zone} is showing elevated particulate exposure for children during school hours.`,
      flaggedAt: new Date().toISOString()
    }));
}

function getRecommendations() {
  return [
    {
      priority: 'High',
      title: 'Activate filtered ventilation windows',
      detail: 'Increase indoor air circulation and keep filtration systems running during peak PM2.5 periods.'
    },
    {
      priority: 'High',
      title: 'Shift outdoor activities indoors',
      detail: 'Move physical education and recess to shaded indoor spaces while AQI remains elevated.'
    },
    {
      priority: 'Medium',
      title: 'Notify parent communication channels',
      detail: 'Send a short notice to guardians with the current school AQI and protective guidance.'
    },
    {
      priority: 'Medium',
      title: 'Review bus-idling protocols',
      detail: 'Reduce waiting periods near entrances to prevent concentrated pollution exposure around school gates.'
    }
  ];
}

module.exports = {
  buildDashboard,
  getAlerts,
  getRecommendations,
  schools
};
