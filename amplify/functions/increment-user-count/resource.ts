import { defineFunction } from "@aws-amplify/backend";

export const incrementUserCount = defineFunction({
  name: "increment-user-count",
  resourceGroupName: "data",
});
