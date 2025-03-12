import { defineFunction } from '@aws-amplify/backend';

export const entityRequestStreams = defineFunction({
  entry: './handler.ts',
  name: "entity-request-streams"
});