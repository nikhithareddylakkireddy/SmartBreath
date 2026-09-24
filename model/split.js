function chronologicalSplit(examples, { trainRatio = 0.6, validationRatio = 0.2 } = {}) {
  const ordered = [...examples].sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp));
  const trainEnd = Math.floor(ordered.length * trainRatio);
  const validationEnd = trainEnd + Math.floor(ordered.length * validationRatio);
  return {
    train: ordered.slice(0, trainEnd),
    validation: ordered.slice(trainEnd, validationEnd),
    test: ordered.slice(validationEnd)
  };
}

module.exports = { chronologicalSplit };
