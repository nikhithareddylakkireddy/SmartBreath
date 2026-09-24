const { DynamoDBClient, PutItemCommand } = require('@aws-sdk/client-dynamodb');
const { marshall } = require('@aws-sdk/util-dynamodb');
const { toAuditRecord } = require('../../ingestion/records');

const dynamodb = new DynamoDBClient({});

async function handler(event) {
  const audit = toAuditRecord({
    reading: event.reading,
    eventType: event.persisted ? 'reading.persisted' : 'reading.persistence_failed'
  });

  await dynamodb.send(new PutItemCommand({
    TableName: process.env.READINGS_TABLE_NAME,
    Item: marshall(audit, { removeUndefinedValues: true }),
    ConditionExpression: 'attribute_not_exists(pk) AND attribute_not_exists(sk)'
  })).catch((error) => {
    if (error.name !== 'ConditionalCheckFailedException') throw error;
  });

  return { ...event, audited: true };
}

module.exports = { handler };
