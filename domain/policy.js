const { validateRiskEvaluation } = require('./schemas/risk-evaluation');

const POLICY_VERSION = 'phase-1-v1';

const DEFAULT_THRESHOLDS = {
  pm25Watch: 35,
  pm25High: 55,
  pm25Critical: 150,
  pm10Watch: 50,
  pm10High: 100,
  pm10Critical: 250,
  minimumPredictionConfidence: 0.7
};

const ACTIONS = {
  watch: [
    'Keep outdoor activities under review.',
    'Check indoor filtration and ventilation settings.'
  ],
  elevated: [
    'Move strenuous outdoor activities indoors.',
    'Increase filtered ventilation and monitor children with heightened sensitivity.'
  ],
  high: [
    'Restrict outdoor activity and move recess or physical education indoors.',
    'Notify configured school administrators and parents or guardians.',
    'Review mask guidance where appropriate under institution policy.'
  ],
  critical: [
    'Keep children indoors and suspend outdoor activities.',
    'Activate the school protective-action plan and filtered ventilation.',
    'Notify configured responsible personnel and verified escalation contacts.'
  ]
};

function maxRisk(...risks) {
  const order = ['good', 'watch', 'elevated', 'high', 'critical'];
  return risks.sort((a, b) => order.indexOf(b) - order.indexOf(a))[0];
}

function riskForPollutant(value, thresholds, pollutant) {
  const prefix = pollutant === 'PM2.5' ? 'pm25' : 'pm10';
  if (value >= thresholds[`${prefix}Critical`]) return 'critical';
  if (value >= thresholds[`${prefix}High`]) return 'high';
  if (value >= thresholds[`${prefix}Watch`]) return 'watch';
  return 'good';
}

function evaluateRisk({ schoolId, currentPM25, currentPM10, predictedPM25, predictionConfidence, thresholds = DEFAULT_THRESHOLDS, childSensitiveMode = true, protectiveActions = {}, evaluatedAt = new Date().toISOString() }) {
  let currentRisk = maxRisk(
    riskForPollutant(currentPM25, thresholds, 'PM2.5'),
    riskForPollutant(currentPM10, thresholds, 'PM10')
  );
  if (childSensitiveMode && currentPM25 >= thresholds.pm25Watch) {
    currentRisk = maxRisk(currentRisk, 'watch');
  }
  const predictionUsable = predictionConfidence >= thresholds.minimumPredictionConfidence;
  const predictedRisk = predictionUsable
    ? riskForPollutant(predictedPM25, thresholds, 'PM2.5')
    : 'good';
  const finalRisk = maxRisk(currentRisk, predictedRisk);
  const severity = finalRisk === 'critical' ? 'critical'
    : finalRisk === 'high' ? 'high'
      : finalRisk === 'watch' || finalRisk === 'elevated' ? 'watch' : 'info';
  const confidence = predictionConfidence === undefined ? 1 : predictionConfidence;
  const reason = !predictionUsable && predictedPM25 !== undefined
    ? `Current readings indicate ${currentRisk} risk; the prediction was not used because confidence is below ${thresholds.minimumPredictionConfidence}.`
    : `Current PM2.5 (${currentPM25}) and PM10 (${currentPM10}) readings, plus the available PM2.5 forecast, indicate ${finalRisk} risk.`;
  const policyContext = childSensitiveMode
    ? ' Child-sensitive policy is active.'
    : ' Standard sensitivity policy is active.';
  const configuredActionContext = protectiveActions.outdoorActivityPolicy
    ? ` Configured outdoor activity policy: ${protectiveActions.outdoorActivityPolicy}.`
    : '';
  const evaluation = {
    schoolId,
    currentRisk,
    predictedRisk,
    severity,
    reason: `${reason}${policyContext}${configuredActionContext}`,
    confidence,
    policyVersion: POLICY_VERSION,
    evaluatedAt
  };
  validateRiskEvaluation(evaluation);
  return evaluation;
}

function actionsForRisk(risk) {
  return ACTIONS[risk] || [];
}

function thresholdForAlert({ pollutant, severity, thresholds = DEFAULT_THRESHOLDS }) {
  const prefix = pollutant === 'PM2.5' ? 'pm25' : 'pm10';
  const suffix = severity === 'critical' ? 'Critical' : severity === 'high' ? 'High' : 'Watch';
  return thresholds[`${prefix}${suffix}`];
}

module.exports = {
  ACTIONS,
  DEFAULT_THRESHOLDS,
  POLICY_VERSION,
  actionsForRisk,
  evaluateRisk,
  thresholdForAlert
};
