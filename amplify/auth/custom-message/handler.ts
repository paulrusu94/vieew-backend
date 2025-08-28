// Dark + neon VIEEW style custom email for Cognito CustomMessage trigger
export const handler = async (event: any) => {
    const BRAND = process.env.BRAND || 'VIEEW';
    const LOGO = process.env.LOGO_URL || 'https://cdn.yourdomain.com/assets/vieew-logo.png';
    const HOMEPAGE = process.env.PRIMARY_URL || 'https://vieew.com';

    // Cognito placeholders (Cognito swaps these with the real values)
    const codeToken: string | undefined = event?.request?.codeParameter; // "{####}" when using "Code"
    const linkToken: string | undefined = event?.request?.linkParameter; // verify/reset link when using "Link"

    const givenName = event?.request?.userAttributes?.given_name;
    const hello = givenName ? `Hi ${givenName},` : 'Hi,';

    // Brand palette (from your LP)
    const bg = '#0b0f1a';   // page background
    const card = '#0f1424';   // inner panel
    const text = '#ffffff';   // main text
    const dim = '#9aa3b2';   // secondary text
    const accent = '#7a5cff';   // purple
    const cyan = '#00d1ff';   // cyan detail

    // Email-safe button using <table>
    const button = (href: string, label: string) => `
  <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:14px 0 6px 0">
    <tr>
      <td bgcolor="${accent}" style="border-radius:10px">
        <a href="${href}"
           style="display:inline-block;padding:12px 20px;color:#fff;text-decoration:none;
                  font-weight:700;letter-spacing:.2px;border-radius:10px;
                  background:linear-gradient(135deg, ${accent}, ${cyan});">
          ${label}
        </a>
      </td>
    </tr>
  </table>`;

    const codeBlock = (code: string) => `
    <p style="margin:8px 0 12px 0;color:${dim}">Use this code to continue:</p>
    <div style="font-size:28px;font-weight:800;letter-spacing:3px;
                color:${text};background:#131a30;border:1px solid #243056;
                border-radius:12px;padding:14px 16px;display:inline-block">${code}</div>`;

    // Card wrapper in tables (best deliverability)
    const frame = (content: string) => `
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0"
         style="background:${bg};padding:32px 0">
    <tr>
      <td align="center">
        <table role="presentation" width="560" cellspacing="0" cellpadding="0" border="0"
               style="background:${card};border-radius:16px;
                      box-shadow:0 8px 28px rgba(7,10,20,0.6);">
          <tr>
            <td style="padding:28px 24px 20px 24px" align="center">
              <a href="${HOMEPAGE}" style="text-decoration:none">
                <img src="${LOGO}" alt="${BRAND} logo" width="140" height="auto"
                     style="display:block;border:0;max-width:140px;margin:0 auto 8px auto">
              </a>
              <div style="height:2px;width:64px;background:linear-gradient(90deg, ${accent}, ${cyan});
                          border-radius:2px;margin:12px auto 0 auto"></div>
            </td>
          </tr>
          <tr>
            <td style="padding:0 24px 22px 24px;color:${text};
                       font:16px/1.55 -apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Inter,Arial,sans-serif">
              ${content}
            </td>
          </tr>
        </table>
        <table role="presentation" width="560" cellspacing="0" cellpadding="0" border="0" style="margin-top:12px">
          <tr>
            <td align="center"
                style="color:${dim};font:12px/1.5 -apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Inter,Arial,sans-serif">
              © ${new Date().getFullYear()} ${BRAND}. All rights reserved •
              <a href="${HOMEPAGE}" style="color:${cyan};text-decoration:none">${HOMEPAGE.replace(/^https?:\/\//, '')}</a>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>`.trim();

    // Compose message depending on pool style (Code vs Link)
    const compose = (title: string, ctaLabel: string) => {
        return frame(`
            <h1 style="margin:0 0 10px 0;font-size:22px;color:${text}">${title}</h1>
            <p style="margin:0 0 8px 0;color:${dim}">${hello}</p>
            ${codeBlock(codeToken ?? '')}
            <p style="margin:14px 0 0 0;color:${dim}">If you didn’t request this, you can safely ignore this email.</p>
        `);
    };

    switch (event.triggerSource) {
        case 'CustomMessage_SignUp':
        case 'CustomMessage_ResendCode':
            event.response.emailSubject = `Confirm your email | ${BRAND}`;
            event.response.emailMessage = compose('Verify your email', 'Confirm email');
            break;

        case 'CustomMessage_ForgotPassword':
            event.response.emailSubject = `Reset your password | ${BRAND}`;
            event.response.emailMessage = compose('Reset your password', 'Reset password');
            break;

        case 'CustomMessage_UpdateUserAttribute':
        case 'CustomMessage_VerifyUserAttribute':
            event.response.emailSubject = `Confirm your change | ${BRAND}`;
            event.response.emailMessage = compose('Confirm your change', 'Confirm change');
            break;

        default:
            // other events untouched
            break;
    }
    console.log(JSON.stringify(event, null, 2))
    return event;
};
