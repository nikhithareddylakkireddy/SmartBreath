const { createSyntheticDataset } = require('./data');
const { chronologicalSplit } = require('../split');
const { regressionMetrics } = require('../metrics');
const { trainPersistenceBaseline } = require('../baseline');
const { trainGradientBoosting } = require('../gradient-boosting');

function evaluateModel(model, examples) {
  return regressionMetrics(
    examples.map((example) => example.targetPM25),
    examples.map((example) => model.predict(example))
  );
}

function trainLocalModel({ examples = createSyntheticDataset() } = {}) {
  const split = chronologicalSplit(examples);
  const baseline = trainPersistenceBaseline();
  const model = trainGradientBoosting(split.train);
  return {
    model,
    baseline,
    splitSizes: {
      train: split.train.length,
      validation: split.validation.length,
      test: split.test.length
    },
    baselineMetrics: evaluateModel(baseline, split.test),
    modelMetrics: evaluateModel(model, split.test),
    dataSource: examples[0]?.dataSourceType || 'unknown',
    limitations: 'Metrics from synthetic data are development-only and do not establish real-world accuracy.'
  };
}

if (require.main === module) {
  console.log(JSON.stringify(trainLocalModel(), null, 2));
}

module.exports = { evaluateModel, trainLocalModel };
