import { defineFunction } from '@aws-amplify/backend';

export const distributeTokens = defineFunction({
  name: 'distribute-tokens',
  entry: './handler.ts',
  timeoutSeconds: 60
});