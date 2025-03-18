import type { DynamoDBStreamHandler } from "aws-lambda";
import { unmarshall } from '@aws-sdk/util-dynamodb';
import { env } from "$amplify/env/scheduler-mining";
import { EventBridge } from "aws-sdk";


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
          const ruleName = `mining-session-${Date.now()}-${newItem!.userId}`;

          const startDate = new Date(newItem!.startDate)
          const endDate = new Date(newItem!.startDate)
          
          // endDate.setHours(endDate.getHours() + 24)  
          // endDate.setUTCHours(endDate.getUTCHours() + 24)  
          endDate.setUTCMinutes(endDate.getUTCMinutes() + 2)  

          console.log("startDate", startDate)
          console.log("endDate", endDate)

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
