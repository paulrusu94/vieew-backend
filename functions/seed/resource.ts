import { defineFunction } from '@aws-amplify/backend';

export const seed = defineFunction({
  name: 'seed',
  entry: './handler.ts'
});