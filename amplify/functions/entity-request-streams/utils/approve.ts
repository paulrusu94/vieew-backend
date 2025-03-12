import { type Schema } from "../../../data/resource";
import { Amplify } from "aws-amplify";
import { generateClient } from "aws-amplify/data";
import { env } from "$amplify/env/entity-request-streams";
import { v4 as uuid } from "uuid"
import { createEntity } from "../../../mutations"


Amplify.configure(
  {
    API: {
      GraphQL: {
        endpoint: env.AMPLIFY_DATA_GRAPHQL_ENDPOINT,
        region: env.AWS_REGION,
        defaultAuthMode: "iam",
      },
    },
  },
  {
    Auth: {
      credentialsProvider: {
        getCredentialsAndIdentityId: async () => ({
          credentials: {
            accessKeyId: env.AWS_ACCESS_KEY_ID,
            secretAccessKey: env.AWS_SECRET_ACCESS_KEY,
            sessionToken: env.AWS_SESSION_TOKEN,
          },
        }),
        clearCredentialsAndIdentityId: () => {
          /* noop */
        },
      },
    },
  }
);

const client = generateClient<Schema>({
  authMode: "iam",
});


export const approve = async (entityRequestData: any) => {
  try {
    const res = await client.graphql({
      query: createEntity,
      variables: {
        input: {
          entityId: uuid(),
          ownerId: entityRequestData.ownerId,
          type: entityRequestData.type,
          name: entityRequestData.name
        }
      }
    })
  } catch (e) {
    console.error(e)
  }
}