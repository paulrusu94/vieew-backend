// -----------------------------------------------------------------------------
// Imports
// -----------------------------------------------------------------------------

import type { DynamoDBStreamHandler } from "aws-lambda";
import { unmarshall } from "@aws-sdk/util-dynamodb";
import { SchedulerClient, CreateScheduleCommand } from "@aws-sdk/client-scheduler";

import { Amplify } from "aws-amplify";
import { generateClient, type Client } from "aws-amplify/data";
import { getAmplifyDataClientConfig } from "@aws-amplify/backend/function/runtime";

import { env } from "$amplify/env/schedule-mining-session";
import type { Schema } from "../../data/resource";
import { evaluate } from "mathjs";

// -----------------------------------------------------------------------------
// Types & Constants
// -----------------------------------------------------------------------------

type MiningSession = Schema["MiningSession"]["type"];

const LOG_PREFIX = "schedule-mining-session";

let amplifyConfigured = false;
let dataClient: Client<Schema> | null = null;
const scheduler = new SchedulerClient({});

// -----------------------------------------------------------------------------
// Amplify Data Client
// -----------------------------------------------------------------------------

/**
 * Returns a singleton Amplify Data client.
 * Amplify is configured once per Lambda container lifecycle.
 */
async function getDataClient(): Promise<Client<Schema>> {
  if (!amplifyConfigured) {
    const { resourceConfig, libraryOptions } = await getAmplifyDataClientConfig(env);
    Amplify.configure(resourceConfig, libraryOptions);
    amplifyConfigured = true;
  }

  if (!dataClient) {
    dataClient = generateClient<Schema>({ authMode: "iam" });
  }

  return dataClient;
}

// -----------------------------------------------------------------------------
// Environment Validation
// -----------------------------------------------------------------------------

/**
 * Validates required environment configuration for this function.
 * Throws early if something critical is missing.
 */
function assertEnv(): void {
  if (!env.EVENT_RATE) {
    throw new Error(`${LOG_PREFIX}: EVENT_RATE not configured in env`);
  }
  if (!env.TARGET_ARN || !env.ROLE_ARN) {
    throw new Error(`${LOG_PREFIX}: TARGET_ARN or ROLE_ARN not configured in env`);
  }
}

// -----------------------------------------------------------------------------
// MiningSession Update Helpers
// -----------------------------------------------------------------------------

/**
 * Updates a MiningSession with status PROGRESS and calculated endDate.
 */
async function updateMiningSessionToProgress(input: {
  miningSessionId: string;
  endDate: string;
}): Promise<void> {
  const client = await getDataClient();

  await client.models.MiningSession.update({
    miningSessionId: input.miningSessionId,
    status: "PROGRESS",
    endDate: input.endDate,
  });
}

// -----------------------------------------------------------------------------
// Scheduling Helpers
// -----------------------------------------------------------------------------

/**
 * Parses EVENT_RATE from env and computes the endDate
 * as startDate + EVENT_RATE (in minutes).
 */
function computeEndDate(startDateISO: string): Date {
  const eventRateMinutes = Number(evaluate(env.EVENT_RATE));
  if (Number.isNaN(eventRateMinutes)) {
    throw new Error(
      `${LOG_PREFIX}: EVENT_RATE is not a valid number/expression: ${env.EVENT_RATE}`
    );
  }

  const startDate = new Date(startDateISO);
  if (Number.isNaN(startDate.getTime())) {
    throw new Error(`${LOG_PREFIX}: invalid startDate on MiningSession: ${startDateISO}`);
  }

  const endDate = new Date(startDate.getTime() + eventRateMinutes * 60 * 1000);
  // align to full minute, zero out seconds and milliseconds
  endDate.setUTCSeconds(0, 0);

  return endDate;
}

/**
 * Builds EventBridge Scheduler expression: at(YYYY-MM-DDTHH:mm:ssZ).
 */
function buildScheduleExpression(endDate: Date): string {
  const isoTime = endDate.toISOString().split(".")[0];
  return `at(${isoTime})`;
}

/**
 * Creates an EventBridge schedule that will trigger the
 * "process-mining-session" Lambda at the given endDate.
 */
async function createProcessMiningSchedule(
  miningSession: MiningSession,
  endDate: Date
): Promise<void> {
  const scheduleExpression = buildScheduleExpression(endDate);

  console.log(`${LOG_PREFIX}: scheduler expression`, {
    miningSessionId: miningSession.miningSessionId,
    scheduleExpression,
  });

  await scheduler.send(
    new CreateScheduleCommand({
      Name: `PM-${miningSession.miningSessionId}`, // PM = process-mining-session
      FlexibleTimeWindow: { Mode: "OFF" },
      ScheduleExpression: scheduleExpression,
      Target: {
        Arn: env.TARGET_ARN,
        RoleArn: env.ROLE_ARN,
        Input: JSON.stringify({
          userId: miningSession.userId,
          miningSessionId: miningSession.miningSessionId,
        }),
      },
    })
  );
}

// -----------------------------------------------------------------------------
// Main Handler
// -----------------------------------------------------------------------------

/**
 * DynamoDB Stream handler for MiningSession INSERT events.
 *
 * Responsibilities:
 * 1. Compute the endDate for the session.
 * 2. Update the MiningSession to status PROGRESS with endDate.
 * 3. Create an EventBridge schedule to trigger process-mining-session at endDate.
 */
export const handler: DynamoDBStreamHandler = async (event) => {
  console.log(`${LOG_PREFIX}: received DynamoDB stream event`, {
    recordCount: event.Records.length,
  });

  try {
    assertEnv();
  } catch (envError) {
    console.error(`${LOG_PREFIX}: configuration error`, envError);
    return {
      batchItemFailures: [],
    };
  }

  for (const record of event.Records) {
    console.log(`${LOG_PREFIX}: processing record`, {
      eventID: record.eventID,
      eventName: record.eventName,
    });

    // Only handle INSERT (new MiningSession)
    if (record.eventName !== "INSERT") {
      continue;
    }

    try {
      if (!record.dynamodb || !record.dynamodb.NewImage) {
        throw new Error(`${LOG_PREFIX}: Missing NewImage in DynamoDB record`);
      }

      const newItem = unmarshall(
        record.dynamodb.NewImage as any
      ) as unknown as MiningSession;

      console.log(`${LOG_PREFIX}: new MiningSession from stream`, {
        miningSessionId: newItem.miningSessionId,
        userId: newItem.userId,
        startDate: newItem.startDate,
      });

      if (!newItem.miningSessionId || !newItem.userId || !newItem.startDate) {
        throw new Error(
          `${LOG_PREFIX}: Missing required fields (miningSessionId, userId, startDate)`
        );
      }

      // 1. Compute endDate
      const endDate = computeEndDate(newItem.startDate);

      // 2. Update MiningSession
      await updateMiningSessionToProgress({
        miningSessionId: newItem.miningSessionId,
        endDate: endDate.toISOString(),
      });

      // 3. Create schedule for process-mining-session
      await createProcessMiningSchedule(newItem, endDate);
    } catch (error) {
      console.error(`${LOG_PREFIX}: error processing record`, {
        eventID: record.eventID,
        error,
      });
    }
  }

  console.log(`${LOG_PREFIX}: successfully processed ${event.Records.length} records.`);

  return {
    batchItemFailures: [],
  };
};
