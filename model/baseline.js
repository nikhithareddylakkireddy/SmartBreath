function trainPersistenceBaseline() {
  return {
    modelVersion: 'baseline-persistence-v1',
    predict(example) {
      return example.features.pm25;
    }
  };
}

module.exports = { trainPersistenceBaseline };
