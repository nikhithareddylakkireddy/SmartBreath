function createStoragePlan({ reading, readingId, bucketName }) {
  const { rawReadingKey } = require('./contracts');
  const { toDynamoReading, toAuditRecord } = require('./records');
  return {
    s3: {
      bucket: bucketName,
      key: rawReadingKey(reading, readingId),
      body: JSON.stringify({ reading, readingId }),
      contentType: 'application/json',
      serverSideEncryption: 'AES256'
    },
    dynamodb: {
      reading: toDynamoReading(reading),
      audit: toAuditRecord({ reading })
    }
  };
}

module.exports = { createStoragePlan };
