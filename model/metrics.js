function regressionMetrics(actual, predicted) {
  if (actual.length !== predicted.length || actual.length === 0) throw new Error('Metrics require equally sized non-empty arrays.');
  const errors = actual.map((value, index) => value - predicted[index]);
  const mae = errors.reduce((sum, error) => sum + Math.abs(error), 0) / errors.length;
  const rmse = Math.sqrt(errors.reduce((sum, error) => sum + error ** 2, 0) / errors.length);
  const mean = actual.reduce((sum, value) => sum + value, 0) / actual.length;
  const total = actual.reduce((sum, value) => sum + (value - mean) ** 2, 0);
  const residual = errors.reduce((sum, error) => sum + error ** 2, 0);
  return { mae, rmse, r2: total === 0 ? 0 : 1 - residual / total };
}

module.exports = { regressionMetrics };
