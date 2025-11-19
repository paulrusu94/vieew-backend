// -----------------------------------------------------------------------------
// process-mining-session
// Marks a MiningSession as PROCESSED and distributes rewards accordingly.
// Triggered automatically by EventBridge at session end.
// -----------------------------------------------------------------------------

// DynamoDB (Document Client)
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
    DynamoDBDocumentClient,
    UpdateCommand,
    TransactWriteCommand,
} from "@aws-sdk/lib-dynamodb";

// Amplify Data
import { Amplify } from "aws-amplify";
import { generateClient, type Client } from "aws-amplify/data";
import { getAmplifyDataClientConfig } from "@aws-amplify/backend/function/runtime";

import { env } from "$amplify/env/process-mining-session";
import type { Schema } from "../../data/resource";

// -----------------------------------------------------------------------------
// Constants & Types
// -----------------------------------------------------------------------------

const LOG_PREFIX = "process-mining-session";

const MINING_TABLE = process.env.MINING_TABLE_NAME;
const USERS_TABLE = process.env.USERS_TABLE_NAME;

const APP_DATA_ID = "main";

if (!MINING_TABLE || !USERS_TABLE) {
    throw new Error(
        `${LOG_PREFIX}: Missing MINING_TABLE_NAME or USERS_TABLE_NAME env vars`
    );
}

type MiningSessionType = Schema["MiningSession"]["type"];
type ReferralStatsResult = Schema["ReferralStatsResponse"]["type"];

// -----------------------------------------------------------------------------
// Amplify Data Client (singleton)
// -----------------------------------------------------------------------------

let amplifyConfigured = false;
let dataClient: Client<Schema> | null = null;

/**
 * Lazily initializes Amplify Data client using IAM auth.
 * Ensures Amplify.configure runs only once per Lambda container.
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
// DynamoDB Document Client
// -----------------------------------------------------------------------------

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));

// -----------------------------------------------------------------------------
// Handler
// -----------------------------------------------------------------------------

/**
 * Handler triggered by EventBridge Scheduler.
 *
 * Performs:
 * 1. Safely marks session as PROCESSED (idempotent using conditional update)
 * 2. Computes reward using base phase, social multiplier, streak multiplier
 * 3. Atomically updates user balance
 */
export const handler = async (event: { userId: string; miningSessionId: string }) => {
    const { miningSessionId, userId } = event;

    console.log(`${LOG_PREFIX}: received event`, { userId, miningSessionId });

    // -------------------------------------------------------------------------
    // 1. Mark session as PROCESSED (idempotent)
    // -------------------------------------------------------------------------

    let session: MiningSessionType;

    try {
        const updateResp = await ddb.send(
            new UpdateCommand({
                TableName: MINING_TABLE,
                Key: { miningSessionId },
                UpdateExpression: "SET #status = :processed, rewardDistributedAt = :ts",
                ConditionExpression: "#status = :progress", // Only update if still PROGRESS
                ExpressionAttributeNames: { "#status": "status" },
                ExpressionAttributeValues: {
                    ":processed": "PROCESSED",
                    ":progress": "PROGRESS",
                    ":ts": new Date().toISOString(),
                },
                ReturnValues: "ALL_NEW",
            })
        );

        session = updateResp.Attributes as MiningSessionType;
    } catch (err: any) {
        if (err.name === "ConditionalCheckFailedException") {
            console.log(
                `${LOG_PREFIX}: session already processed or not in PROGRESS`,
                { miningSessionId, userId }
            );
            return { ok: true, message: "Session already processed" };
        }

        console.error(`${LOG_PREFIX}: failed to update session`, { error: err });
        throw err;
    }

    // -------------------------------------------------------------------------
    // 2. Calculate reward
    // -------------------------------------------------------------------------

    const reward = await calculateReward(userId, session);

    // -------------------------------------------------------------------------
    // 3. Update user balance (atomic)
    // -------------------------------------------------------------------------

    try {
        await ddb.send(
            new TransactWriteCommand({
                TransactItems: [
                    {
                        Update: {
                            TableName: USERS_TABLE,
                            Key: { userId },
                            UpdateExpression:
                                "SET #balance = if_not_exists(#balance, :zero) + :inc",
                            ExpressionAttributeNames: { "#balance": "balance" },
                            ExpressionAttributeValues: { ":inc": reward, ":zero": 0 },
                            ConditionExpression: "attribute_exists(userId)",
                        },
                    },
                ],
            })
        );
    } catch (err) {
        console.error(`${LOG_PREFIX}: failed to update user balance`, { err, userId });
        throw err;
    }

    console.log(`${LOG_PREFIX}: reward distributed`, {
        miningSessionId,
        userId,
        reward,
    });

    return { ok: true, miningSessionId, userId, reward };
};

// -----------------------------------------------------------------------------
// Reward Calculation
// -----------------------------------------------------------------------------

/**
 * Computes final reward:
 * - base reward (phase)
 * - social multiplier (invitees active during session interval)
 * - streak multiplier (7-day streak)
 */
async function calculateReward(
    userId: string,
    session: MiningSessionType
): Promise<number> {
    const client = await getDataClient();

    // Base reward from total user count
    const usersCount = await getRegisteredUsersCount(client);
    const baseReward = getBaseReward(usersCount);

    // Social multiplier
    const start = session.startDate!;
    const end = session.endDate || new Date().toISOString();

    let inviteesActive = 0;
    try {
        const { allMiningUsers } = await fetchReferralActivity(client, userId, start, end);
        inviteesActive = allMiningUsers.length;
    } catch (err) {
        console.error(`${LOG_PREFIX}: error determining social bonus`, err);
    }

    const cappedInvitees = Math.min(inviteesActive, 20);
    const socialMultiplier = 1 + cappedInvitees * 0.2;

    // Streak multiplier
    const streak = await hasSevenDayStreak(client, userId, session);
    const streakMultiplier = streak ? 1.2 : 1.0;

    // Final reward (3-decimals floor)
    const raw = baseReward * socialMultiplier * streakMultiplier;
    const finalReward = Math.max(0, Math.floor(raw * 1000) / 1000);

    console.log(`${LOG_PREFIX}: reward components`, {
        userId,
        sessionId: session.miningSessionId,
        usersCount,
        baseReward,
        inviteesActive,
        socialMultiplier,
        streak,
        streakMultiplier,
        raw,
        finalReward,
    });

    return finalReward;
}

// -----------------------------------------------------------------------------
// Base Reward (Phase System)
// -----------------------------------------------------------------------------

async function getRegisteredUsersCount(client: Client<Schema>): Promise<number> {
    try {
        const result = await client.models.AppData.get({ id: APP_DATA_ID });
        return result.data?.registeredUsersCount ?? 0;
    } catch (err) {
        console.error(`${LOG_PREFIX}: failed to read AppData`, err);
        return 0;
    }
}

function getBaseReward(userCount: number): number {
    if (userCount <= 10_000) return 24;
    if (userCount <= 20_000) return 20;
    if (userCount <= 30_000) return 16;
    if (userCount <= 60_000) return 12;
    if (userCount <= 100_000) return 8;
    return 6;
}

// -----------------------------------------------------------------------------
// Referral Social Bonus
// -----------------------------------------------------------------------------

async function fetchReferralActivity(
    client: Client<Schema>,
    userId: string,
    sessionStart: string,
    sessionEnd: string
): Promise<ReferralStatsResult> {
    const userRes = await client.models.User.get({ userId });
    const user = userRes.data;

    if (!user?.referralCode) {
        return { allInvitedUsers: [], allMiningUsers: [] };
    }

    const stats = await client.queries.getReferralStats({
        referralCode: user.referralCode,
        startDate: sessionStart,
        endDate: sessionEnd,
    });

    const payload = stats.data;

    return {
        allInvitedUsers: payload?.allInvitedUsers ?? [],
        allMiningUsers: payload?.allMiningUsers ?? [],
    };
}

// -----------------------------------------------------------------------------
// Streak (7 consecutive mining days)
// -----------------------------------------------------------------------------

async function hasSevenDayStreak(
    client: Client<Schema>,
    userId: string,
    currentSession: MiningSessionType
): Promise<boolean> {
    const referenceISO = currentSession.endDate!;
    const referenceDate = new Date(referenceISO);

    if (Number.isNaN(referenceDate.getTime())) {
        return false;
    }

    const from = new Date(referenceDate);
    from.setDate(referenceDate.getDate() - 6);

    try {
        const res = await client.models.MiningSession.list({
            filter: {
                userId: { eq: userId },
                startDate: {
                    between: [from.toISOString(), referenceDate.toISOString()],
                },
            },
            selectionSet: ["miningSessionId", "startDate"],
            limit: 200,
        });

        const sessions = res.data ?? [];
        if (!sessions.length) return false;

        // Days user mined (YYYY-MM-DD)
        const days = new Set(
            sessions
                .filter((s) => s.startDate)
                .map((s) => new Date(s.startDate!).toISOString().slice(0, 10))
        );

        for (let offset = 0; offset < 7; offset++) {
            const d = new Date(referenceDate);
            d.setDate(referenceDate.getDate() - offset);
            const key = d.toISOString().slice(0, 10);

            if (!days.has(key)) {
                return false;
            }
        }

        return true;
    } catch (err) {
        console.error(`${LOG_PREFIX}: failed to check streak`, { userId, err });
        return false;
    }
}
