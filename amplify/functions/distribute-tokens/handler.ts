
import { type Schema } from "../../data/resource";
import { Amplify } from "aws-amplify";
import { generateClient } from "aws-amplify/data";
import { env } from "$amplify/env/distribute-tokens";
import { getAmplifyDataClientConfig } from '@aws-amplify/backend/function/runtime';

import { TokenService } from '../shared/services/token';

const { resourceConfig, libraryOptions } = await getAmplifyDataClientConfig(env);
Amplify.configure(resourceConfig, libraryOptions);

const APP_DATA_ID = "main"

export const handler = async (event: { userId: string, miningSessionId: string }) => {
    // Immediate logging of the event
    console.log('Received event:', JSON.stringify(event, null, 2));

    try {


        const { userId, miningSessionId } = event;
        let invitedUsersCount = 0;
        let invitedUsersMiningCount = 0;
        let invitedUsers: Array<any> = []
        let invitedUsersMining: Array<any> = []
        console.log('Processing token distribution for:', { userId, miningSessionId });

        const client = generateClient<Schema>({
            authMode: "iam",
        });

        // Get app data
        const resAppData = await client.models.AppData.get({ id: APP_DATA_ID });
        console.log('AppData retrieved:', resAppData);

        const appData = resAppData.data;
        if (!appData?.registeredUsersCount) {
            console.log('No registered users found');
            return {
                statusCode: 400,
                body: JSON.stringify({ message: 'No registered users found' })
            };
        }

        // Get user data
        const resUser = await client.models.User.get({ userId: userId });
        console.log('User retrieved:', resUser);

        const userData = resUser.data;
        if (!userData) {
            console.log('User not found');
            return {
                statusCode: 404,
                body: JSON.stringify({ message: 'User not found' })
            };
        }

        // Get mining session
        const miningSessionRes = await client.models.MiningSession.get({ miningSessionId });
        console.log('Mining session retrieved:', miningSessionRes);

        const miningSessionData = miningSessionRes.data;
        if (!miningSessionData) {
            console.log('Mining session not found');
            return {
                statusCode: 404,
                body: JSON.stringify({ message: 'Mining session not found' })
            };
        }

        console.log('Processing referral code:', userData.referralCode);

        const referralStatsResponse = await client.queries.getReferralStats({
            startDate: miningSessionData.startDate,
            endDate: miningSessionData.endDate,
            referralCode: userData.referralCode
        })

        const dailyReward = TokenService.getDailyRate(appData.registeredUsersCount);
        let referralReward: number = 0;

        const referralStatsData = referralStatsResponse.data

        if (referralStatsData?.allInvitedUsers) {

            invitedUsers = referralStatsData.allInvitedUsers;
            invitedUsersMining = referralStatsData.allMininngUsers;
            invitedUsersCount = referralStatsData.allInvitedUsers.length;
            invitedUsersMiningCount = referralStatsData.allMininngUsers.length;

            console.log('Referral stats:', {
                invitedUsersCount,
                invitedUsersMiningCount
            });

            if (invitedUsersCount > 0) {
                const minedUserProportion = invitedUsersMiningCount / invitedUsersCount;
                const referralLevelPercent = TokenService.getReferralLevelPercent(invitedUsersCount);
                const referralMiningPercent = referralLevelPercent * minedUserProportion;
                referralReward = dailyReward * (referralMiningPercent / 100);
            }

        }
            
            // Calculate rewards
            

            console.log('Reward calculation:', {
                invitedUsers,
                dailyReward,
                referralReward
            });

            // Here you would typically save the reward
            const updateUserResponse = await client.models.User.update({
                userId: userId,
                balance: (userData.balance || 0) + referralReward + dailyReward,
            });
            console.log('Updated user balance:', updateUserResponse);
            return updateUserResponse

    } catch (error) {
        console.error('Error in distribute tokens:', error);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: 'Internal server error' })
        };
    }
};