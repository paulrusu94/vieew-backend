import { defineFunction } from '@aws-amplify/backend';

export const schedulerMining = defineFunction({
  name: 'scheduler-mining',
  entry: './handler.ts',
  environment: {TEST: "TEST"},
  memoryMB: 1024,
  timeoutSeconds: 10
});