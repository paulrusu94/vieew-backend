
import {defineFunction} from '@aws-amplify/backend';
  
  export const getReferralStats = defineFunction({
    name: 'get-referral-stats',
    entry: './handler.ts',
  })