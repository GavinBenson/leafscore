import type { DigestItem } from '@/lib/data/digest'
import { siteUrl } from '@/lib/siteUrl'
import { signToken } from '@/lib/unsubscribeToken'

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export function unsubscribeUrls(userId: number, base: string = siteUrl()) {
  const token = encodeURIComponent(signToken(userId))
  return {
    page: `${base}/unsubscribe?token=${token}`,
    oneClick: `${base}/unsubscribe/one-click?token=${token}`,
  }
}

export function digestEmail(items: DigestItem[], unsubscribePageUrl: string, base: string = siteUrl()) {
  const rows = items
    .map((item) => {
      const href = escapeHtml(`${base}/browse/${item.teaId}`)
      const meta = [item.brand, item.type].filter(Boolean).join(' · ')
      return `<tr>
              <td style="padding:12px 0;border-bottom:1px solid #e8e0d4;font-size:15px;line-height:1.5;">
                <a href="${href}" style="color:#2d5a27;font-weight:600;text-decoration:none;">${escapeHtml(item.name)}</a><br>
                <span style="color:#8a8a7a;font-size:13px;">${escapeHtml(meta)} · LeafScore ${Math.round(item.leafScore)} · ${item.newReviews} new review${item.newReviews === 1 ? '' : 's'} this week</span>
              </td>
            </tr>`
    })
    .join('\n            ')
  const unsub = escapeHtml(unsubscribePageUrl)

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
              <td style="font-size:16px;line-height:1.6;padding-bottom:8px;">
                New top teas this week: highly rated teas that picked up fresh reviews.
              </td>
            </tr>
            ${rows}
            <tr>
              <td style="font-size:13px;line-height:1.5;color:#8a8a7a;padding-top:24px;">
                You get this weekly email because you turned it on in Settings.
                <a href="${unsub}" style="color:#8a8a7a;">Unsubscribe</a>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`

  const lines = items.map((item) => {
    const meta = [item.brand, item.type].filter(Boolean).join(', ')
    return `- ${item.name} (${meta}) LeafScore ${Math.round(item.leafScore)}, ${item.newReviews} new review${item.newReviews === 1 ? '' : 's'}\n  ${base}/browse/${item.teaId}`
  })
  const text = `New top teas this week on LeafScore\n\n${lines.join('\n')}\n\nYou get this weekly email because you turned it on in Settings. Unsubscribe: ${unsubscribePageUrl}\n`

  return { subject: 'New top teas on LeafScore this week', html, text }
}

// Sends one digest through Resend (same REST call as the magic-link email).
export async function sendDigestEmail(to: { id: number; email: string }, items: DigestItem[]) {
  const apiKey = process.env.AUTH_RESEND_KEY
  if (!apiKey) throw new Error('AUTH_RESEND_KEY is not set')
  const from = process.env.AUTH_RESEND_FROM ?? 'LeafScore <noreply@tea-ratings.com>'
  const urls = unsubscribeUrls(to.id)
  const { subject, html, text } = digestEmail(items, urls.page)
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from,
      to: to.email,
      subject,
      html,
      text,
      headers: {
        'List-Unsubscribe': `<${urls.oneClick}>`,
        'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
      },
    }),
    signal: AbortSignal.timeout(10_000),
  })
  if (!res.ok) throw new Error(`Resend error ${res.status}: ${await res.text()}`)
}
