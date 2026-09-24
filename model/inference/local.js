const { trainLocalModel } = require('../training/train');
const { prepareFeatures } = require('../features');
const { inferPrediction } = require('../predict');

function createLocalInference() {
  const trained = trainLocalModel();
  const modelError = trained.modelMetrics.mae;
  return {
    modelVersion: trained.model.modelVersion,
    metrics: trained.modelMetrics,
    predict({ schoolId, reading, history }) {
      const prepared = prepareFeatures({ reading, history });
      return inferPrediction({
        model: trained.model,
        modelError,
        schoolId,
        reading,
        preparedFeatures: prepared,
        simulated: reading.simulated === true
      });
    }
  };
}

module.exports = { createLocalInference };
