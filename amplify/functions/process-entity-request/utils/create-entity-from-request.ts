// -----------------------------------------------------------------------------
// Imports
// -----------------------------------------------------------------------------

import { Amplify } from "aws-amplify";
import { generateClient, type Client } from "aws-amplify/data";
import { getAmplifyDataClientConfig } from "@aws-amplify/backend/function/runtime";

import { env } from "$amplify/env/process-entity-request"; // update if your env name differs
import type { Schema } from "../../../data/resource";
import { v4 as uuid } from "uuid";

// -----------------------------------------------------------------------------
// Types & Constants
// -----------------------------------------------------------------------------

const LOG_PREFIX = "process-entity-request/create-entity-from-request";

type EntityRequestType = Schema["EntityRequest"]["type"]; // note schema name: EntityRequest

let amplifyConfigured = false;
let dataClient: Client<Schema> | null = null;

// -----------------------------------------------------------------------------
// Amplify Data Client
// -----------------------------------------------------------------------------

/**
 * Returns a singleton Amplify Data client.
 * Amplify is configured once per Lambda container lifecycle.
 */
async function getDataClient(): Promise<Client<Schema>> {
  if (!amplifyConfigured) {
    try {
      const { resourceConfig, libraryOptions } = await getAmplifyDataClientConfig(env);
      Amplify.configure(resourceConfig, libraryOptions);
      amplifyConfigured = true;
    } catch (error) {
      throw new Error(`Failed to configure Amplify: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  if (!dataClient) {
    try {
      dataClient = generateClient<Schema>({ authMode: "iam" });
    } catch (error) {
      throw new Error(`Failed to generate data client: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  return dataClient;
}

// -----------------------------------------------------------------------------
// Entity Creation from Request
// -----------------------------------------------------------------------------

/**
 * Creates an Entity record based on a given EntityRequest.
 *
 * Expected fields on entityRequestData:
 * - entityReqId
 * - ownerId
 * - type
 * - name
 *
 * Authorization model (recommended):
 * - Only this Lambda (process-entity-request) is allowed to create Entities
 *   via allow.resource(processEntityRequest) in the Entity model.
 */
export async function createEntityFromRequest(
  entityRequestData: EntityRequestType
): Promise<void> {
  const client = await getDataClient();

  try {
    await client.models.Entity.create({
      entityId: uuid(),
      ownerId: entityRequestData.ownerId,
      type: entityRequestData.type,
      name: entityRequestData.name,
    });

    console.log(`${LOG_PREFIX}: entity created from request`, {
      entityReqId: entityRequestData.entityReqId,
      ownerId: entityRequestData.ownerId,
      type: entityRequestData.type,
      name: entityRequestData.name,
    });
  } catch (error) {
    console.error(
      `${LOG_PREFIX}: failed to create Entity from EntityRequest`,
      {
        entityReqId: entityRequestData.entityReqId,
        error,
      }
    );
    throw error;
  }
}
