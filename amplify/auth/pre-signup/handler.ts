import type { PreSignUpTriggerHandler } from 'aws-lambda';
import {
  CognitoIdentityProviderClient,
  ListUsersCommand,
  AdminLinkProviderForUserCommand,
} from '@aws-sdk/client-cognito-identity-provider';

const client = new CognitoIdentityProviderClient({});

export const handler: PreSignUpTriggerHandler = async (event) => {
  // Only for external providers
  if (event.triggerSource !== 'PreSignUp_ExternalProvider') {
    return event;
  }

  const email = event.request.userAttributes?.email;
  if (!email) {
    // No email from IdP -> nothing to link; still auto-confirm if desired
    event.response.autoConfirmUser = true;
    event.response.autoVerifyEmail = false; // can't verify without email
    return event;
  }

  // 1) Find an existing *native* user with this email (exclude EXTERNAL_PROVIDER)
  const list = await client.send(
    new ListUsersCommand({
      UserPoolId: event.userPoolId,
      Filter: `email = "${email}"`,
      Limit: 10,
    })
  );

  const existing = (list.Users ?? []).find(
    (u) => u.UserStatus !== 'EXTERNAL_PROVIDER'
  );

  // 2) If exists, link the incoming provider to that native user
  if (existing?.Username) {
    // event.userName format example: "Facebook_1234567890"
    const parts = event.userName.split('_');
    if (parts.length < 2) {
      console.warn('Unexpected event.userName format:', event.userName);
      return event;
    }

    const raw = parts[0]; // e.g., "Facebook", "Google", "SignInWithApple"
    const providerUserId = parts.slice(1).join('_'); // in case the sub has underscores

    let ProviderName: 'Facebook' | 'Google' | 'SignInWithApple';
    switch (raw.toLowerCase()) {
      case 'google':
        ProviderName = 'Google';
        break;
      case 'facebook':
        ProviderName = 'Facebook';
        break;
      case 'apple':
      case 'signinwithapple':
        ProviderName = 'SignInWithApple';
        break;
      default:
        throw new Error(`Unsupported provider: ${raw}`);
    }

    // Link external identity -> existing native user
    try {
      await client.send(
        new AdminLinkProviderForUserCommand({
          UserPoolId: event.userPoolId,
          DestinationUser: {
            ProviderName: 'Cognito',
            ProviderAttributeValue: existing.Username!,
          },
          SourceUser: {
            ProviderName,
            ProviderAttributeName: 'Cognito_Subject',
            ProviderAttributeValue: providerUserId,
          },
        })
      );
    } catch (err: any) {
      // Common benign cases on retries / concurrent attempts:
      // - AliasExistsException / NotAuthorizedException if already linked
      // Log and proceed.
      console.warn('AdminLinkProviderForUser failed (continuing):', err?.name || err);
    }
  }

  // 3) Smooth sign-in experience for social users
  event.response.autoConfirmUser = true;
  event.response.autoVerifyEmail = true;

  return event;
};
