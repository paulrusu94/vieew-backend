export interface AppData {
    id: string;
    registeredUsersCount: number;
}

export interface User {
    userId: string;
    referralCode?: string;
    tokens?: number;
}

export interface MiningSession {
    miningSessionId: string;
    userId: string;
    startDate: string;
    endDate: string;
}

export interface AmplifyClientOptions {
    authMode?: "userPool" | "iam" | "apiKey" | "lambda";
    retryOptions?: {
        maxRetries: number;
        backoff: number;
    },
    logging?: boolean;
}

export interface DataClientEnv {
    AWS_ACCESS_KEY_ID: string;
    AWS_SECRET_ACCESS_KEY: string;
    AWS_SESSION_TOKEN: string;
    AWS_REGION: string;
    AMPLIFY_DATA_DEFAULT_NAME: string;
    [key: string]: string | undefined;
}

export interface referralUser{
    userId: string;
}

export interface ListreferralUsers {
    data: referralUser[];
    nextToken?: string | null;
}