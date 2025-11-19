import { defineFunction } from '@aws-amplify/backend';

export const customMessage = defineFunction({
  name: 'custom-message',
  entry: './handler.ts',
  runtime: 20,
  resourceGroupName: "auth",
  environment: {
    // change these without code changes
    LOGO_URL: 'https://images.prismic.io/vieew/aPJHp55xUNkB2GKn_logo-vieew-1-sec.png',
    BRAND: 'VIEEW',
    PRIMARY_URL: 'https://vieew.io',
  },
});
