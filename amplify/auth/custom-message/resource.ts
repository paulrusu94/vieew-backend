import { defineFunction } from '@aws-amplify/backend';

export const customMessage = defineFunction({
  name: 'custom-message',
  entry: './handler.ts',
  runtime: 20,
  resourceGroupName: "auth",
  environment: {
    // change these without code changes
    LOGO_URL: 'https://d16rgqhs8425lw.cloudfront.net/logo-email.png',
    BRAND: 'VIEEW',
    PRIMARY_URL: 'https://staging.vieew.io',
  },
});
