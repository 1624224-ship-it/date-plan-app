import { google } from 'googleapis'
import { Router } from 'express'
import crypto from 'crypto'

const tokenStore = new Map()

export function createCalendarRouter() {
  const router = Router()

  const getOAuth2Client = () =>
    new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.GOOGLE_REDIRECT_URI || 'http://localhost:3001/api/auth/google/callback'
    )

  router.get('/auth/google', (_req, res) => {
    const oauth2Client = getOAuth2Client()
    const url = oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: ['https://www.googleapis.com/auth/calendar.events'],
    })
    res.redirect(url)
  })

  router.get('/auth/google/callback', async (req, res) => {
    const { code } = req.query
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173'

    try {
      const oauth2Client = getOAuth2Client()
      const { tokens } = await oauth2Client.getToken(code)
      const sessionId = crypto.randomUUID()
      tokenStore.set(sessionId, tokens)
      res.redirect(`${frontendUrl}?auth=success&session=${sessionId}`)
    } catch (err) {
      console.error('OAuth error:', err.message)
      res.redirect(`${frontendUrl}?auth=error`)
    }
  })

  router.post('/calendar/events', async (req, res) => {
    const { sessionId, plan, date } = req.body

    const tokens = tokenStore.get(sessionId)
    if (!tokens) {
      return res.status(401).json({ error: '認証が必要です。再度Googleでログインしてください。' })
    }

    const oauth2Client = getOAuth2Client()
    oauth2Client.setCredentials(tokens)
    const calendar = google.calendar({ version: 'v3', auth: oauth2Client })

    try {
      const createdEvents = []

      for (const spot of plan.spots) {
        const [hours, minutes] = spot.time.split(':').map(Number)
        const startISO = `${date}T${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:00+09:00`
        const startMs = new Date(startISO).getTime()
        const endISO = new Date(startMs + spot.duration_min * 60_000).toISOString()

        const { data } = await calendar.events.insert({
          calendarId: 'primary',
          resource: {
            summary: `💑 ${spot.name}`,
            description: `${spot.memo}\n\n予算: ¥${(spot.budget ?? 0).toLocaleString()}\n移動手段: ${spot.transport}`,
            start: { dateTime: startISO, timeZone: 'Asia/Tokyo' },
            end: { dateTime: endISO, timeZone: 'Asia/Tokyo' },
            colorId: '6', // Tangerine (orange)
          },
        })
        createdEvents.push(data)
      }

      res.json({ success: true, events: createdEvents })
    } catch (err) {
      console.error('Calendar API error:', err.message)
      res.status(500).json({ error: 'カレンダーへの登録に失敗しました。' })
    }
  })

  return router
}
