// Gmail-iOS proof, dark VIEEW style
export const handler = async (event: any) => {
  const BRAND    = process.env.BRAND || 'VIEEW';
  const LOGO     = process.env.LOGO_URL || 'https://cdn.yourdomain.com/assets/vieew-logo.png';
  const HOMEPAGE = process.env.PRIMARY_URL || 'https://vieew.com';

  const codeToken: string | undefined = event?.request?.codeParameter;
  const givenName = event?.request?.userAttributes?.given_name;
  const hello = givenName ? `Hi ${givenName},` : 'Hi,';

  // palette
  const bg   = '#0b0f1a';  // page
  const card = '#0f1424';  // inner panel
  const text = '#ffffff';
  const dim  = '#9aa3b2';

  // 4x4 tiles (base64)
  const BG_PAGE_BASE64 =
    'iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAIAAAAmkwkpAAAAFElEQVR4nGP4z8DwPwMDAwMjAAAAVWgF8FYJpc0AAAAASUVORK5CYII='; // #0b0f1a
  const BG_CARD_BASE64 =
    'iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAIAAAAmkwkpAAAAFElEQVR4nGP47+XlPwMDAwMjAAAAVWgFzWVoxUAAAAAASUVORK5CYII='; // #0f1424

  // 64x2 gradient purple->cyan as image (safer than CSS gradient in Gmail iOS)
  const DIVIDER_BASE64 =
    'iVBORw0KGgoAAAANSUhEUgAAAEEAAAACCAYAAABl4m2LAAAAG0lEQVQYV2NgYGBg+M/AB8yMjIwxQDGQhQAA9GUfQw3kJ7kAAAAAElFTkSuQmCC';
  // (the above is just a tiny linear blend; replace with your exact gradient if you want)

  const codeBlock = (code: string) => `
    <p style="margin:8px 0 12px 0;color:${dim}">Use this code to continue:</p>
    <div style="font-size:28px;font-weight:800;letter-spacing:3px;
                color:${text};background:#131a30;border:1px solid #243056;
                border-radius:12px;padding:14px 16px;display:inline-block">${code}</div>`;

  const frame = (content: string) => `
    <meta name="color-scheme" content="dark light">
    <meta name="supported-color-schemes" content="dark light">

    <!-- OUTER WRAPPER -->
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0"
           bgcolor="${bg}"
           background="data:image/png;base64,${BG_PAGE_BASE64}"
           style="background-color:${bg} !important;
                  background-image:url('data:image/png;base64,${BG_PAGE_BASE64}') !important;
                  background-repeat:repeat !important;
                  padding:32px 0; margin:0; border-collapse:collapse;">
      <tr>
        <td align="center"
            bgcolor="${bg}"
            background="data:image/png;base64,${BG_PAGE_BASE64}"
            style="background-color:${bg} !important;
                   background-image:url('data:image/png;base64,${BG_PAGE_BASE64}') !important;
                   background-repeat:repeat !important;">

          <!-- CARD TABLE (full bulletproofing) -->
          <table role="presentation" width="560" cellspacing="0" cellpadding="0" border="0"
                 bgcolor="${card}"
                 background="data:image/png;base64,${BG_CARD_BASE64}"
                 style="background-color:${card} !important;
                        background-image:url('data:image/png;base64,${BG_CARD_BASE64}') !important;
                        background-repeat:repeat !important;
                        border-radius:16px;
                        box-shadow:0 8px 28px rgba(7,10,20,0.6);
                        border-collapse:separate;">
            <tr>
              <td bgcolor="${card}"
                  background="data:image/png;base64,${BG_CARD_BASE64}"
                  style="background-color:${card} !important;
                         background-image:url('data:image/png;base64,${BG_CARD_BASE64}') !important;
                         background-repeat:repeat !important;
                         padding:28px 24px 20px 24px" align="center">
                <a href="${HOMEPAGE}" style="text-decoration:none">
                  <img src="${LOGO}" alt="${BRAND} logo" width="140" height="auto"
                       style="display:block;border:0;max-width:140px;margin:0 auto 12px auto">
                </a>
                <!-- gradient divider as image -->
                <img width="64" height="2" alt=""
                     src="data:image/png;base64,${DIVIDER_BASE64}"
                     style="display:block;width:64px;height:2px;border:0;margin:0 auto 0 auto">
              </td>
            </tr>
            <tr>
              <td bgcolor="${card}"
                  background="data:image/png;base64,${BG_CARD_BASE64}"
                  style="background-color:${card} !important;
                         background-image:url('data:image/png;base64,${BG_CARD_BASE64}') !important;
                         background-repeat:repeat !important;
                         padding:0 24px 22px 24px;
                         color:${text} !important;
                         font:16px/1.55 -apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Inter,Arial,sans-serif">
                ${content}
                <p style="margin-top:16px;color:${dim} !important">
                  If you didn’t request this, you can safely ignore this email.
                </p>
                <p style="color:${dim} !important">— ${BRAND}</p>
              </td>
            </tr>
          </table>

          <!-- FOOTER -->
          <table role="presentation" width="560" cellspacing="0" cellpadding="0" border="0" style="margin-top:12px">
            <tr>
              <td align="center"
                  style="color:${dim} !important;
                         font:12px/1.5 -apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Inter,Arial,sans-serif">
                © ${new Date().getFullYear()} ${BRAND}. All rights reserved •
                <a href="${HOMEPAGE}" style="color:#00d1ff;text-decoration:none">
                  ${HOMEPAGE.replace(/^https?:\/\//, '')}
                </a>
              </td>
            </tr>
          </table>

        </td>
      </tr>
    </table>
  `.trim();

  const compose = (title: string) =>
    frame(`
      <h1 style="margin:0 0 10px 0;font-size:22px;color:${text}">${title}</h1>
      <p style="margin:0 0 8px 0;color:${dim}">${hello}</p>
      ${codeBlock(codeToken ?? '')}
    `);

  switch (event.triggerSource) {
    case 'CustomMessage_SignUp':
    case 'CustomMessage_ResendCode':
      event.response.emailSubject = `Confirm your email | ${BRAND}`;
      event.response.emailMessage = compose('Verify your email');
      break;
    case 'CustomMessage_ForgotPassword':
      event.response.emailSubject = `Reset your password | ${BRAND}`;
      event.response.emailMessage = compose('Reset your password');
      break;
    case 'CustomMessage_UpdateUserAttribute':
    case 'CustomMessage_VerifyUserAttribute':
      event.response.emailSubject = `Confirm your change | ${BRAND}`;
      event.response.emailMessage = compose('Confirm your change');
      break;
    default:
      break;
  }

  return event;
};
