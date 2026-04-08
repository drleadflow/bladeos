import { getOrCreateAuthSecret } from '@/lib/auth'

export const runtime = 'nodejs'

export async function POST(req: Request): Promise<Response> {
  const { token } = (await req.json()) as { token: string }
  const secret = getOrCreateAuthSecret()

  if (token !== secret) {
    return Response.json({ success: false, error: 'Invalid token' }, { status: 401 })
  }

  const response = Response.json({ success: true })
  response.headers.set(
    'Set-Cookie',
    `blade_token=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${60 * 60 * 24 * 30}`
  )
  return response
}
