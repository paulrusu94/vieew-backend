import { defineAuth, secret } from "@aws-amplify/backend";
import { postConfirmation } from "./post-confirmation/resource";
import { preSignUp } from "./pre-signup/resource";
import { customMessage } from "./custom-message/resource";
import { postAuthentication } from "./post-authentication/resource";

/**
 * Auth configuration for VIEEW
 * - Email + social providers (Google, Facebook)
 * - Attribute mapping ensures social profile names are persisted in Cognito user attributes
 */
export const auth = defineAuth({
  name: "vieewauthservice",
  loginWith: {
    email: true,
    externalProviders: {
      // -------------------------------------------------------------
      // Google IdP
      // -------------------------------------------------------------
      google: {
        clientId: secret("GOOGLE_CLIENT_ID"),
        clientSecret: secret("GOOGLE_CLIENT_SECRET"),
        scopes: ["openid", "email", "profile"],
        /**
         * Attribute mapping:
         * - Maps Google OIDC claims to Cognito user attributes.
         * - "profile" scope is required for name-related claims.
         */
        attributeMapping: {
          // Standard
          email: "email",
          emailVerified: "email_verified",

          // Names
          givenName: "given_name",       // Cognito given_name  <- Google given_name
          familyName: "family_name",     // Cognito family_name <- Google family_name
          preferredUsername: "name",     // Cognito preferred_username <- Google name

          // Optional: if you actually care about website / profile
          // profile: "profile",         // profile URL, if provided
          // picture: "picture",         // avatar URL, if provided
          // website: "website"          // only if you know Google returns it for your app
        },
      },

      // -------------------------------------------------------------
      // Facebook IdP
      // -------------------------------------------------------------
      facebook: {
        clientId: secret("FACEBOOK_CLIENT_ID"),
        clientSecret: secret("FACEBOOK_CLIENT_SECRET"),
        scopes: ["email", "public_profile"],
        /**
         * Attribute mapping:
         * - Facebook returns: name, first_name, last_name when "public_profile" is enabled.
         */
        attributeMapping: {
          email: "email",

          // Names (Facebook graph fields)
          givenName: "first_name",       // Cognito given_name  <- Facebook first_name
          familyName: "last_name",       // Cognito family_name <- Facebook last_name
          preferredUsername: "name",     // Cognito preferred_username <- Facebook name
        },
      },

      // -------------------------------------------------------------
      // Hosted UI callback / logout URLs
      // -------------------------------------------------------------
      callbackUrls: [
        "http://localhost:4200/redirect/auth",
        "https://vieew.io/redirect/auth",
        "https://www.vieew.io/redirect/auth",
        "https://app.vieew.io/redirect/auth",
        "https://mine.vieew.io/redirect/auth",
        "https://stage.app.vieew.io/redirect/auth",
        "https://stage.mine.vieew.io/redirect/auth"
      ],
      logoutUrls: [
        "http://localhost:4200",
        "https://vieew.io",
        "https://www.vieew.io",
        "https://app.vieew.io",
        "https://mine.vieew.io",
        "https://stage.app.vieew.io",
        "https://stage.mine.vieew.io"
      ],
    },
  },

  // -----------------------------------------------------------------
  // Cognito user attributes
  // - preferredUsername is where we expose provider "display name"
  // - custom:referred_by is used for your referral system
  // -----------------------------------------------------------------
  userAttributes: {
    preferredUsername: {
      mutable: true,
      required: false,
    },
    "custom:referred_by": {
      dataType: "String",
      maxLen: 16,
    },
  },
  triggers: {
    postConfirmation,
    preSignUp,
    customMessage,
    postAuthentication,
  },
});
