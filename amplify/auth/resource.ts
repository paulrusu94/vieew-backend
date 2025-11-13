import { defineAuth, secret } from '@aws-amplify/backend';
import { postConfirmation } from './post-confirmation/resource';
import { preSignUp } from './pre-signup/resource';
import { customMessage } from './custom-message/resource';
import { postAuthentication } from './post-authentication/resource';

/**
 * Define and configure your auth resource
 * @see https://docs.amplify.aws/gen2/build-a-backend/auth
 */
export const auth = defineAuth({
  name: 'vieewauthservice',
  loginWith: {
    email: true,
    externalProviders: {
      google: {
        clientId: secret('GOOGLE_CLIENT_ID'),
        clientSecret: secret('GOOGLE_CLIENT_SECRET'),
        scopes: ['openid', 'email', 'profile'],
        attributeMapping: {
          email: 'email',
          emailVerified: 'email_verified',
        }
      },
      facebook: {
        clientId: secret('FACEBOOK_CLIENT_ID'),
        clientSecret: secret('FACEBOOK_CLIENT_SECRET'),
        scopes: ['email','public_profile'],
        attributeMapping: {
          email: 'email'
        }
      },
      callbackUrls: [
        'http://localhost:4200/redirect/auth',
        'https://vieew.io/redirect/auth',
        'https://www.vieew.io/redirect/auth',
        'https://app.vieew.io/redirect/auth',
        'https://mine.vieew.io/redirect/auth',
        'https://stage.app.vieew.io/redirect/auth',
        'https://stage.mine.vieew.io/redirect/auth',
        'v3://auth-callback' // mobile rdirect ?
      ],
      logoutUrls: [
        'http://localhost:4200',
        'https://vieew.io',
        'https://www.vieew.io',
        'https://app.vieew.io',
        'https://mine.vieew.io',
        'https://stage.app.vieew.io',
        'https://stage.mine.vieew.io',
        'v3://auth-callback' // mobile redirect 
      ],
    }
  },
  userAttributes: {
    preferredUsername: {
      mutable: true,
      required: false
    },
    'custom:referred_by':{
      dataType: 'String',
      maxLen: 16
    }
  },
  triggers: {
    postConfirmation,
    preSignUp,
    customMessage,
    postAuthentication
  }
});

