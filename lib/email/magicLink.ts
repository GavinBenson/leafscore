function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export function magicLinkEmail(url: string) {
  const href = escapeHtml(url)

  const html = `<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#faf6f0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#1a1a1a;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#faf6f0;padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:440px;background:#ffffff;border:1px solid #e8e0d4;border-radius:12px;padding:32px 24px;">
            <tr>
              <td style="font-family:Georgia,'Times New Roman',serif;font-size:22px;font-weight:700;color:#2d5a27;padding-bottom:16px;">LeafScore</td>
            </tr>
            <tr>
              <td style="font-size:16px;line-height:1.6;padding-bottom:24px;">
                Tap the button below to sign in. This link expires in 24 hours and can only be used once.
              </td>
            </tr>
            <tr>
              <td align="center" style="padding-bottom:24px;">
                <a href="${href}" style="display:inline-block;background:#2d5a27;color:#ffffff;text-decoration:none;font-weight:600;font-size:15px;padding:14px 28px;border-radius:8px;">Sign in to LeafScore</a>
              </td>
            </tr>
            <tr>
              <td style="font-size:13px;line-height:1.5;color:#8a8a7a;">
                If you didn't request this, you can safely ignore this email.
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`

  const text = `Sign in to LeafScore\n\n${url}\n\nThis link expires in 24 hours and can only be used once. If you didn't request this, you can safely ignore this email.\n`

  return { subject: 'Your LeafScore sign-in link', html, text }
}
