import {
  CognitoIdentityProviderClient,
  AdminUpdateUserAttributesCommand,
} from "@aws-sdk/client-cognito-identity-provider";
import type { PostAuthenticationTriggerHandler } from "aws-lambda";

// Global client – reused between Lambda invocations (container reuse)
const cognito = new CognitoIdentityProviderClient({});

// -----------------------------------------------------------------------------
// Main Handler
// -----------------------------------------------------------------------------

export const handler: PostAuthenticationTriggerHandler = async (event) => {
  const LOG_PREFIX = "post-authentication";
  // Only handle the authentication flow (not sign-up or migrations)
  if (event.triggerSource !== "PostAuthentication_Authentication") {
    console.log(`${LOG_PREFIX}: Ignoring unsupported triggerSource`, {
      triggerSource: event.triggerSource,
    });
    return event;
  }

  const { userPoolId, userName } = event;
  const attrs = event.request?.userAttributes ?? {};

  const emailVerified =
    String(attrs.email_verified ?? "")
      .toLowerCase()
      .trim() === "true";

  const userConfirmed = attrs["cognito:user_status"] === "CONFIRMED";

  let isFacebookLogin = false;

  // ---------------------------------------------------------------------------
  // Determine whether the login came from Facebook and the email is unverified.
  // Cognito stores federated identities inside `identities` as a JSON string.
  // ---------------------------------------------------------------------------
  try {
    if (typeof attrs.identities === "string") {
      const identities = JSON.parse(attrs.identities);

      if (Array.isArray(identities)) {
        isFacebookLogin = identities.some((id) => {
          const provider = (id?.providerName ?? "").toLowerCase();
          return provider === "facebook" && !emailVerified;
        });
      }
    }
  } catch (err) {
    console.error(`${LOG_PREFIX}: Failed parsing federated identities`, {
      error: err instanceof Error ? err.message : String(err),
      raw: attrs.identities,
    });
  }

  // ---------------------------------------------------------------------------
  // Facebook login case:
  // Cognito occasionally fails to mark `email_verified = true` after the first
  // federated login, even if the user later becomes "CONFIRMED".
  //
  // This breaks actions that rely on email verification (e.g., forgot password).
  //
  // We enforce email_verified=true *only* for:
  // - Facebook login
  // - Users already CONFIRMED in Cognito
  // ---------------------------------------------------------------------------
  if (isFacebookLogin && userConfirmed) {
    console.log(`${LOG_PREFIX}: Fixing missing email_verified flag`, {
      userPoolId,
      userName,
      emailVerifiedBefore: emailVerified,
    });

    try {
      await cognito.send(
        new AdminUpdateUserAttributesCommand({
          UserPoolId: userPoolId,
          Username: userName,
          UserAttributes: [
            {
              Name: "email_verified",
              Value: "true",
            },
          ],
        })
      );

      console.log(`${LOG_PREFIX}: email_verified updated successfully`, {
        userName,
      });
    } catch (err) {
      console.error(`${LOG_PREFIX}: Failed updating email_verified`, {
        userName,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  } else {
    console.log(`${LOG_PREFIX}: No email_verified update required`, {
      userName,
      isFacebookLogin,
      userConfirmed,
      emailVerified,
    });
  }

  return event;
};
