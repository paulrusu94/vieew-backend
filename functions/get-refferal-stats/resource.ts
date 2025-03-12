
import {defineFunction} from '@aws-amplify/backend';
  
  export const getRefferalStats = defineFunction({
    name: 'get-refferal-stats',
    entry: './handler.ts',
  })