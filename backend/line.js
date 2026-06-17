import * as line from '@line/bot-sdk'

// ユーザーごとの会話状態を管理
const sessions = new Map()

const THEME_MAP = {
  'アクティブ': 'active', '1': 'active',
  'グルメ': 'gourmet',   '2': 'gourmet',
  'まったり': 'relax',   '3': 'relax',
  'ドライブ': 'drive',   '4': 'drive',
}

function getSession(userId) {
  if (!sessions.has(userId)) {
    sessions.set(userId, { step: 'start', data: {} })
  }
  return sessions.get(userId)
}

function resetSession(userId) {
  sessions.set(userId, { step: 'start', data: {} })
}

function today() {
  return new Date().toLocaleDateString('ja-JP', { year: 'numeric', month: '2-digit', day: '2-digit', timeZone: 'Asia/Tokyo' }).replace(/\//g, '-')
}

// プラン生成（server.jsのGemini呼び出しを再利用）
async function generatePlan(data, callGemini, PROMPT_TEMPLATE, THEME_LABELS, WEATHER_LABELS) {
  const { area, wishes, theme, budget, date, startTime, endTime } = data
  const weatherStr = 'sunny'

  const areaLine = area
    ? `- エリア: ${area}`
    : `- エリア: （指定なし。やりたいことの内容から最適なエリアをあなたが選んでください）`

  const prompt = PROMPT_TEMPLATE
    .replace('{areaLine}', areaLine)
    .replace('{coordsNote}', '')
    .replace('{theme}', THEME_LABELS[theme] ?? theme)
    .replace('{budget}', Number(budget).toLocaleString())
    .replace('{startTime}', startTime ?? '11:00')
    .replace('{endTime}', endTime ?? '20:00')
    .replace('{weather}', '晴れ')
    .replace('{wishesLine}', wishes?.trim() ? `- やりたいこと: ${wishes.trim()}` : '')

  const rawText = await callGemini(prompt)
  const jsonMatch = rawText.match(/\{[\s\S]*\}/)
  if (!jsonMatch) throw new Error('プラン生成に失敗しました')
  return JSON.parse(jsonMatch[0])
}

// プランをLINEメッセージに変換
function planToMessages(plan) {
  const spotsText = plan.spots?.map((s, i) =>
    `${i + 1}. ${s.time} 【${s.name}】\n   ${s.memo}\n   ⏱${s.duration_min}分 / ¥${(s.budget ?? 0).toLocaleString()}`
  ).join('\n\n') ?? ''

  const lunchText = plan.lunch_options?.slice(0, 3).map((r, i) =>
    `${i + 1}. ${r.name}（${r.genre}）¥${(r.price_per_person ?? 0).toLocaleString()}/人`
  ).join('\n') ?? ''

  return [
    {
      type: 'text',
      text: `💑 ${plan.title}\n📍 エリア: ${plan.area ?? ''}\n💰 合計予算: ¥${(plan.total_budget ?? 0).toLocaleString()}`
    },
    {
      type: 'text',
      text: `🗺️ タイムライン\n\n${spotsText}`
    },
    {
      type: 'text',
      text: `🍽️ ランチおすすめ\n\n${lunchText}\n\n---\n「もう一度」と送ると同じ条件で別プランを生成します\n「最初から」と送ると条件を入力し直せます`
    }
  ]
}

// 会話ステップの処理
async function handleStep(userId, text, callGemini, PROMPT_TEMPLATE, THEME_LABELS, WEATHER_LABELS) {
  const session = getSession(userId)
  const { step, data } = session

  if (text === '最初から') {
    resetSession(userId)
    return [{ type: 'text', text: '最初からやり直します！\n\n💬 まず「やりたいこと」を教えてください。\n例：水族館に行きたい、夜景が見たい、おいしいパスタを食べたい\n\n（スキップする場合は「スキップ」と送ってください）' }]
  }

  if (text === 'もう一度' && step === 'done') {
    return {
      messages: [{ type: 'text', text: '💕 別のプランを考え中...\nしばらくお待ちください！' }],
      asyncTask: async () => {
        try {
          const plan = await generatePlan(data, callGemini, PROMPT_TEMPLATE, THEME_LABELS, WEATHER_LABELS)
          return planToMessages(plan)
        } catch {
          return [{ type: 'text', text: 'プラン生成に失敗しました。もう一度お試しください。' }]
        }
      }
    }
  }

  switch (step) {
    case 'start': {
      session.step = 'wishes'
      return [{ type: 'text', text: 'こんにちは！💑 デートプランを一緒に考えましょう！\n\n💬 やりたいことを教えてください。\n例：水族館に行きたい、夜景が見たい、おいしいパスタを食べたい\n\n（スキップする場合は「スキップ」と送ってください）' }]
    }

    case 'wishes': {
      session.data.wishes = text === 'スキップ' ? '' : text
      session.step = 'area'
      return [{ type: 'text', text: '📍 エリアはどこにしますか？\n例：横浜、渋谷、大阪・心斎橋\n\n（やりたいことからAIに決めてもらう場合は「おまかせ」と送ってください）' }]
    }

    case 'area': {
      session.data.area = (text === 'おまかせ' || text === 'スキップ') ? '' : text
      session.step = 'date'
      return [{ type: 'text', text: `📅 デートの日付を教えてください。\n例：${today()}\n\n（「今日」「明日」もOKです）` }]
    }

    case 'date': {
      let dateStr = text
      const now = new Date(new Date().toLocaleString('en', { timeZone: 'Asia/Tokyo' }))
      if (text === '今日') {
        dateStr = now.toISOString().split('T')[0]
      } else if (text === '明日') {
        const tomorrow = new Date(now); tomorrow.setDate(tomorrow.getDate() + 1)
        dateStr = tomorrow.toISOString().split('T')[0]
      }
      session.data.date = dateStr
      session.step = 'theme'
      return [{
        type: 'text',
        text: '🎨 テーマを選んでください：\n\n1. 🏃 アクティブ\n2. 🍽️ グルメ\n3. ☕ まったり\n4. 🚗 ドライブ\n\n番号か名前で答えてください'
      }]
    }

    case 'theme': {
      const theme = THEME_MAP[text] ?? 'relax'
      session.data.theme = theme
      session.step = 'budget'
      return [{ type: 'text', text: '💰 予算はおふたりの合計でどのくらいですか？\n例：5000、10000\n\n（数字だけ送ってください）' }]
    }

    case 'budget': {
      const budget = parseInt(text.replace(/[^0-9]/g, '')) || 5000
      session.data.budget = budget
      session.data.startTime = '11:00'
      session.data.endTime = '20:00'
      session.step = 'generating'

      return {
        messages: [{ type: 'text', text: '💕 素敵なプランを考え中...\nしばらくお待ちください！' }],
        asyncTask: async () => {
          try {
            const plan = await generatePlan(session.data, callGemini, PROMPT_TEMPLATE, THEME_LABELS, WEATHER_LABELS)
            session.step = 'done'
            return planToMessages(plan)
          } catch {
            session.step = 'budget'
            return [{ type: 'text', text: 'プラン生成に失敗しました。もう一度予算を送ってください。' }]
          }
        }
      }
    }

    default: {
      resetSession(userId)
      return [{ type: 'text', text: 'こんにちは！「最初から」と送るとプラン作成を始められます💑' }]
    }
  }
}

export function createLineRouter(callGemini, PROMPT_TEMPLATE, THEME_LABELS, WEATHER_LABELS) {
  const config = {
    channelSecret: process.env.LINE_CHANNEL_SECRET,
    channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
  }
  const client = new line.messagingApi.MessagingApiClient({
    channelAccessToken: config.channelAccessToken,
  })
  const middleware = line.middleware(config)

  return { middleware, client, handleStep: (userId, text) =>
    handleStep(userId, text, callGemini, PROMPT_TEMPLATE, THEME_LABELS, WEATHER_LABELS)
  }
}
