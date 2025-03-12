import type { PostConfirmationTriggerHandler } from "aws-lambda";
import { getAmplifyDataClientConfig } from '@aws-amplify/backend/function/runtime';
import { type Schema } from "../../data/resource";
import { Amplify } from "aws-amplify";
import { env } from "$amplify/env/post-confirmation";
import { generateClient } from "aws-amplify/data";



const { resourceConfig, libraryOptions } = await getAmplifyDataClientConfig(env);
Amplify.configure(resourceConfig, libraryOptions);


const APP_DATA_ID="main";

function generateReferralCode(): string {
    const randomPart = Math.floor(Math.random() * 10000000).toString(36);
    
    const timestampPart = Date.now().toString(36).slice(-4);

    return (randomPart + timestampPart).toUpperCase().slice(0, 8);
}


export const handler: PostConfirmationTriggerHandler = async (event) => {
    try {
        console.log('creating user:', {
            userId: event.request.userAttributes.sub,
            sub: event.request.userAttributes.sub,
            email: event.request.userAttributes.email,
            owner: `${event.request.userAttributes.sub}::${event.userName}`,
            firstName: event.request.userAttributes.given_name,
            lastName: event.request.userAttributes.family_name,
            referredByUserCode: event.request.clientMetadata?.referredByUserCode
        });

        const client = generateClient<Schema>({
            authMode: "iam",
        });

        const newReferralCode = generateReferralCode();
        console.log("user's newReferralCode", newReferralCode);

        await client.models.User.create({
            userId: event.request.userAttributes.sub,
            sub: event.request.userAttributes.sub,
            email: event.request.userAttributes.email,
            owner: `${event.request.userAttributes.sub}::${event.userName}`,
            firstName: event.request.userAttributes.given_name,
            lastName: event.request.userAttributes.family_name,
            referredByUserCode: event.request.clientMetadata?.referredByUserCode,
            refferalCode: newReferralCode
        })
        
        // await client.graphql({
        //     query: createUser,
        //     variables: {
        //         input: {
        //             userId: event.request.userAttributes.sub,
        //             sub: event.request.userAttributes.sub,
        //             email: event.request.userAttributes.email,
        //             owner: `${event.request.userAttributes.sub}::${event.userName}`,
        //             firstName: event.request.userAttributes.given_name,
        //             lastName: event.request.userAttributes.family_name,
        //             referredByUserCode: event.request.clientMetadata?.referredByUserCode,
        //             refferalCode: newReferralCode
        //         },
        //     },
        // });

        const resAppData: any = await client.models.AppData.get({id: APP_DATA_ID})

        // const resAppData: any = await client.graphql({
        //     query: getAppData,
        //     variables: {
        //         id: APP_DATA_ID 
        //     }
        // })

        const currentCount = resAppData.data.registeredUsersCount || 0;
        
        console.log("registeredUsersCount", currentCount);    
        
        // await client.graphql({
        //     query: updateAppData,
        //     variables: {
        //         input: {
        //             id: APP_DATA_ID,
        //             registeredUsersCount: currentCount + 1
        //         }
        //     }
        // });

        await client.models.AppData.update({id: APP_DATA_ID, registeredUsersCount: currentCount + 1})


    } catch (err) {
        console.error('error creating user', err)
        throw err

    }
    console.log('success. user created')
    return event;
};