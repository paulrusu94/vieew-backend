import { defineFunction } from '@aws-amplify/backend';

export const preSignUp = defineFunction({
  name: 'pre-signup',
  entry: './handler.ts',
  timeoutSeconds: 10
});