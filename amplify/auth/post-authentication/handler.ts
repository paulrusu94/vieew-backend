import {
  CognitoIdentityProviderClient,
  AdminUpdateUserAttributesCommand,
} from '@aws-sdk/client-cognito-identity-provider';
import type { PostAuthenticationTriggerHandler } from "aws-lambda";

const client = new CognitoIdentityProviderClient({});

export const handler: PostAuthenticationTriggerHandler = async (event) => {
  if (event.triggerSource !== 'PostAuthentication_Authentication') return event;

  const { userPoolId, userName } = event;
  const attrs = event.request?.userAttributes || {};
  const emailVerified = String(attrs.email_verified || '').toLowerCase() === 'true';
  const userConfirmed = attrs['cognito:user_status'] === 'CONFIRMED';

  let isFacebookLogin = false;
  try {
    if (typeof attrs.identities === 'string') {
      const identities = JSON.parse(attrs.identities); // array de obiecte
      isFacebookLogin = Array.isArray(identities) && identities.some((i: any) =>
        (i.providerName || '').toLowerCase() === 'facebook' && !emailVerified
      );
    }
  } catch {}

  // if user logs in with facebook and user is alerady confirmed, we need to persist email_verified = true (forget password bug)
  if (isFacebookLogin && userConfirmed) {
    console.log("facebook login, email verified already")
    await client.send(new AdminUpdateUserAttributesCommand({
      UserPoolId: userPoolId,
      Username: userName,
      UserAttributes: [{ Name: 'email_verified', Value: 'true' }],
    }));
  }

  return event;
};
