// -----------------------------------------------------------------------------
// CustomMessage handler for Cognito
// - Sends branded, dark-mode-friendly VIEEW emails
// - Designed to behave well in Gmail iOS (color inversion issues)
// - Keeps markup compact to reduce truncation risk
// -----------------------------------------------------------------------------

export const handler = async (event: any) => {
  // ---------------------------------------------------------------------------
  // Branding & configuration
  // ---------------------------------------------------------------------------
  const BRAND    = process.env.BRAND ?? "VIEEW";
  const LOGO     = process.env.LOGO_URL ?? "https://images.prismic.io/vieew/aPJHp55xUNkB2GKn_logo-vieew-1-sec.png";
  const HOMEPAGE = process.env.PRIMARY_URL ?? "https://vieew.io";

  const codeToken: string | undefined = event?.request?.codeParameter;
  const givenName = event?.request?.userAttributes?.given_name;
  const greetingLine = givenName ? `Hi ${givenName},` : "Hi,";

  // ---------------------------------------------------------------------------
  // Color palette
  //
  // Notes:
  // - Use deep navy instead of pure black to reduce aggressive inversion in Gmail iOS.
  // - Text colors are explicitly set and reinforced with !important where relevant.
  // ---------------------------------------------------------------------------
  const bg   = "#0b0f1a"; // outer page background
  const card = "#0f1424"; // inner card background
  const text = "#ffffff";
  const dim  = "#9aa3b2";

  // ---------------------------------------------------------------------------
  // Embedded assets (tiny base64 images)
  //
  // Rationale:
  // - Many email clients ignore CSS gradients/backgrounds.
  // - Gmail iOS is more reliable with <table background=""> using small tiled PNGs.
  // ---------------------------------------------------------------------------

  // 4x4 px solid background for page
  const BG_PAGE_BASE64 =
    "iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAIAAAAmkwkpAAAAFElEQVR4nGP4z8DwPwMDAwMjAAAAVWgF8FYJpc0AAAAASUVORK5CYII=";

  // 4x4 px solid background for card
  const BG_CARD_BASE64 =
    "iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAIAAAAmkwkpAAAAFElEQVR4nGP47+XlPwMDAwMjAAAAVWgFzWVoxUAAAAAASUVORK5CYII=";

  // 64x2 px gradient strip used as divider
  const DIVIDER_BASE64 =
    "iVBORw0KGgoAAAANSUhEUgAAAEEAAAACCAYAAABl4m2LAAAAG0lEQVQYV2NgYGBg+M/AB8yMjIwxQDGQhQAA9GUfQw3kJ7kAAAAAElFTkSuQmCC";

  // ---------------------------------------------------------------------------
  // Content helpers
  // ---------------------------------------------------------------------------

  /**
   * Renders the verification code block.
   * Includes a safe fallback when codeToken is missing (should be rare in Cognito flows).
   */
  const renderCodeBlock = (code: string | undefined): string => {
    if (!code) {
      return `
        <p style="margin:8px 0 0 0;color:${dim};">
          Something went wrong and the verification code could not be generated. Please request a new code.
        </p>
      `;
    }

    return `
      <p style="margin:8px 0 12px 0;color:${dim};">
        Use this code to continue:
      </p>
      <div
        style="
          font-size:28px;
          font-weight:800;
          letter-spacing:3px;
          color:${text};
          background:#131a30;
          border:1px solid #243056;
          border-radius:12px;
          padding:14px 16px;
          display:inline-block;
        "
      >
        ${code}
      </div>
    `;
  };

  /**
   * Frames the inner HTML content into a full HTML document.
   *
   * Design goals:
   * - Explicit <html>, <body>, and meta tags for more predictable behavior across clients.
   * - Preheader for better preview and slight anti-truncation hint.
   * - Redundant background definitions (bgcolor + background + inline style) for maximum compatibility.
   */
  const frame = (content: string): string => `
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="color-scheme" content="dark light">
    <meta name="supported-color-schemes" content="dark light">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${BRAND}</title>
  </head>
  <body
    style="
      margin:0;
      padding:0;
      background-color:${bg};
      color:${text};
      -webkit-text-size-adjust:100%;
    "
  >
    <!-- Preheader (hidden from layout, visible in inbox preview) -->
    <div style="
      display:none;
      overflow:hidden;
      line-height:1px;
      max-height:0;
      max-width:0;
      opacity:0;
      color:transparent;
      mso-hide:all;
    ">
      Your verification code for ${BRAND}.
    </div>

    <!-- OUTER WRAPPER -->
    <table
      role="presentation"
      width="100%"
      cellspacing="0"
      cellpadding="0"
      border="0"
      bgcolor="${bg}"
      background="data:image/png;base64,${BG_PAGE_BASE64}"
      style="
        background-color:${bg} !important;
        background-image:url('data:image/png;base64,${BG_PAGE_BASE64}') !important;
        background-repeat:repeat !important;
        padding:32px 0;
        margin:0;
        border-collapse:collapse;
      "
    >
      <tr>
        <td
          align="center"
          bgcolor="${bg}"
          background="data:image/png;base64,${BG_PAGE_BASE64}"
          style="
            background-color:${bg} !important;
            background-image:url('data:image/png;base64,${BG_PAGE_BASE64}') !important;
            background-repeat:repeat !important;
            padding:0 12px;
          "
        >

          <!-- CARD -->
          <table
            role="presentation"
            width="560"
            cellspacing="0"
            cellpadding="0"
            border="0"
            bgcolor="${card}"
            background="data:image/png;base64,${BG_CARD_BASE64}"
            style="
              background-color:${card} !important;
              background-image:url('data:image/png;base64,${BG_CARD_BASE64}') !important;
              background-repeat:repeat !important;
              border-radius:16px;
              box-shadow:0 8px 28px rgba(7,10,20,0.6);
              border-collapse:separate;
              overflow:hidden;
            "
          >
            <!-- HEADER / LOGO -->
            <tr>
              <td
                bgcolor="${card}"
                background="data:image/png;base64,${BG_CARD_BASE64}"
                style="
                  background-color:${card} !important;
                  background-image:url('data:image/png;base64,${BG_CARD_BASE64}') !important;
                  background-repeat:repeat !important;
                  padding:28px 24px 20px 24px;
                  text-align:center;
                "
              >
                <a href="${HOMEPAGE}" style="text-decoration:none;">
                  <img
                    src="${LOGO}"
                    alt="${BRAND} logo"
                    width="140"
                    style="display:block;border:0;max-width:140px;margin:0 auto 12px auto;"
                  />
                </a>
                <img
                  width="64"
                  height="2"
                  alt=""
                  src="data:image/png;base64,${DIVIDER_BASE64}"
                  style="display:block;width:64px;height:2px;border:0;margin:0 auto 0 auto;"
                />
              </td>
            </tr>

            <!-- BODY -->
            <tr>
              <td
                bgcolor="${card}"
                background="data:image/png;base64,${BG_CARD_BASE64}"
                style="
                  background-color:${card} !important;
                  background-image:url('data:image/png;base64,${BG_CARD_BASE64}') !important;
                  background-repeat:repeat !important;
                  padding:0 24px 22px 24px;
                  color:${text} !important;
                  font:16px/1.55 -apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Inter,Arial,sans-serif;
                "
              >
                ${content}

                <p style="margin-top:16px;color:${dim} !important;">
                  If you did not request this, you can safely ignore this email.
                </p>
                <p style="color:${dim} !important;">
                  — ${BRAND}
                </p>
              </td>
            </tr>
          </table>

          <!-- FOOTER -->
          <table
            role="presentation"
            width="560"
            cellspacing="0"
            cellpadding="0"
            border="0"
            style="margin-top:12px;"
          >
            <tr>
              <td
                align="center"
                style="
                  color:${dim} !important;
                  font:12px/1.5 -apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Inter,Arial,sans-serif;
                  padding:0 12px;
                "
              >
                © ${new Date().getFullYear()} ${BRAND}. All rights reserved •
                <a href="${HOMEPAGE}" style="color:#00d1ff;text-decoration:none;">
                  ${HOMEPAGE}
                </a>
              </td>
            </tr>
          </table>

        </td>
      </tr>
    </table>
  </body>
</html>
  `.trim();

  /**
   * Composes the full email body for a given title (per trigger type).
   */
  const compose = (title: string): string =>
    frame(`
      <h1
        style="
          margin:0 0 10px 0;
          font-size:22px;
          color:${text} !important;
          font-weight:600;
          font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Inter,Arial,sans-serif;
        "
      >
        ${title}
      </h1>
      <p style="margin:0 0 8px 0;color:${dim} !important;">
        ${greetingLine}
      </p>
      ${renderCodeBlock(codeToken)}
    `);

  // ---------------------------------------------------------------------------
  // Cognito trigger routing
  //
  // We map known trigger sources to subject + body variants.
  // Any unknown triggerSource will leave the event untouched.
  // ---------------------------------------------------------------------------
  switch (event.triggerSource) {
    case "CustomMessage_SignUp":
    case "CustomMessage_ResendCode":
      event.response.emailSubject = `Confirm your email | ${BRAND}`;
      event.response.emailMessage = compose("Verify your email");
      break;

    case "CustomMessage_ForgotPassword":
      event.response.emailSubject = `Reset your password | ${BRAND}`;
      event.response.emailMessage = compose("Reset your password");
      break;

    case "CustomMessage_UpdateUserAttribute":
    case "CustomMessage_VerifyUserAttribute":
      event.response.emailSubject = `Confirm your change | ${BRAND}`;
      event.response.emailMessage = compose("Confirm your change");
      break;

    default:
      // No override for unsupported trigger sources
      break;
  }

  return event;
};
