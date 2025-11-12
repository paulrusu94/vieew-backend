import { defineFunction } from '@aws-amplify/backend';

export const postAuthentication = defineFunction({
  name: 'post-authentication',
  entry: './handler.ts',
  timeoutSeconds: 10
});