import type { DynamoDBStreamHandler } from "aws-lambda";
import { unmarshall } from '@aws-sdk/util-dynamodb';
import { approve } from "./utils/approve";

export const handler: DynamoDBStreamHandler = async (event) => {
  for (const record of event.Records) {

    console.log(`Processing record: ${record.eventID}`);
    console.log(`Event Type: ${record.eventName}`);

    if (record.eventName === "MODIFY") {
      const newItem = record.dynamodb?.NewImage ? unmarshall(record.dynamodb.NewImage as any) : null;
      const oldItem = record.dynamodb?.OldImage ? unmarshall(record.dynamodb.OldImage as any) : null;
      if (newItem?.status === "DONE" && oldItem?.status === "REVIEW") {
        await approve(newItem)
      }
      console.log(`New Image: ${JSON.stringify(record.dynamodb?.NewImage)}`);
    }
  }
  
  console.log(`Successfully processed ${event.Records.length} records.`);
  return {
    batchItemFailures: [],
  };
};