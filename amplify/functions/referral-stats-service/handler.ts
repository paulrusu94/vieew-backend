import { Amplify } from "aws-amplify";
import { generateClient, type Client } from "aws-amplify/data";
import { getAmplifyDataClientConfig } from "@aws-amplify/backend/function/runtime";

import { env } from "$amplify/env/referral-stats-service";
import type { Schema } from "../../data/resource";
import { DateUtils } from "../shared/utils/date";

// -----------------------------------------------------------------------------
// Types & Constants
// -----------------------------------------------------------------------------

const LOG_PREFIX = "referral-stats-service";

type ReferralStatsHandler = Schema["getReferralStats"]["functionHandler"];
type ReferralStatsArgs = ReferralStatsHandler["arguments"];
type ReferralStatsResponse = Schema["ReferralStatsResponse"]["type"];

type UserMinimal = { userId: string };
type MiningSessionMinimal = {
  miningSessionId: string;
  startDate: string | null | undefined;
};

// -----------------------------------------------------------------------------
// Amplify Data Client (Lazy Singleton)
// -----------------------------------------------------------------------------

let amplifyConfigured = false;
let dataClient: Client<Schema> | null = null;

/**
 * Returns a singleton Amplify Data client.
 * Amplify is configured once per Lambda container lifecycle.
 */
async function getDataClient(): Promise<Client<Schema>> {
  if (!amplifyConfigured) {
    const { resourceConfig, libraryOptions } = await getAmplifyDataClientConfig(env);
    Amplify.configure(resourceConfig, libraryOptions);
    amplifyConfigured = true;
  }

  if (!dataClient) {
    dataClient = generateClient<Schema>({ authMode: "iam" });
  }

  return dataClient;
}

// -----------------------------------------------------------------------------
// Handler (GraphQL Resolver)
// -----------------------------------------------------------------------------

export const handler: ReferralStatsHandler = async (event) => {
  const logContext = {
    function: LOG_PREFIX,
    requestId: (event as any)?.request?.requestId ?? "n/a",
  };

  try {
    console.log(`[${LOG_PREFIX}] EVENT`, {
      ...logContext,
      arguments: event.arguments,
    });

    const client = await getDataClient();
    const result = await getReferralStatsService(client, event.arguments);

    console.log(`[${LOG_PREFIX}] RESULT`, {
      ...logContext,
      invitedCount: result.allInvitedUsers.length,
      miningCount: result.allMiningUsers.length,
    });

    return result;
  } catch (error) {
    console.error(`[${LOG_PREFIX}] ERROR`, {
      ...logContext,
      error: error instanceof Error ? error.message : String(error),
    });

    const fallback: ReferralStatsResponse = {
      allInvitedUsers: [],
      allMiningUsers: [],
    };

    return fallback;
  }
};

// -----------------------------------------------------------------------------
// Core Service Logic
// -----------------------------------------------------------------------------

async function getReferralStatsService(
  client: Client<Schema>,
  input: ReferralStatsArgs
): Promise<ReferralStatsResponse> {
  const { referralCode, startDate, endDate } = input;

  if (!referralCode) {
    console.warn(`[${LOG_PREFIX}] Missing referralCode`);
    return {
      allInvitedUsers: [],
      allMiningUsers: [],
    };
  }

  const invitedUsers = await fetchAllInvitedUsers(client, referralCode);

  if (invitedUsers.length === 0) {
    return {
      allInvitedUsers: [],
      allMiningUsers: [],
    };
  }

  if (startDate && endDate) {
    const miningUsers = await findUsersWithMiningSessionsInRange(
      client,
      invitedUsers,
      startDate,
      endDate
    );

    return {
      allInvitedUsers: invitedUsers.map((u) => u.userId),
      allMiningUsers: miningUsers.map((u) => u.userId),
    };
  }

  return {
    allInvitedUsers: invitedUsers.map((u) => u.userId),
    allMiningUsers: [],
  };
}

// -----------------------------------------------------------------------------
// Data Layer — Fetch All Invited Users (Paginated)
// -----------------------------------------------------------------------------

async function fetchAllInvitedUsers(
  client: Client<Schema>,
  referralCode: string,
  pageSize = 100
): Promise<UserMinimal[]> {
  const results: UserMinimal[] = [];
  let nextToken: string | null | undefined;

  do {
    const response = await client.models.User.listUsersReferredByCode(
      { referredByUserCode: referralCode },
      {
        limit: pageSize,
        selectionSet: ["userId"],
        nextToken,
      }
    );

    if (Array.isArray(response.data)) {
      for (const item of response.data) {
        if (item?.userId) {
          results.push({ userId: item.userId });
        }
      }
    }

    nextToken = response.nextToken;
  } while (nextToken);

  return results;
}

// -----------------------------------------------------------------------------
// Data Layer — Determine Active Mining Users in Range
// -----------------------------------------------------------------------------

async function findUsersWithMiningSessionsInRange(
  client: Client<Schema>,
  users: UserMinimal[],
  startDate: string,
  endDate: string
): Promise<UserMinimal[]> {
  if (users.length === 0) return [];

  const BATCH_SIZE = 20;
  const miningUsers: UserMinimal[] = [];

  for (let i = 0; i < users.length; i += BATCH_SIZE) {
    const batch = users.slice(i, i + BATCH_SIZE);

    const batchResults = await Promise.all(
      batch.map(async (user) => {
        const latestSession = await fetchLatestMiningSessionForUser(client, user.userId);

        if (!latestSession?.startDate) return null;

        const minedInRange = DateUtils.isDateBetween(
          latestSession.startDate,
          startDate,
          endDate
        );

        return minedInRange ? user : null;
      })
    );

    for (const u of batchResults) {
      if (u) miningUsers.push(u);
    }
  }

  return miningUsers;
}

// -----------------------------------------------------------------------------
// Data Layer — Fetch Latest Session for a User
// -----------------------------------------------------------------------------

async function fetchLatestMiningSessionForUser(
  client: Client<Schema>,
  userId: string
): Promise<MiningSessionMinimal | null> {
  const response = await client.models.MiningSession.listMiningSessionsByUserId(
    { userId },
    {
      selectionSet: ["miningSessionId", "startDate"],
      sortDirection: "DESC",
      limit: 1,
    }
  );

  const session = response.data?.[0];
  if (!session) return null;

  return {
    miningSessionId: session.miningSessionId,
    startDate: session.startDate ?? null,
  };
}
