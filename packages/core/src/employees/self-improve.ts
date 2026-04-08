import { getDb } from '@blade/db'

function db() {
  return getDb()
}

function now(): string {
  return new Date().toISOString()
}

const TOOL_KEYWORDS: Record<string, string> = {
  'ghl': 'GoHighLevel',
  'gohighlevel': 'GoHighLevel',
  'go high level': 'GoHighLevel',
  'stripe': 'Stripe',
  'calendly': 'Calendly',
  'hubspot': 'HubSpot',
  'salesforce': 'Salesforce',
  'mailchimp': 'Mailchimp',
  'zapier': 'Zapier',
  'slack': 'Slack',
  'notion': 'Notion',
  'airtable': 'Airtable',
  'shopify': 'Shopify',
  'quickbooks': 'QuickBooks',
  'xero': 'Xero',
  'twilio': 'Twilio',
  'sendgrid': 'SendGrid',
  'intercom': 'Intercom',
  'typeform': 'Typeform',
  'google sheets': 'Google Sheets',
  'google calendar': 'Google Calendar',
  'whatsapp': 'WhatsApp',
  'facebook': 'Facebook',
  'instagram': 'Instagram',
  'linkedin': 'LinkedIn',
  'tiktok': 'TikTok',
}

export function addToImprovementQueue(type: string, description: string): void {
  const id = crypto.randomUUID()
  db().prepare(
    `INSERT INTO improvement_queue (id, type, description, status, created_at)
     VALUES (?, ?, ?, 'pending', ?)`
  ).run(id, type, description, now())
}

export async function processImprovementQueue(): Promise<void> {
  const pending = db().prepare(
    `SELECT id, type, description FROM improvement_queue
     WHERE status = 'pending'
     ORDER BY created_at ASC
     LIMIT 10`
  ).all() as Array<{ id: string; type: string; description: string }>

  for (const item of pending) {
    try {
      // Mark as processing
      db().prepare(
        `UPDATE improvement_queue SET status = 'processing', updated_at = ? WHERE id = ?`
      ).run(now(), item.id)

      // For now, log the improvement suggestion. In a full implementation,
      // this would trigger an agent loop to actually implement the improvement.
      db().prepare(
        `UPDATE improvement_queue SET status = 'completed', updated_at = ? WHERE id = ?`
      ).run(now(), item.id)
    } catch {
      db().prepare(
        `UPDATE improvement_queue SET status = 'failed', updated_at = ? WHERE id = ?`
      ).run(now(), item.id)
    }
  }
}

export function detectToolMention(message: string): string | null {
  const lower = message.toLowerCase()

  for (const [keyword, toolName] of Object.entries(TOOL_KEYWORDS)) {
    if (lower.includes(keyword)) {
      return toolName
    }
  }

  return null
}
