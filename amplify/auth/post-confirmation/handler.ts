import type { PostConfirmationTriggerHandler } from "aws-lambda";
import { getAmplifyDataClientConfig } from '@aws-amplify/backend/function/runtime';
import { type Schema } from "../../data/resource";
import { Amplify } from "aws-amplify";
import { env } from "$amplify/env/post-confirmation";
import { generateClient } from "aws-amplify/data";

const { resourceConfig, libraryOptions } = await getAmplifyDataClientConfig(env);
Amplify.configure(resourceConfig, libraryOptions);

function generateReferralCode(): string {
    try {
        const randomPart = Math.floor(Math.random() * 10000000).toString(36);
        
        const timestampPart = Date.now().toString(36).slice(-4);

        return (randomPart + timestampPart).toUpperCase().slice(0, 8);
    } catch (error) {
        throw new Error(`Failed to generate referral code: ${error instanceof Error ? error.message : String(error)}`);
    }
}


export const handler: PostConfirmationTriggerHandler = async (event) => {
    const userId = event.request.userAttributes.sub;
    const email = event.request.userAttributes.email;
    
    console.log("post-confirmation: starting user creation", {
        userId,
        email,
        triggerSource: event.triggerSource,
        userPoolId: event.userPoolId
    });
    
    try {
        console.log('post-confirmation: creating user record', {
            userId: event.request.userAttributes.sub,
            sub: event.request.userAttributes.sub,
            email: event.request.userAttributes.email,
            owner: `${event.request.userAttributes.sub}::${event.userName}`,
            firstName: event.request.userAttributes.given_name,
            lastName: event.request.userAttributes.family_name,
            referredByUserCode: event.request.userAttributes["custom:referred_by"]
        });

        const client = generateClient<Schema>({
            authMode: "iam",
        });

        const newreferralCode = generateReferralCode();
        console.log("post-confirmation: generated referral code", {
            userId,
            referralCode: newreferralCode
        });

        const createResponse = await client.models.User.create({
            userId: event.request.userAttributes.sub,
            sub: event.request.userAttributes.sub,
            email: event.request.userAttributes.email,
            owner: `${event.request.userAttributes.sub}::${event.userName}`,
            firstName: event.request.userAttributes.given_name || "",
            lastName: event.request.userAttributes.family_name || "",
            referredByUserCode: event.request.userAttributes["custom:referred_by"],
            referralCode: newreferralCode
        })

        console.log("post-confirmation: user created successfully", {
            userId,
            email,
            referralCode: newreferralCode,
            createResponseData: createResponse.data?.userId
        });

    } catch (err) {
        console.error('post-confirmation: failed to create user', {
            userId,
            email,
            error: err instanceof Error ? err.message : String(err),
            stack: err instanceof Error ? err.stack : undefined
        });
        throw err;
    }
    
    console.log('post-confirmation: handler completed successfully', { userId, email });
    return event;
};