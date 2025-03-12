import { Amplify } from "aws-amplify";
import { generateClient } from "aws-amplify/data";
import { Schema } from "../../../data/resource";
import { getAmplifyDataClientConfig } from '@aws-amplify/backend/function/runtime';

import { type AmplifyClientOptions, type DataClientEnv } from '../types';

export class AmplifyConfig {
    private static readonly DEFAULT_OPTIONS: AmplifyClientOptions = {
        authMode: "iam",
        retryOptions: {
            maxRetries: 3,
            backoff: 1000
        },
        logging: true
    };

    static async initializeClient<T extends Schema>(
        functionEnv: DataClientEnv,
        options: Partial<AmplifyClientOptions> = {}
    ) {
        const finalOptions = {
            ...this.DEFAULT_OPTIONS,
            ...options
        };

        try {
            if (finalOptions.logging) {
                console.log('Initializing Amplify client with options:', finalOptions);
            }

            const { resourceConfig, libraryOptions } = await getAmplifyDataClientConfig(functionEnv);
            
            // Add retry logic
            const configWithRetry = {
                ...resourceConfig,
                retry: finalOptions.retryOptions
            };

            Amplify.configure(configWithRetry, libraryOptions);

            return generateClient<T>({ 
                authMode: finalOptions.authMode
            });
        } catch (error) {
            console.error('Error initializing Amplify client:', error);
            throw new Error('Failed to initialize Amplify client');
        }
    }

    static async withRetry<T>(
        operation: () => Promise<T>,
        options: AmplifyClientOptions['retryOptions']
    ): Promise<T> {
        let lastError: Error;
        for (let i = 0; i < (options?.maxRetries || 3); i++) {
            try {
                return await operation();
            } catch (error) {
                lastError = error as Error;
                if (i < (options?.maxRetries || 3) - 1) {
                    await new Promise(resolve => 
                        setTimeout(resolve, (options?.backoff || 1000) * Math.pow(2, i))
                    );
                }
            }
        }
        throw lastError!;
    }
}
