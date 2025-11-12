import type { DynamoDBStreamHandler } from "aws-lambda";
import { unmarshall } from '@aws-sdk/util-dynamodb';
import { env } from "$amplify/env/scheduler-mining";
import { SchedulerClient, CreateScheduleCommand } from "@aws-sdk/client-scheduler";
import { Amplify } from "aws-amplify";
import { getAmplifyDataClientConfig } from "@aws-amplify/backend/function/runtime";
import { generateClient } from "aws-amplify/api";
import { Schema } from "../../data/resource";
import { evaluate } from 'mathjs';

type MiningSession = Schema['MiningSession']['type']

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

    for (const record of event.Records) {
      console.log(`Processing record: ${record.eventID}`);
      console.log(`Event Type: ${record.eventName}`);


      try {
        if (record.eventName === "INSERT") {

          if (!record.dynamodb) {
            throw Error('Scheduler Mininng: Error');
          }

          if (!record.dynamodb?.NewImage) {
            throw Error('Scheduler Mininng: Error');
          }

          const scheduler = new SchedulerClient({});
          const newItem: MiningSession = unmarshall(record.dynamodb.NewImage as any) as MiningSession
          console.log(`NewImage:`, newItem);

          const eventRate = evaluate(env.EVENT_RATE);
          const startDate = new Date(newItem.startDate)
          const endDate = new Date(startDate.getTime() + eventRate * 60 * 1000);
          endDate.setUTCSeconds(0, 0);

          await updateMiningSession({
            miningSessionId: newItem.miningSessionId,
            endDate: endDate.toISOString()
          });

          const isoTimeForSchedule = endDate.toISOString().split('.')[0];
          const scheduleExpression = `at(${isoTimeForSchedule})`;

          console.log('Schedule Expression', scheduleExpression);

          await scheduler.send(
            new CreateScheduleCommand({
              Name: `DT-${newItem.miningSessionId}`,
              FlexibleTimeWindow: { Mode: "OFF" },
              ScheduleExpression: scheduleExpression,
              Target: {
                Arn: env.TARGET_ARN,
                RoleArn: env.ROLE_ARN,
                Input: JSON.stringify({ userId: newItem.userId, miningSessionId: newItem.miningSessionId }),
              },
            })
          );
        }
      } catch (error) {
        console.log("Error creating event rule:", error);
      }
    }
    console.log(`Successfully processed ${event.Records.length} records.`);
    return {
      batchItemFailures: [],
    };

};
