import type { DynamoDBStreamHandler } from "aws-lambda";
import { unmarshall } from '@aws-sdk/util-dynamodb';
import { env } from "$amplify/env/scheduler-mining";
import { SchedulerClient, CreateScheduleCommand } from "@aws-sdk/client-scheduler";
import { Amplify } from "aws-amplify";
import { getAmplifyDataClientConfig } from "@aws-amplify/backend/function/runtime";
import { generateClient } from "aws-amplify/api";
import { Schema } from "../../data/resource";
import { evaluate } from 'mathjs';

const updateMiningSession = async ({
  miningSessionId,
  endDate
}: {
  miningSessionId: string;
  endDate: string;
}) => {

  const { resourceConfig, libraryOptions } = await getAmplifyDataClientConfig(env);
  Amplify.configure(resourceConfig, libraryOptions);

  const client = generateClient<Schema>({ authMode: "iam" });

  return await client.models.MiningSession.update({
    miningSessionId: miningSessionId,
    status: "PROGRESS",
    endDate: endDate
  })
}


export const handler: DynamoDBStreamHandler = async (event) => {
  try {
    const scheduler = new SchedulerClient({});

    for (const record of event.Records) {
      console.log(`Processing record: ${record.eventID}`);
      console.log(`Event Type: ${record.eventName}`);

      if (record.eventName === "INSERT") {
        const newItem = record.dynamodb?.NewImage ? unmarshall(record.dynamodb.NewImage as any) : null;
        console.log(`NEW Image:`, newItem);

        try {

          if (!newItem) {
            throw Error('System: You do not have a newItem');
          }

          const startDate = new Date(newItem!.startDate)
          const eventRate = evaluate(env.EVENT_RATE);
          const endDate = new Date(startDate.getTime() + eventRate * 60 * 1000);
          endDate.setUTCSeconds(0, 0);

          await updateMiningSession({
            miningSessionId: newItem!.miningSessionId,
            endDate: endDate.toISOString()
          });

          const isoTimeForSchedule = endDate.toISOString().split('.')[0];
          const scheduleExpression = `at(${isoTimeForSchedule})`;

          console.log('scheduleExpression', scheduleExpression);
          console.log("ROLE_ARN:", env.ROLE_ARN);
          console.log("TAGRET:", env.TARGET_ARN);

          await scheduler.send(
            new CreateScheduleCommand({
              Name: `Schedule-Distribute-Tokens-${Date.now()}`,
              FlexibleTimeWindow: { Mode: "OFF" },
              ScheduleExpression: scheduleExpression,
              Target: {
                Arn: env.TARGET_ARN,
                RoleArn: env.ROLE_ARN,
                Input: JSON.stringify({ userId: newItem.userId, miningSessionId: newItem.miningSessionId }),
              },
            })
          );
        } catch (error) {
          console.log("Error creating event rule:", error);
        }

      }
    }
    console.log(`Successfully processed ${event.Records.length} records.`);
    return {
      batchItemFailures: [],
    };
  } catch (e) {
    console.log(e)
    throw e
  }

};
