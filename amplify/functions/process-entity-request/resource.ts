import { defineFunction } from '@aws-amplify/backend';

export const processEntityRequest = defineFunction({
  entry: './handler.ts',
  name: "process-entity-request",
  resourceGroupName: "data"
});