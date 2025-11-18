import { defineFunction } from '@aws-amplify/backend';

export const scheduleMiningSession = defineFunction({
  name: 'schedule-mining-session',
  entry: './handler.ts',
  resourceGroupName: "data",
  environment: {
    EVENT_RATE: "5"
  },
  memoryMB: 1024,
  timeoutSeconds: 10
});