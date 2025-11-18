// -----------------------------------------------------------------------------
// Imports
// -----------------------------------------------------------------------------

import type { DynamoDBStreamHandler } from "aws-lambda";
import { DynamoDBClient, UpdateItemCommand, PutItemCommand } from "@aws-sdk/client-dynamodb";

// -----------------------------------------------------------------------------
// Constants & Initialization
// -----------------------------------------------------------------------------

/**
 * Handles increments of the total registered user count
 * inside the AppData table when a new User record is inserted.
 */

const LOG_PREFIX = "update-appdata-user-count";

const ddb = new DynamoDBClient({});

const APPDATA_TABLE_NAME = process.env.APPDATA_TABLE_NAME ?? "AppData-main";
const APP_DATA_ID = "main";

// -----------------------------------------------------------------------------
// Main Handler
// -----------------------------------------------------------------------------

/**
 * DynamoDB Stream handler that increments the registeredUsersCount
 * for each INSERT event observed on the User table.
 *
 * Behavior:
 * - Filters only INSERT events.
 * - For each INSERT, increments AppData.registeredUsersCount by 1.
 * - Uses DynamoDB UpdateItem atomic counters to ensure concurrency safety.
 * - Ignores MODIFY or REMOVE events.
 */
export const handler: DynamoDBStreamHandler = async (event) => {
  const records = event.Records ?? [];

  console.log(`${LOG_PREFIX}: received stream batch`, {
    totalRecords: records.length,
  });

  // 1. Filter for INSERT events only
  const inserts = records.filter((record) => record.eventName === "INSERT");

  if (!inserts.length) {
    console.log(`${LOG_PREFIX}: no INSERT records found, skipping.`);
    return;
  }

  console.log(`${LOG_PREFIX}: processing INSERT records`, {
    insertCount: inserts.length,
  });

  // 2. For each INSERT, increment the global registered user count
  const updatePromises = inserts.map(async () => {
    try {
      await ddb.send(
        new UpdateItemCommand({
          TableName: APPDATA_TABLE_NAME,
          Key: {
            id: { S: APP_DATA_ID },
          },
          UpdateExpression:
            "SET registeredUsersCount = if_not_exists(registeredUsersCount, :zero) + :incr",
          ExpressionAttributeValues: {
            ":zero": { N: "0" },
            ":incr": { N: "1" },
          },
          ConditionExpression: "attribute_exists(id)",
        })
      );
    } catch (err: any) {
      if (err.name === "ConditionalCheckFailedException") {
        await ddb.send(
          new PutItemCommand({
            TableName: APPDATA_TABLE_NAME,
            Item: {
              id: { S: APP_DATA_ID },
              registeredUsersCount: { N: "1" },
            },
            ConditionExpression: "attribute_not_exists(id)",
          })
        );
      } else {
        throw err;
      }
    }
  });

  try {
    // 3. Execute all increments concurrently
    await Promise.all(updatePromises);
    console.log(`${LOG_PREFIX}: successfully incremented user count`, {
      increments: inserts.length,
    });
  } catch (err) {
    console.error(`${LOG_PREFIX}: failed to update AppData`, { error: err });
    throw err;
  }
};
