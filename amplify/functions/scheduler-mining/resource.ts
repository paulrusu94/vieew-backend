import { defineFunction } from '@aws-amplify/backend';

export const schedulerMining = defineFunction({
  name: 'scheduler-mining',
  entry: './handler.ts',
  environment: {
    EVENT_RATE: "5"
  },
  memoryMB: 1024,
  timeoutSeconds: 10
});