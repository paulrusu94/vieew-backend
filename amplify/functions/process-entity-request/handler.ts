// -----------------------------------------------------------------------------
// Imports
// -----------------------------------------------------------------------------

import type { DynamoDBStreamHandler } from "aws-lambda";
import { unmarshall } from "@aws-sdk/util-dynamodb";

import type { Schema } from "../../data/resource";
import { createEntityFromRequest } from "./utils/create-entity-from-request";

// -----------------------------------------------------------------------------
// Types & Constants
// -----------------------------------------------------------------------------

type EntityRequestType = Schema["EntityRquest"]["type"]; // schema model name

const LOG_PREFIX = "process-entity-request";

// -----------------------------------------------------------------------------
// Main Handler
// -----------------------------------------------------------------------------

/**
 * DynamoDB Stream handler for EntityRquest updates.
 *
 * Responsibilities:
 * 1. Listens to MODIFY events on the EntityRquest table.
 * 2. Detects status transitions from REVIEW to DONE.
 * 3. When such a transition occurs, calls createEntityFromRequest()
 *    to create the corresponding Entity record.
 *
 * Notes:
 * - Only admins should be allowed to transition an EntityRquest to DONE.
 * - Entity creation is performed exclusively by this backend Lambda,
 *   not directly from the client.
 */
export const handler: DynamoDBStreamHandler = async (event) => {
  const records = event.Records ?? [];

  console.log(`${LOG_PREFIX}: received DynamoDB stream event`, {
    recordCount: records.length,
  });

  for (const record of records) {
    console.log(`${LOG_PREFIX}: processing record`, {
      eventID: record.eventID,
      eventName: record.eventName,
    });

    // Only handle MODIFY events (status changes)
    if (record.eventName !== "MODIFY") {
      continue;
    }

    try {
      if (!record.dynamodb) {
        console.error(`${LOG_PREFIX}: missing dynamodb payload on record`, {
          eventID: record.eventID,
        });
        continue;
      }

      const newItem = record.dynamodb.NewImage
        ? (unmarshall(record.dynamodb.NewImage as any) as EntityRequestType)
        : null;
      const oldItem = record.dynamodb.OldImage
        ? (unmarshall(record.dynamodb.OldImage as any) as EntityRequestType)
        : null;

      console.log(`${LOG_PREFIX}: raw NewImage / OldImage`, {
        newImage: record.dynamodb.NewImage,
        oldImage: record.dynamodb.OldImage,
      });

      if (!newItem || !oldItem) {
        console.warn(`${LOG_PREFIX}: missing NewItem or OldItem after unmarshall`, {
          eventID: record.eventID,
        });
        continue;
      }

      const transitionedToDone =
        newItem.status === "DONE" && oldItem.status === "REVIEW";

      if (!transitionedToDone) {
        continue;
      }

      console.log(`${LOG_PREFIX}: status transitioned REVIEW -> DONE, creating entity`, {
        entityReqId: newItem.entityReqId,
        ownerId: newItem.ownerId,
      });

      await createEntityFromRequest(newItem);
    } catch (error) {
      console.error(`${LOG_PREFIX}: error processing MODIFY record`, {
        eventID: record.eventID,
        error,
      });
      // If you want per-record retries via batchItemFailures, you can push the
      // relevant identifiers here. For now, we log and proceed.
    }
  }

  console.log(`${LOG_PREFIX}: successfully processed ${records.length} records.`);

  return {
    batchItemFailures: [],
  };
};
