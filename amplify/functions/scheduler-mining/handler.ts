import type { DynamoDBStreamHandler } from "aws-lambda";
import { unmarshall } from '@aws-sdk/util-dynamodb';
import { env } from "$amplify/env/scheduler-mining";
import { EventBridge } from "aws-sdk";
import { Amplify } from "aws-amplify";
import { getAmplifyDataClientConfig } from "@aws-amplify/backend/function/runtime";
import { generateClient } from "aws-amplify/api";
import { Schema } from "../../data/resource";

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
    status:"PROGRESS", 
    endDate: endDate
  })
}


export const handler: DynamoDBStreamHandler = async (event) => {
  try {
    const eventBridge = new EventBridge();

    for (const record of event.Records) {
      console.log(`Processing record: ${record.eventID}`);
      console.log(`Event Type: ${record.eventName}`);

      if (record.eventName === "INSERT") {
        const newItem = record.dynamodb?.NewImage ? unmarshall(record.dynamodb.NewImage as any) : null;
        console.log(`NEW Image:`, newItem);

        try {
          const ruleName = `R-DT-${Date.now()}-${newItem!.userId}`;

          const startDate = new Date(newItem!.startDate)
          const endDate = new Date(newItem!.startDate)
            
          endDate.setUTCMinutes(endDate.getUTCMinutes() + parseInt(env.EVENT_RATE))

          console.log("startDate", startDate)
          console.log("endDate", endDate)

          
          await updateMiningSession({
            miningSessionId: newItem!.miningSessionId,
            endDate: endDate.toISOString()
          });
          

          const cronExpression = `cron(${endDate.getUTCMinutes()} ${endDate.getUTCHours()} ${endDate.getUTCDate()} ${endDate.getUTCMonth() + 1} ? ${endDate.getUTCFullYear()})`;
          
          console.log("ruleName", ruleName);
          console.log("cronExpression", cronExpression);

          // Create EventBridge Rule
          const rule = await eventBridge.putRule({
            Name: ruleName,
            ScheduleExpression: cronExpression,
            State: "ENABLED"
          }).promise();

          console.log("RULE:", rule)

          // Attach Lambda B as the target
          const target = await eventBridge.putTargets({
            Rule: ruleName,
            Targets: [
              {
                Id: "1",
                Arn: env.TARGET_ARN,
                RoleArn: env.ROLE_ARN,
                Input: JSON.stringify({
                  userId: newItem!.userId,
                  miningSessionId: newItem!.miningSessionId,
                })
              }
            ]
          }).promise();
          console.log("TARGET:", target)
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
