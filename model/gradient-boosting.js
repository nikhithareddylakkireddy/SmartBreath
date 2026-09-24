function mean(values) {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function trainGradientBoosting(examples, { rounds = 12, learningRate = 0.08 } = {}) {
  if (!examples.length) throw new Error('Gradient boosting requires training data.');
  const featureNames = Object.keys(examples[0].features);
  const initial = mean(examples.map((example) => example.targetPM25));
  const stumps = [];
  let predictions = examples.map(() => initial);

  for (let round = 0; round < rounds; round += 1) {
    const residuals = examples.map((example, index) => example.targetPM25 - predictions[index]);
    let best = null;
    for (const feature of featureNames) {
      const values = [...new Set(examples.map((example) => example.features[feature]))].sort((a, b) => a - b);
      for (let index = 1; index < values.length; index += 1) {
        const threshold = (values[index - 1] + values[index]) / 2;
        const left = [];
        const right = [];
        examples.forEach((example, exampleIndex) => {
          (example.features[feature] <= threshold ? left : right).push(residuals[exampleIndex]);
        });
        if (!left.length || !right.length) continue;
        const leftValue = mean(left);
        const rightValue = mean(right);
        const error = examples.reduce((sum, example, exampleIndex) => {
          const value = example.features[feature] <= threshold ? leftValue : rightValue;
          return sum + (residuals[exampleIndex] - value) ** 2;
        }, 0);
        if (!best || error < best.error) best = { feature, threshold, leftValue, rightValue, error };
      }
    }
    if (!best) break;
    stumps.push(best);
    predictions = predictions.map((prediction, index) => {
      const value = examples[index].features[best.feature] <= best.threshold ? best.leftValue : best.rightValue;
      return prediction + learningRate * value;
    });
  }

  return {
    modelVersion: 'gradient-boosting-stumps-v1',
    initial,
    learningRate,
    stumps,
    predict(example) {
      return stumps.reduce((prediction, stump) => {
        const value = example.features[stump.feature] <= stump.threshold ? stump.leftValue : stump.rightValue;
        return prediction + learningRate * value;
      }, initial);
    }
  };
}

module.exports = { trainGradientBoosting };
