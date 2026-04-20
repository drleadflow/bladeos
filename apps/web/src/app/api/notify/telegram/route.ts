import { NextRequest } from 'next/server'
import { logger } from '@blade/shared'
import { requireAuth, unauthorizedResponse } from '@/lib/auth'

export const runtime = 'nodejs'

export async function POST(req: NextRequest): Promise<Response> {
  const auth = requireAuth(req)
  if (!auth.authorized) return unauthorizedResponse(auth.error ?? 'Unauthorized')

  try {
    const body = await req.json()
    const { message } = body as { message?: string }

    if (!message) {
      return Response.json({ success: false, error: 'message is required' }, { status: 400 })
    }

    const botToken = process.env.TELEGRAM_BOT_TOKEN
    const chatId = process.env.TELEGRAM_ALLOWED_CHAT_IDS?.split(',')[0]?.trim()

    if (!botToken || !chatId) {
      return Response.json(
        { success: false, error: 'Telegram bot not configured' },
        { status: 500 }
      )
    }

    const telegramRes = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: message.slice(0, 4096),
      }),
    })

    if (!telegramRes.ok) {
      const errorText = await telegramRes.text()
      logger.error('notify', `Telegram send failed: ${errorText.slice(0, 200)}`)
      return Response.json({ success: false, error: 'Telegram API error' }, { status: 502 })
    }

    return Response.json({ success: true })
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Failed to send notification'
    logger.error('notify', `telegram error: ${msg}`)
    return Response.json({ success: false, error: msg }, { status: 500 })
  }
}
