import { type Schema } from "../../../data/resource";
import { Amplify } from "aws-amplify";
import { generateClient } from "aws-amplify/data";
import { env } from "$amplify/env/entity-request-streams";
import { v4 as uuid } from "uuid"


import { getAmplifyDataClientConfig } from '@aws-amplify/backend/function/runtime';


const { resourceConfig, libraryOptions } = await getAmplifyDataClientConfig(env);
Amplify.configure(resourceConfig, libraryOptions);

const client = generateClient<Schema>({
  authMode: "iam",
});


export const approve = async (entityRequestData: any) => {
  try {
    // const res = await client.graphql({
    //   query: createEntity,
    //   variables: {
    //     input: {
    //       entityId: uuid(),
    //       ownerId: entityRequestData.ownerId,
    //       type: entityRequestData.type,
    //       name: entityRequestData.name
    //     }
    //   }
    // })

    await client.models.Entity.create({entityId: uuid(),
      ownerId: entityRequestData.ownerId,
      type: entityRequestData.type,
      name: entityRequestData.name})
  } catch (e) {
    console.error(e)
  }
}