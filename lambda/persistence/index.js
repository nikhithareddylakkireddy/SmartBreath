const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const { DynamoDBClient, PutItemCommand } = require('@aws-sdk/client-dynamodb');
const { marshall } = require('@aws-sdk/util-dynamodb');
const { createStoragePlan } = require('../../ingestion/storage');

const s3 = new S3Client({});
const dynamodb = new DynamoDBClient({});

async function handler(event) {
  const plan = createStoragePlan({
    reading: event.reading,
    readingId: event.readingId,
    bucketName: process.env.RAW_BUCKET_NAME
  });

  try {
    await s3.send(new PutObjectCommand({
      Bucket: plan.s3.bucket,
      Key: plan.s3.key,
      Body: plan.s3.body,
      ContentType: plan.s3.contentType,
      ServerSideEncryption: plan.s3.serverSideEncryption,
      IfNoneMatch: '*'
    }));
  } catch (error) {
    if (error.name !== 'PreconditionFailed') throw error;
  }

  for (const record of [plan.dynamodb.reading, plan.dynamodb.audit]) {
    try {
      await dynamodb.send(new PutItemCommand({
        TableName: process.env.READINGS_TABLE_NAME,
        Item: marshall(record, { removeUndefinedValues: true }),
        ConditionExpression: 'attribute_not_exists(pk) AND attribute_not_exists(sk)'
      }));
    } catch (error) {
      if (error.name !== 'ConditionalCheckFailedException') throw error;
    }
  }

  return {
    ...event,
    persisted: true,
    s3Key: plan.s3.key
  };
}

module.exports = { handler };
