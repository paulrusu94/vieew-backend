import { type Schema } from "../../data/resource";
import { Amplify } from "aws-amplify";
import { Client, generateClient } from "aws-amplify/data";
import { env } from "$amplify/env/get-referral-stats";
import { getAmplifyDataClientConfig } from '@aws-amplify/backend/function/runtime';
import { DateUtils } from "../shared/utils/date"

const { resourceConfig, libraryOptions } = await getAmplifyDataClientConfig(env);
Amplify.configure(resourceConfig, libraryOptions);


export const handler: Schema["getReferralStats"]["functionHandler"] = async (event) => {

    try {
        const client = generateClient<Schema>({ authMode: "iam" });

        console.log("EVENT:", event);
        console.log("ARGUMENTS:", event.arguments);
        
        const res = await getReferralStats(client, event.arguments);
        const {allInvitedUsers, allMininngUsers}  = res;
        return {
            allInvitedUsers,
            allMininngUsers
        };

    } catch (error) {
        console.error('Error getting referral stats:', error);
        // return {
            // error: error instanceof Error ? error.message : 'Unknown error'
        // };
    }
};

async function getReferralStats(
    client: Client<Schema>,
    input: any
): Promise<any> {
    // Get all invited users
    console.log("INPUT", input)
    const allInvitedUsers = await getAllInvitedUsers(client, input.referralCode);
    console.log('Total invited users:', allInvitedUsers.length);
    console.log('Invited users:', allInvitedUsers);

    // Process mining sessions for invited users
    const invitedMiningUsers = await processInvitedUsersMining(
        client,
        allInvitedUsers,
        input.startDate,
        input.endDate
    );
    console.log('Invited users with mining sessions:', invitedMiningUsers);
    console.log('Total invited users with mining sessions:', invitedMiningUsers.length);

    return {
        allInvitedUsers: allInvitedUsers,
        allMininngUsers: invitedMiningUsers
    };
}

async function processInvitedUsersMining(
    client: Client<Schema>,
    users: Array<any>,
    startDate: string,
    endDate: string
): Promise<Array<any>> {
    const miningUsers = await Promise.all(
        users.map(async (user) => {

            // to do, see why filtering is not working in query
            const sessions = await client.models.MiningSession.listMiningSessionsByUserId(
                { 
                    userId: user.userId 
                }, {
                    selectionSet: ["miningSessionId", "startDate"],
                    sortDirection: "DESC"
                }
            );

            console.log(sessions)

            return sessions.data 
                && sessions.data.length > 0 
                && sessions.data[0].startDate
                && DateUtils.isDateBetween(sessions.data[0].startDate, startDate, endDate) ? user : null;
        })
    );

    return miningUsers.filter((user): user is { userId: string } => user !== null);
}

async function getAllInvitedUsers(
    client: Client<Schema>,
    referralCode: string
): Promise<Array<any>> {
    const pageSize = 100;
    let allUsers: Array<any> = [];
    let nextToken: string | null | undefined;

    do {
        const response: any = await client.models.User.listUsersReferredByCode(
            { referredByUserCode: referralCode },
            {
                limit: pageSize,
                selectionSet: ["userId"],
                nextToken
            }
        );

        allUsers = [...allUsers, ...response.data];
        nextToken = response.nextToken;
    } while (nextToken);

    return allUsers;
}