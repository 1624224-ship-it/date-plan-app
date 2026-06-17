import express from 'express'
import cors from 'cors'
import dotenv from 'dotenv'
import { createCalendarRouter } from './calendar.js'
import { createLineRouter } from './line.js'

dotenv.config()

const app = express()
const PORT = process.env.PORT || 3001
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173'

app.use(cors({ origin: '*', credentials: true }))
app.use((req, res, next) => {
  if (req.path === '/api/line/webhook') return next()
  express.json()(req, res, next)
})

app.get('/health', (_req, res) => res.json({ status: 'ok', port: PORT }))

const GEMINI_API_KEY = process.env.GEMINI_API_KEY

const PROMPT_TEMPLATE = `あなたはカップルのデートプランを提案する専門家です。
以下の条件でデートプランを提案してください：
{areaLine}
- テーマ: {theme}
- 予算: {budget}円
- 開始時刻: {startTime}
- 終了時刻: {endTime}
- 天気: {weather}
{wishesLine}
{coordsNote}
開始〜終了の時間内に収まるよう、実在しそうなスポットを3〜5件含むプランを提案してください。
また、プランの時間帯に応じて以下を提案してください：
- 開始〜終了時刻が昼食時間帯（11:00〜14:00）を含む場合：lunch_optionsに5件
- 開始〜終了時刻が夕食時間帯（17:00〜21:00）を含む場合：dinner_optionsに5件
含まない食事はnullにしてください。

以下のJSON形式のみで返してください。テキストや前置き、コードブロックは不要です。JSONだけ返してください。

{
  "title": "プランのタイトル",
  "area": "実際に使用したエリア名（例：横浜・みなとみらい）",
  "total_budget": 数値,
  "spots": [
    {
      "time": "11:00",
      "name": "場所名",
      "category": "食事|観光|体験|移動",
      "duration_min": 60,
      "transport": "徒歩|電車|バス|車",
      "parking_fee": 数値（車の場合の駐車場料金の目安。車以外は0）,
      "memo": "ひとことメモ",
      "budget": 数値
    }
  ],
  "lunch_options": [
    {
      "genre": "ジャンル名（例：本格イタリアン、こだわりラーメン、和食ランチ）",
      "price_per_person": 数値,
      "memo": "どんな雰囲気・条件の店を探すとよいかのアドバイス（例：テラス席のあるおしゃれな店、個室でゆっくりできる店）"
    }
  ],
  "dinner_options": [
    {
      "genre": "ジャンル名（例：炭火焼肉、本格フレンチ、海鮮居酒屋）",
      "price_per_person": 数値,
      "memo": "どんな雰囲気・条件の店を探すとよいかのアドバイス（例：夜景が見える席、落ち着いた個室、賑やかな雰囲気）"
    }
  ]
}`

const THEME_LABELS = { active: 'アクティブ', gourmet: 'グルメ', relax: 'まったり', drive: 'ドライブ' }
const WEATHER_LABELS = { sunny: '晴れ', rainy: '雨' }

async function callGemini(prompt) {
  const models = ['gemini-2.0-flash-lite', 'gemini-2.5-flash', 'gemini-2.0-flash']
  for (const modelName of models) {
    const apiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1/models/${modelName}:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
      }
    )
    const data = await apiRes.json()
    if (apiRes.ok && data.candidates?.[0]?.content?.parts?.[0]?.text) {
      console.log(`✅ Used model: ${modelName}`)
      return data.candidates[0].content.parts[0].text
    }
    console.warn(`⚠️ ${modelName} failed:`, data.error?.message)
  }
  throw new Error('利用可能なモデルがありませんでした。')
}

app.post('/api/generate-plan', async (req, res) => {
  const { area, wishes, theme, budget, startTime, endTime, weather, weatherDetail, lat, lon } = req.body

  if (!area && !wishes?.trim()) return res.status(400).json({ error: 'エリアかやりたいことのいずれかを入力してください。' })

  const hasCoords = lat && lon
  const weatherStr = weatherDetail
    ? `${WEATHER_LABELS[weather] ?? weather}（予報: ${weatherDetail}）`
    : (WEATHER_LABELS[weather] ?? weather)

  try {
    const areaLine = area
      ? `- エリア: ${area}${hasCoords ? `（緯度${Number(lat).toFixed(4)}, 経度${Number(lon).toFixed(4)}）` : ''}`
      : `- エリア: （指定なし。やりたいことの内容から最適なエリアをあなたが選んでください）`

    const prompt = PROMPT_TEMPLATE
      .replace('{areaLine}', areaLine)
      .replace('{coordsNote}', hasCoords ? `※ 上記の座標は現在地です。この座標から近い順にスポットを優先して提案してください。` : '')
      .replace('{theme}', THEME_LABELS[theme] ?? theme)
      .replace('{budget}', Number(budget).toLocaleString())
      .replace('{startTime}', startTime ?? '11:00')
      .replace('{endTime}', endTime ?? '21:00')
      .replace('{weather}', weatherStr)
      .replace('{wishesLine}', wishes?.trim() ? `- やりたいこと: ${wishes.trim()}` : '')

    const rawText = await callGemini(prompt)
    const jsonMatch = rawText.match(/\{[\s\S]*\}/)
    if (!jsonMatch) throw new Error('APIからのレスポンスがJSON形式ではありません。')

    const plan = JSON.parse(jsonMatch[0])
    res.json(plan)
  } catch (err) {
    console.error('Plan generation error:', err.message)
    res.status(500).json({ error: err.message || 'プラン生成に失敗しました。' })
  }
})

app.use('/api', createCalendarRouter())

// LINE Webhook
if (process.env.LINE_CHANNEL_SECRET && process.env.LINE_CHANNEL_ACCESS_TOKEN) {
  try {
    const lineRouter = createLineRouter(callGemini, PROMPT_TEMPLATE, THEME_LABELS, WEATHER_LABELS)
    app.post('/api/line/webhook',
      lineRouter.middleware,
      async (req, res) => {
        try {
          const events = req.body.events ?? []
          await Promise.all(events.map(async (event) => {
            if (event.type !== 'message' || event.message.type !== 'text') return
            const userId = event.source.userId
            const text = event.message.text.trim()
            const result = await lineRouter.handleStep(userId, text)
            const replyMessages = Array.isArray(result) ? result : result.messages
            const asyncTask = Array.isArray(result) ? null : result.asyncTask
            await lineRouter.client.replyMessage({
              replyToken: event.replyToken,
              messages: replyMessages,
            })
            if (asyncTask) {
              asyncTask()
                .then(planMessages => lineRouter.client.pushMessage({ to: userId, messages: planMessages }))
                .catch(() => lineRouter.client.pushMessage({ to: userId, messages: [{ type: 'text', text: 'プラン生成に失敗しました。もう一度予算を送ってください。' }] }))
            }
          }))
          res.json({ status: 'ok' })
        } catch (err) {
          console.error('Webhook handler error:', err.message)
          res.status(500).json({ error: err.message })
        }
      }
    )
    console.log('✅ LINE Webhook enabled')
  } catch (err) {
    console.error('❌ LINE Webhook setup failed:', err.message)
  }
} else {
  console.warn('⚠️  LINE env vars not set. Webhook disabled.')
}

app.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ Backend server running at http://localhost:${PORT}`)
  if (!process.env.GEMINI_API_KEY) console.warn('⚠️  GEMINI_API_KEY is not set.')
})
