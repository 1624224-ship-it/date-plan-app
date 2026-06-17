import * as line from '@line/bot-sdk'

const sessions = new Map()

const THEME_MAP = {
  'アクティブ': 'active', '1': 'active',
  'グルメ': 'gourmet',   '2': 'gourmet',
  'まったり': 'relax',   '3': 'relax',
  'ドライブ': 'drive',   '4': 'drive',
  'おまかせ': 'relax',   '5': 'relax',
}

function getSession(userId) {
  if (!sessions.has(userId)) {
    sessions.set(userId, { step: 'start', data: {} })
  }
  return sessions.get(userId)
}

function today() {
  return new Date().toLocaleDateString('ja-JP', { year: 'numeric', month: '2-digit', day: '2-digit', timeZone: 'Asia/Tokyo' }).replace(/\//g, '-')
}

async function generatePlan(data, callGemini, PROMPT_TEMPLATE, THEME_LABELS, WEATHER_LABELS) {
  const { area, wishes, theme, budget, startTime, endTime, transport } = data

  const areaLine = area
    ? `- エリア: ${area}`
    : `- エリア: （指定なし。やりたいことの内容から最適なエリアをあなたが選んでください）`

  const transportLine = transport === '車'
    ? `- 移動手段: 車\n※ エリア間の移動は車を前提にしてください。駐車場に停めて同エリア内を徒歩で回る場合は徒歩でOKです。駐車場があるスポットにはparking_feeに料金目安を入れてください。`
    : transport
    ? `- 移動手段: 公共交通機関\n※ スポット間の移動は電車・バスを前提にしてください。`
    : ''

  const prompt = PROMPT_TEMPLATE
    .replace('{areaLine}', areaLine)
    .replace('{coordsNote}', transportLine)
    .replace('{theme}', theme ? (THEME_LABELS[theme] ?? theme) : 'おまかせ（ふたりに合った最適なテーマで）')
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

function planToMessages(plan) {
  const CATEGORY_COLOR = { '食事': '#FF6B35', '観光': '#4CAF50', '体験': '#2196F3', '移動': '#9E9E9E' }
  const area = plan.area ?? ''

  const jalanUrl = `https://px.a8.net/svt/ejp?a8mat=4B5Y0E%2B6MQUCY%2B14CS%2B6C9LD&a8ejpredirect=${encodeURIComponent('https://www.jalan.net/yad/?screenId=UWW3101&keyword=' + (area || 'デート'))}`

  const summaryMsg = {
    type: 'flex',
    altText: plan.title,
    contents: {
      type: 'bubble',
      header: {
        type: 'box', layout: 'vertical', backgroundColor: '#e91e8c', paddingAll: '16px',
        contents: [
          { type: 'text', text: '💑 デートプラン', color: '#ffffff', size: 'xs' },
          { type: 'text', text: plan.title, color: '#ffffff', size: 'md', weight: 'bold', wrap: true, margin: 'sm' }
        ]
      },
      body: {
        type: 'box', layout: 'vertical', spacing: 'sm',
        contents: [
          { type: 'box', layout: 'horizontal', contents: [
            { type: 'text', text: '📍 エリア', size: 'sm', color: '#888888', flex: 2 },
            { type: 'text', text: area, size: 'sm', flex: 3, wrap: true }
          ]},
          { type: 'box', layout: 'horizontal', contents: [
            { type: 'text', text: '💰 合計予算', size: 'sm', color: '#888888', flex: 2 },
            { type: 'text', text: `¥${(plan.total_budget ?? 0).toLocaleString()}`, size: 'sm', flex: 3, color: '#e91e8c', weight: 'bold' }
          ]}
        ]
      },
      footer: {
        type: 'box', layout: 'vertical', paddingAll: '10px',
        contents: [{
          type: 'button', style: 'secondary', height: 'sm',
          action: { type: 'uri', label: '🏨 じゃらんで宿を探す', uri: jalanUrl }
        }]
      }
    }
  }

  const TRANSPORT_ICON = { '徒歩': '🚶', '電車': '🚃', 'バス': '🚌', '車': '🚗' }

  const spotCards = (plan.spots ?? []).map(s => {
    const transportIcon = TRANSPORT_ICON[s.transport] ?? '🚗'
    const hasPark = s.transport === '車' && s.parking_fee > 0
    const bottomRow = [
      { type: 'text', text: `⏱ ${s.duration_min}分`, size: 'xs', color: '#888888', flex: 1 },
      { type: 'text', text: `${transportIcon} ${s.transport}`, size: 'xs', color: '#888888', align: 'center', flex: 1 },
      { type: 'text', text: `¥${(s.budget ?? 0).toLocaleString()}`, size: 'xs', color: '#888888', align: 'end', flex: 1 }
    ]
    const bodyContents = [
      { type: 'text', text: s.memo, size: 'sm', wrap: true, color: '#555555' },
      { type: 'separator', margin: 'sm' },
      { type: 'box', layout: 'horizontal', margin: 'sm', contents: bottomRow }
    ]
    if (hasPark) {
      bodyContents.push({
        type: 'box', layout: 'horizontal', margin: 'xs',
        contents: [
          { type: 'text', text: '🅿️ 駐車場', size: 'xs', color: '#888888', flex: 1 },
          { type: 'text', text: `¥${s.parking_fee.toLocaleString()}`, size: 'xs', color: '#888888', align: 'end', flex: 1 }
        ]
      })
    }
    return {
      type: 'bubble', size: 'kilo',
      header: {
        type: 'box', layout: 'vertical',
        backgroundColor: CATEGORY_COLOR[s.category] ?? '#666666',
        paddingAll: '12px',
        contents: [
          { type: 'text', text: s.time, color: '#ffffff', size: 'lg', weight: 'bold' },
          { type: 'text', text: s.name, color: '#ffffff', size: 'sm', wrap: true, margin: 'xs' }
        ]
      },
      body: {
        type: 'box', layout: 'vertical', paddingAll: '12px', spacing: 'sm',
        contents: bodyContents
      },
      footer: {
        type: 'box', layout: 'vertical', paddingAll: '8px',
        contents: [{
          type: 'button', style: 'secondary', height: 'sm',
          action: { type: 'uri', label: '📍 Googleマップで見る', uri: `https://www.google.com/maps/search/${encodeURIComponent(s.name + ' ' + area)}` }
        }]
      }
    }
  })

  const timelineMsg = {
    type: 'flex',
    altText: '🗺️ タイムライン',
    contents: { type: 'carousel', contents: spotCards }
  }

  function buildRestaurantCards(options) {
    return (options ?? []).slice(0, 5).map(r => ({
      type: 'bubble', size: 'kilo',
      body: {
        type: 'box', layout: 'vertical', paddingAll: '14px', spacing: 'sm',
        contents: [
          { type: 'text', text: r.name, weight: 'bold', size: 'md', wrap: true },
          { type: 'text', text: r.genre, size: 'sm', color: '#888888' },
          { type: 'text', text: `¥${(r.price_per_person ?? 0).toLocaleString()}/人`, size: 'sm', color: '#e91e8c', weight: 'bold', margin: 'sm' },
          { type: 'text', text: r.memo ?? '', size: 'xs', color: '#666666', wrap: true, margin: 'sm' }
        ]
      },
      footer: {
        type: 'box', layout: 'vertical', spacing: 'sm', paddingAll: '10px',
        contents: [
          {
            type: 'button', style: 'primary', height: 'sm', color: '#e91e8c',
            action: { type: 'uri', label: '📍 Googleマップ', uri: `https://www.google.com/maps/search/${encodeURIComponent(r.name + ' ' + area)}` }
          },
          {
            type: 'button', style: 'secondary', height: 'sm',
            action: { type: 'uri', label: '🍴 食べログで検索', uri: `https://tabelog.com/search/?vs=1&sk=${encodeURIComponent(r.name)}&sa=${encodeURIComponent(area)}` }
          }
        ]
      }
    }))
  }

  function makeSectionCard(emoji, title, color) {
    return {
      type: 'bubble', size: 'kilo',
      body: {
        type: 'box', layout: 'vertical', alignItems: 'center', justifyContent: 'center',
        backgroundColor: color, paddingAll: '24px',
        contents: [
          { type: 'text', text: emoji, size: 'xxl', align: 'center' },
          { type: 'text', text: title, color: '#ffffff', weight: 'bold', size: 'lg', align: 'center', margin: 'md' },
          { type: 'text', text: '← スワイプしてお店を見る', color: '#ffffff', size: 'xs', align: 'center', margin: 'sm' }
        ]
      }
    }
  }

  const messages = [summaryMsg, timelineMsg]

  if (plan.lunch_options?.length) {
    const cards = [makeSectionCard('🍽️', 'ランチおすすめ', '#FF6B35'), ...buildRestaurantCards(plan.lunch_options)]
    messages.push({ type: 'flex', altText: '🍽️ ランチおすすめ', contents: { type: 'carousel', contents: cards } })
  }

  if (plan.dinner_options?.length) {
    const cards = [makeSectionCard('🌙', 'ディナーおすすめ', '#7B1FA2'), ...buildRestaurantCards(plan.dinner_options)]
    messages.push({ type: 'flex', altText: '🌙 ディナーおすすめ', contents: { type: 'carousel', contents: cards } })
  }

  messages.push({
    type: 'text',
    text: '💬 「もう一度」→ 別プランを生成\n💬 「最初から」→ 条件を入力し直す'
  })

  return messages
}

async function handleStep(userId, text, callGemini, PROMPT_TEMPLATE, THEME_LABELS, WEATHER_LABELS) {
  const session = getSession(userId)
  const { step, data } = session

  if (text === '最初から') {
    sessions.set(userId, { step: 'wishes', data: {} })
    return [{ type: 'text', text: '最初からやり直します！\n\n💬 やりたいことを教えてください。\n例：水族館に行きたい、夜景が見たい、おいしいパスタを食べたい\n\n（スキップする場合は「スキップ」と送ってください）' }]
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
      session.step = 'time'
      return [{ type: 'text', text: '⏰ 何時から何時まで予定していますか？\n例：11時〜21時、10:00〜20:00\n\n（「スキップ」で11:00〜20:00になります）' }]
    }

    case 'time': {
      let startTime = '11:00'
      let endTime = '20:00'
      if (text !== 'スキップ') {
        const m = text.match(/(\d{1,2})(?:[:時](\d{0,2}))?[〜~\-–](\d{1,2})(?:[:時](\d{0,2}))?/)
        if (m) {
          startTime = `${m[1].padStart(2, '0')}:${(m[2] || '00').padStart(2, '0')}`
          endTime = `${m[3].padStart(2, '0')}:${(m[4] || '00').padStart(2, '0')}`
        }
      }
      session.data.startTime = startTime
      session.data.endTime = endTime
      session.step = 'transport'
      return [{ type: 'text', text: '🚗 移動手段はどちらですか？\n\n1. 🚗 車\n2. 🚃 公共交通機関（電車・バスなど）\n\n番号か名前で答えてください' }]
    }

    case 'transport': {
      const byCar = text === '1' || text === '車' || text.includes('車')
      session.data.transport = byCar ? '車' : '公共交通機関'
      session.step = 'theme'
      return [{
        type: 'text',
        text: '🎨 テーマを選んでください：\n\n1. 🏃 アクティブ\n2. 🍽️ グルメ\n3. ☕ まったり\n4. 🚗 ドライブ\n5. 🎲 おまかせ\n\n番号か名前で答えてください'
      }]
    }

    case 'theme': {
      session.data.theme = THEME_MAP[text] ?? null
      session.step = 'budget'
      return [{ type: 'text', text: '💰 予算はおふたりの合計でどのくらいですか？\n例：5000、10000\n\n（数字だけ送ってください）' }]
    }

    case 'budget': {
      const budget = parseInt(text.replace(/[^0-9]/g, '')) || 5000
      session.data.budget = budget
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
      sessions.set(userId, { step: 'wishes', data: {} })
      return [{ type: 'text', text: 'こんにちは！💑\n\n💬 やりたいことを教えてください。\n例：水族館に行きたい、夜景が見たい\n\n（「スキップ」でスキップできます）' }]
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
