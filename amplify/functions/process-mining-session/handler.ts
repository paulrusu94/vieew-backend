// AWS SDK imports for DynamoDB operations
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
    DynamoDBDocumentClient,
    UpdateCommand,
    TransactWriteCommand,
} from "@aws-sdk/lib-dynamodb";

// Amplify imports for GraphQL / Data operations
import { Amplify } from "aws-amplify";
import { generateClient, type Client } from "aws-amplify/data";
import { getAmplifyDataClientConfig } from "@aws-amplify/backend/function/runtime";

import { env } from "$amplify/env/process-mining-session";
import type { Schema } from "../../data/resource";

// -----------------------------
// Constants & Types
// -----------------------------

const MINING_TABLE = process.env.MINING_TABLE_NAME;
const USERS_TABLE = process.env.USERS_TABLE_NAME;
const APP_DATA_ID = "main"; // același folosit în post-confirmation / seed

if (!MINING_TABLE || !USERS_TABLE) {
    throw new Error(
        "MINING_TABLE_NAME or USERS_TABLE_NAME is not defined in environment variables."
    );
}

type MiningSessionType = Schema["MiningSession"]["type"];
type ReferralStatsResult = Schema["ReferralStatsResponse"]["type"];

// -----------------------------
// Global Amplify Data Client (lazy init)
// -----------------------------

let amplifyConfigured = false;
let dataClient: Client<Schema> | null = null;

/**
 * Lazy initialization of Amplify data client.
 * Configures Amplify once per Lambda container lifecycle and reuses the client.
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

// -----------------------------
// DynamoDB Document Client
// -----------------------------

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));

// -----------------------------
// Lambda Handler
// -----------------------------

/**
 * Lambda handler for distributing mining rewards to users.
 *
 * Triggered by EventBridge Scheduler at the end of a mining session.
 * Flow:
 * 1. Marks the mining session as PROCESSED (idempotent operation).
 * 2. Calculates reward (phase + social + streak).
 * 3. Atomically updates user balance.
 */
export const handler = async (event: { userId: string; miningSessionId: string }) => {
    const { miningSessionId, userId } = event;

    console.log("DistributeTokens event", { userId, miningSessionId });

    // Step 1: Atomically mark mining session as PROCESSED
    let session: MiningSessionType;
    try {
        const updateSession = await ddb.send(
            new UpdateCommand({
                TableName: MINING_TABLE,
                Key: { miningSessionId },
                UpdateExpression: "SET #status = :processed, rewardDistributedAt = :now",
                ConditionExpression: "#status = :progress", // Only if current status is PROGRESS
                ExpressionAttributeNames: { "#status": "status" },
                ExpressionAttributeValues: {
                    ":processed": "PROCESSED",
                    ":progress": "PROGRESS",
                    ":now": new Date().toISOString(),
                },
                ReturnValues: "ALL_NEW",
            })
        );

        session = updateSession.Attributes as unknown as MiningSessionType;
    } catch (err: any) {
        if (err.name === "ConditionalCheckFailedException") {
            console.log(
                "Mining session already processed or not in PROGRESS, skipping reward.",
                { miningSessionId, userId }
            );
            return { ok: true, message: "Session already processed or not in PROGRESS" };
        }
        console.error("Error updating mining session status:", err);
        throw err;
    }

    // Step 2: Calculate reward
    const reward = await calcRewardForSession(userId, session);

    // Step 3: Atomically update user balance
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
                            ConditionExpression: "attribute_exists(userId)", // ensure user exists
                        },
                    },
                ],
            })
        );
    } catch (err) {
        console.error("Error updating user balance:", err);
        throw err;
    }

    console.log("Reward distributed", { userId, miningSessionId, reward });

    return { ok: true, miningSessionId, userId, reward };
};

// -----------------------------
// Reward Calculation
// -----------------------------

/**
 * Calculates the reward amount for a completed mining session.
 *
 * Components:
 * 1. Base reward based on total registered users (phases).
 * 2. Social multiplier based on active invited users (who mined within this session interval).
 * 3. Streak multiplier based on 7 consecutive days of mining ending with this session.
 */
async function calcRewardForSession(
    userId: string,
    session: MiningSessionType
): Promise<number> {
    const client = await getDataClient();

    // 1️⃣ Determine phase by total registered users
    const usersCount = await getCurrentUsersCount(client);
    const baseReward = getBaseRewardByUsersCount(usersCount);

    // 2️⃣ Social multiplier – invited users mining in this session's interval
    const sessionStart = session.startDate || new Date().toISOString();
    const sessionEnd = session.endDate || new Date().toISOString();

    let activeInviteesCount = 0;
    try {
        const { allMininngUsers } = await getReferralStatsForUser(
            client,
            userId,
            sessionStart,
            sessionEnd
        );
        activeInviteesCount = allMininngUsers.length;
    } catch (err) {
        console.error("Error fetching referral stats for reward calculation:", err);
        // fallback: no social bonus
        activeInviteesCount = 0;
    }

    const cappedActive = Math.min(activeInviteesCount, 20);
    const socialMultiplier = 1 + cappedActive * 0.2; // 20% per active invited user

    // 3️⃣ Streak multiplier – 7 consecutive days ending with this session
    const streak = await hasSevenDayStreak(client, userId, session);
    const streakMultiplier = streak ? 1.2 : 1.0; // +20% if streak


    const rawReward = baseReward * socialMultiplier * streakMultiplier;

    // Floor to 3 decimal places & non-negative
    const finalReward = Math.max(0, Math.floor(rawReward * 1000) / 1000);

    console.log("Reward calculation details", {
        userId,
        miningSessionId: session.miningSessionId,
        usersCount,
        baseReward,
        activeInviteesCount,
        cappedActive,
        socialMultiplier,
        streak,
        streakMultiplier,
        rawReward,
        finalReward,
    });

    return finalReward;
}

// -----------------------------
// Base Reward / Phases (AppData)
// -----------------------------

async function getCurrentUsersCount(client: Client<Schema>): Promise<number> {
    try {
        const res = await client.models.AppData.get({ id: APP_DATA_ID });
        const appData = res.data;
        return appData?.registeredUsersCount ?? 0;
    } catch (err) {
        console.error("Error reading AppData.registeredUsersCount:", err);
        return 0;
    }
}

function getBaseRewardByUsersCount(userCount: number): number {
    if (userCount <= 10_000) return 24; // Early Adopters
    if (userCount <= 20_000) return 20; // Early Adopters
    if (userCount <= 30_000) return 16; // Creștere timpurie
    if (userCount <= 60_000) return 12; // Expansiune
    if (userCount <= 100_000) return 8;
    return 6; // Stabilizare (60k+)
}

// -----------------------------
// Referral Stats (social bonus)
// -----------------------------

/**
 * Retrieves referral statistics for a user during the given session interval.
 *
 * Interval semantics:
 * - We use session.startDate and session.endDate of the current MiningSession.
 * - A referred user counts as "active" if they have a MiningSession whose startDate
 *   is between [sessionStart, sessionEnd] (inclusive).
 */
async function getReferralStatsForUser(
    client: Client<Schema>,
    userId: string,
    sessionStart: string,
    sessionEnd: string
): Promise<ReferralStatsResult> {
    // 1️⃣ Get user to access their referralCode
    const userRes = await client.models.User.get({ userId });
    const user = userRes.data;

    if (!user?.referralCode) {
        return {
            allInvitedUsers: [],
            allMininngUsers: [],
        };
    }

    // 2️⃣ Call getReferralStats query (GraphQL resolver)
    const res = await client.queries.getReferralStats({
        referralCode: user.referralCode,
        startDate: sessionStart,
        endDate: sessionEnd,
    });

    const payload = res.data;

    return {
        allInvitedUsers: payload?.allInvitedUsers ?? [],
        allMininngUsers: payload?.allMininngUsers ?? [],
    };
}

// -----------------------------
// Streak (7 consecutive days, ending with this session)
// -----------------------------

/**
 * Checks if the user has a 7-day mining streak, where:
 * - The LAST day of the streak is the day of the current mining session (by endDate if present, else startDate).
 * - There is at least one MiningSession on each of the previous 6 days.
 *
 * Implementation:
 * - Fetch last N sessions for user via listMiningSessionsByUserId (sorted DESC).
 * - Build a list of unique day keys (YYYY-MM-DD) in descending order.
 * - Find the index of the current session's day.
 * - Walk forward through that list to verify 6 previous consecutive days.
 */
async function hasSevenDayStreak(
    client: Client<Schema>,
    userId: string,
    currentSession: MiningSessionType
): Promise<boolean> {
    // 1️⃣ Stabilim ziua de referință = ziua sesiunii curente (endDate sau startDate)
    const referenceISO =
        currentSession.endDate ||
        currentSession.startDate ||
        new Date().toISOString();

    const referenceDate = new Date(referenceISO);
    if (Number.isNaN(referenceDate.getTime())) {
        return false;
    }

    // de la ziua curentă înapoi 6 zile = 7 zile în total
    const from = new Date(referenceDate);
    from.setDate(referenceDate.getDate() - 6);

    try {
        // 2️⃣ Luăm toate sesiunile userului în intervalul [from, referenceDate]
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

        // 3️⃣ Construim un set cu zilele în care a minat (YYYY-MM-DD)
        const daySet = new Set(
            sessions
                .filter((s) => !!s.startDate)
                .map((s) => new Date(s.startDate!).toISOString().slice(0, 10))
        );

        // 4️⃣ Verificăm pentru fiecare din cele 7 zile dacă există în set
        for (let offset = 0; offset < 7; offset++) {
            const d = new Date(referenceDate);
            d.setDate(referenceDate.getDate() - offset);
            const key = d.toISOString().slice(0, 10);
            if (!daySet.has(key)) {
                return false;
            }
        }

        return true;
    } catch (err) {
        console.error("Error checking 7-day streak:", { userId, err });
        return false;
    }
}
