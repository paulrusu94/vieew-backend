import { defineFunction } from '@aws-amplify/backend';

export const processMiningSession = defineFunction({
  name: 'process-mining-session',
  entry: './handler.ts',
  resourceGroupName: 'data',
  timeoutSeconds: 300,
});