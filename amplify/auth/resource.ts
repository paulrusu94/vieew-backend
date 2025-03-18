import { defineAuth } from '@aws-amplify/backend';
import { postConfirmation } from './post-connfirmation/resource';

/**
 * Define and configure your auth resource
 * @see https://docs.amplify.aws/gen2/build-a-backend/auth
 */
export const auth = defineAuth({
  name: "vieewauthservice",
  loginWith: {
    email: true
  },
  userAttributes: {
    preferredUsername: {
      mutable: true,
      required: false
    },
    "custom:referred_by":{
      dataType: 'String',
      maxLen: 16
    }
  },
  triggers: {
    postConfirmation
  }
});
