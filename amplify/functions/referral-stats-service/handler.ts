import { Amplify } from "aws-amplify";
import { generateClient, type Client } from "aws-amplify/data";
import { getAmplifyDataClientConfig } from "@aws-amplify/backend/function/runtime";

import { env } from "$amplify/env/referral-stats-service";
import type { Schema } from "../../data/resource";
import { DateUtils } from "../shared/utils/date";

// ---------------------------------------------------------
// Types
// ---------------------------------------------------------

type ReferralStatsHandler = Schema["getReferralStats"]["functionHandler"];
type ReferralStatsArgs = ReferralStatsHandler["arguments"];
type ReferralStatsResponse = Schema["ReferralStatsResponse"]["type"];

type UserMinimal = { userId: string };
type MiningSessionMinimal = { miningSessionId: string; startDate: string | null | undefined };

// ---------------------------------------------------------
// Amplify Data client – singleton per Lambda environment
// ---------------------------------------------------------

const { resourceConfig, libraryOptions } = await getAmplifyDataClientConfig(env);
Amplify.configure(resourceConfig, libraryOptions);

const dataClient: Client<Schema> = generateClient<Schema>({ authMode: "iam" });

// ---------------------------------------------------------
// Public handler
// ---------------------------------------------------------

export const handler: ReferralStatsHandler = async (event) => {
  const logContext = {
    function: "referral-stats-service",
    requestId: (event as any)?.request?.requestId ?? "n/a"
  };

  try {
    console.log("[referral-stats-service] EVENT", {
      ...logContext,
      arguments: event.arguments
    });

    const result = await getReferralStatsService(dataClient, event.arguments);

    console.log("[referral-stats-service] RESULT", {
      ...logContext,
      invitedCount: result.allInvitedUsers.length,
      miningCount: result.allMininngUsers.length
    });

    return result;
  } catch (error) {
    console.error("[referral-stats-service] ERROR", {
      ...logContext,
      error: error instanceof Error ? error.message : String(error)
    });

    // IMPORTANT: întoarcem mereu un obiect valid conform schema
    const fallback: ReferralStatsResponse = {
      allInvitedUsers: [],
      allMininngUsers: []
    };

    return fallback;
  }
};

// ---------------------------------------------------------
// Core service
// ---------------------------------------------------------

async function getReferralStatsService(
  client: Client<Schema>,
  input: ReferralStatsArgs
): Promise<ReferralStatsResponse> {
  const { referralCode, startDate, endDate } = input;

  // Guard clauses – validare input minim
  if (!referralCode) {
    console.warn("[getReferralStatsService] Missing referralCode");
    return {
      allInvitedUsers: [],
      allMininngUsers: []
    };
  }

  // 1️⃣ Toți userii invitați
  const invitedUsers = await fetchAllInvitedUsers(client, referralCode);

  if (invitedUsers.length === 0) {
    return {
      allInvitedUsers: [],
      allMininngUsers: []
    };
  }

  // 2️⃣ If startDate and endDate are provided, filter for active users in that period
  // Otherwise, return all invited users
  if (startDate && endDate) {
    const miningUsers = await findUsersWithMiningSessionsInRange(
      client,
      invitedUsers,
      startDate,
      endDate
    );

    return {
      allInvitedUsers: invitedUsers.map((u) => u.userId),
      allMininngUsers: miningUsers.map((u) => u.userId)
    };
  } else {
    return {
      allInvitedUsers: invitedUsers.map((u) => u.userId),
      allMininngUsers: []
    };
  }
}

// ---------------------------------------------------------
// Layer 1 – Fetch all invited users (paginated)
// ---------------------------------------------------------

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
        nextToken
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

// ---------------------------------------------------------
// Layer 2 – Determine who has mining sessions in range
// ---------------------------------------------------------

async function findUsersWithMiningSessionsInRange(
  client: Client<Schema>,
  users: UserMinimal[],
  startDate: string,
  endDate: string
): Promise<UserMinimal[]> {
  if (users.length === 0) return [];

  // Concurrency control: procesăm în batch-uri (ex: 20 users / batch)
  const BATCH_SIZE = 20;
  const miningUsers: UserMinimal[] = [];

  for (let i = 0; i < users.length; i += BATCH_SIZE) {
    const batch = users.slice(i, i + BATCH_SIZE);

    const batchResults = await Promise.all(
      batch.map(async (user) => {
        const latestSession = await fetchLatestMiningSessionForUser(client, user.userId);

        if (!latestSession?.startDate) {
          return null;
        }

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

// ---------------------------------------------------------
// Layer 3 – Fetch latest mining session for a single user
// ---------------------------------------------------------

async function fetchLatestMiningSessionForUser(
  client: Client<Schema>,
  userId: string
): Promise<MiningSessionMinimal | null> {
  const response = await client.models.MiningSession.listMiningSessionsByUserId(
    { userId },
    {
      selectionSet: ["miningSessionId", "startDate"],
      sortDirection: "DESC",
      limit: 1
    }
  );

  const session = response.data?.[0];

  if (!session) {
    return null;
  }

  return {
    miningSessionId: session.miningSessionId,
    startDate: session.startDate ?? null
  };
}
