
import {defineFunction} from '@aws-amplify/backend';
  
  export const referralStatsService = defineFunction({
    name: 'referral-stats-service',
    entry: './handler.ts',
    resourceGroupName: 'data'
  })