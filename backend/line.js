import * as line from '@line/bot-sdk'

const sessions = new Map()

const THEME_MAP = {
  'アクティブ': 'active', '1': 'active',
  'グルメ': 'gourmet',   '2': 'gourmet',
  'まったり': 'relax',   '3': 'relax',
  'ドライブ': 'drive',   '4': 'drive',
  'おまかせ': 'relax',   '5': 'relax',
}

function qr(...items) {
  return { items: items.map(([label, text]) => ({ type: 'action', action: { type: 'message', label, text: text ?? label } })) }
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

function nextWeekday(dow) {
  const now = new Date(new Date().toLocaleString('en', { timeZone: 'Asia/Tokyo' }))
  const diff = (dow - now.getDay() + 7) % 7 || 7
  const d = new Date(now); d.setDate(d.getDate() + diff)
  return d.toISOString().split('T')[0]
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
        type: 'box', layout: 'vertical', paddingAll: '8px', spacing: 'xs',
        contents: [
          {
            type: 'button', style: 'secondary', height: 'sm',
            action: { type: 'uri', label: '📍 Googleマップで見る', uri: `https://www.google.com/maps/search/${encodeURIComponent(s.name + ' ' + area)}` }
          },
          {
            type: 'button', style: 'secondary', height: 'sm',
            action: { type: 'message', label: '🔄 このスポットを変更', text: `変更:${s.time}` }
          }
        ]
      }
    }
  })

  const timelineMsg = {
    type: 'flex',
    altText: '🗺️ タイムライン',
    contents: { type: 'carousel', contents: spotCards }
  }

  function buildRestaurantCards(options) {
    return (options ?? []).slice(0, 5).map(r => {
      const tabelogUrl = `https://www.google.com/search?q=${encodeURIComponent(r.name + ' 食べログ')}`
      const mapsUrl = `https://www.google.com/maps/search/${encodeURIComponent(r.name + ' ' + area)}`
      return {
        type: 'bubble', size: 'kilo',
        body: {
          type: 'box', layout: 'vertical', paddingAll: '14px', spacing: 'sm',
          contents: [
            { type: 'text', text: r.name, weight: 'bold', size: 'md', wrap: true },
            { type: 'text', text: r.genre, size: 'sm', color: '#888888' },
            { type: 'text', text: `¥${(r.price_per_person ?? 0).toLocaleString()}/人`, size: 'sm', color: '#e91e8c', weight: 'bold', margin: 'sm' },
            { type: 'text', text: r.memo ?? '', size: 'xs', color: '#666666', wrap: true, margin: 'sm' },
            { type: 'text', text: '※AIによる参考提案です', size: 'xxs', color: '#aaaaaa', margin: 'sm' }
          ]
        },
        footer: {
          type: 'box', layout: 'vertical', spacing: 'sm', paddingAll: '10px',
          contents: [
            {
              type: 'button', style: 'primary', height: 'sm', color: '#e91e8c',
              action: { type: 'uri', label: '📍 Googleマップで探す', uri: mapsUrl }
            },
            {
              type: 'button', style: 'secondary', height: 'sm',
              action: { type: 'uri', label: '🍴 食べログで検索', uri: tabelogUrl }
            }
          ]
        }
      }
    })
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
    text: '💬 「もう一度」→ 別プランを生成\n💬 「最初から」→ メニューに戻る'
  })

  return messages
}

function makeMenuCarousel() {
  return [
    { type: 'text', text: 'こんにちは！💑✈️\nどちらのプランを作りますか？' },
    {
      type: 'flex',
      altText: 'デートプランか旅行プランを選んでください',
      contents: {
        type: 'carousel',
        contents: [
          {
            type: 'bubble',
            header: {
              type: 'box', layout: 'vertical', backgroundColor: '#e91e8c', paddingAll: '20px',
              contents: [
                { type: 'text', text: '💑', size: 'xxl', align: 'center' },
                { type: 'text', text: 'デートプラン', color: '#ffffff', weight: 'bold', size: 'lg', align: 'center', margin: 'sm' }
              ]
            },
            body: {
              type: 'box', layout: 'vertical', paddingAll: '16px',
              contents: [{ type: 'text', text: 'エリア・テーマ・予算を入力するだけで、AIが最高のデートプランを提案します✨', size: 'sm', wrap: true, color: '#555555' }]
            },
            footer: {
              type: 'box', layout: 'vertical', paddingAll: '12px',
              contents: [{
                type: 'button', style: 'primary', color: '#e91e8c',
                action: { type: 'message', label: '💑 デートプランを作る', text: 'デートプラン' }
              }]
            }
          },
          {
            type: 'bubble',
            header: {
              type: 'box', layout: 'vertical', backgroundColor: '#1565C0', paddingAll: '20px',
              contents: [
                { type: 'text', text: '✈️', size: 'xxl', align: 'center' },
                { type: 'text', text: '旅行プラン', color: '#ffffff', weight: 'bold', size: 'lg', align: 'center', margin: 'sm' }
              ]
            },
            body: {
              type: 'box', layout: 'vertical', paddingAll: '16px',
              contents: [{ type: 'text', text: '目的地・泊数・宿タイプを入力するだけで、じゃらんと連携した旅行プランを提案します🏨', size: 'sm', wrap: true, color: '#555555' }]
            },
            footer: {
              type: 'box', layout: 'vertical', paddingAll: '12px',
              contents: [{
                type: 'button', style: 'primary', color: '#1565C0',
                action: { type: 'message', label: '✈️ 旅行プランを作る', text: '旅行' }
              }]
            }
          }
        ]
      }
    }
  ]
}

async function generateTravelPlan(data, callGemini) {
  const { destination, nights, travelStyle, budget } = data
  const prompt = `あなたはカップル向けの旅行プランを提案する専門家です。
以下の条件で${nights}泊${nights + 1}日の旅行プランをJSONで提案してください：
- 目的地: ${destination}
- 宿泊スタイル: ${travelStyle || 'おまかせ'}
- 予算（ふたり合計・宿泊込み）: ${Number(budget).toLocaleString()}円

以下のJSON形式のみで返してください。テキストや前置き、コードブロックは不要です。

{
  "title": "旅行プランのタイトル",
  "destination": "実際の目的地名",
  "nights": ${nights},
  "total_budget": 数値,
  "accommodation_memo": "おすすめの宿のタイプや特徴（例：露天風呂付き客室の温泉旅館）",
  "price_per_night": 数値（1泊2人の宿泊費目安）,
  "days": [
    {
      "day": 1,
      "title": "1日目のテーマ（例：絶景と温泉）",
      "spots": [
        {
          "time": "10:00",
          "name": "場所名",
          "category": "食事|観光|体験|チェックイン",
          "duration_min": 60,
          "transport": "電車|バス|車|徒歩",
          "memo": "ひとことメモ",
          "budget": 数値
        }
      ]
    }
  ]
}`
  const rawText = await callGemini(prompt)
  const jsonMatch = rawText.match(/\{[\s\S]*\}/)
  if (!jsonMatch) throw new Error('旅行プラン生成に失敗しました')
  return JSON.parse(jsonMatch[0])
}

function travelPlanToMessages(plan) {
  const destination = plan.destination ?? ''
  const nights = plan.nights ?? 1
  const jalanUrl = `https://px.a8.net/svt/ejp?a8mat=4B5Y0E%2B6MQUCY%2B14CS%2B6C9LD&a8ejpredirect=${encodeURIComponent('https://www.jalan.net/yad/?screenId=UWW3101&keyword=' + destination)}`
  const CATEGORY_COLOR = { '食事': '#FF6B35', '観光': '#4CAF50', '体験': '#2196F3', 'チェックイン': '#1565C0' }
  const TRANSPORT_ICON = { '徒歩': '🚶', '電車': '🚃', 'バス': '🚌', '車': '🚗' }

  const summaryMsg = {
    type: 'flex', altText: plan.title,
    contents: {
      type: 'bubble',
      header: {
        type: 'box', layout: 'vertical', backgroundColor: '#1565C0', paddingAll: '16px',
        contents: [
          { type: 'text', text: '✈️ 旅行プラン', color: '#ffffff', size: 'xs' },
          { type: 'text', text: plan.title, color: '#ffffff', size: 'md', weight: 'bold', wrap: true, margin: 'sm' }
        ]
      },
      body: {
        type: 'box', layout: 'vertical', spacing: 'sm',
        contents: [
          { type: 'box', layout: 'horizontal', contents: [
            { type: 'text', text: '📍 目的地', size: 'sm', color: '#888888', flex: 2 },
            { type: 'text', text: destination, size: 'sm', flex: 3, wrap: true }
          ]},
          { type: 'box', layout: 'horizontal', contents: [
            { type: 'text', text: '🌙 日程', size: 'sm', color: '#888888', flex: 2 },
            { type: 'text', text: `${nights}泊${nights + 1}日`, size: 'sm', flex: 3 }
          ]},
          { type: 'box', layout: 'horizontal', contents: [
            { type: 'text', text: '🏨 宿タイプ', size: 'sm', color: '#888888', flex: 2 },
            { type: 'text', text: plan.accommodation_memo ?? '', size: 'xs', flex: 3, wrap: true }
          ]},
          { type: 'box', layout: 'horizontal', contents: [
            { type: 'text', text: '💰 合計予算', size: 'sm', color: '#888888', flex: 2 },
            { type: 'text', text: `¥${(plan.total_budget ?? 0).toLocaleString()}`, size: 'sm', flex: 3, color: '#1565C0', weight: 'bold' }
          ]}
        ]
      },
      footer: {
        type: 'box', layout: 'vertical', paddingAll: '10px',
        contents: [{
          type: 'button', style: 'primary', height: 'sm', color: '#1565C0',
          action: { type: 'uri', label: '🏨 じゃらんで宿を探す', uri: jalanUrl }
        }]
      }
    }
  }

  const messages = [summaryMsg]

  for (const day of (plan.days ?? []).slice(0, 3)) {
    const spotCards = (day.spots ?? []).map(s => ({
      type: 'bubble', size: 'kilo',
      header: {
        type: 'box', layout: 'vertical',
        backgroundColor: CATEGORY_COLOR[s.category] ?? '#666666', paddingAll: '12px',
        contents: [
          { type: 'text', text: s.time, color: '#ffffff', size: 'lg', weight: 'bold' },
          { type: 'text', text: s.name, color: '#ffffff', size: 'sm', wrap: true, margin: 'xs' }
        ]
      },
      body: {
        type: 'box', layout: 'vertical', paddingAll: '12px', spacing: 'sm',
        contents: [
          { type: 'text', text: s.memo, size: 'sm', wrap: true, color: '#555555' },
          { type: 'separator', margin: 'sm' },
          { type: 'box', layout: 'horizontal', margin: 'sm', contents: [
            { type: 'text', text: `⏱ ${s.duration_min}分`, size: 'xs', color: '#888888', flex: 1 },
            { type: 'text', text: `${TRANSPORT_ICON[s.transport] ?? '🚶'} ${s.transport}`, size: 'xs', color: '#888888', align: 'center', flex: 1 },
            { type: 'text', text: `¥${(s.budget ?? 0).toLocaleString()}`, size: 'xs', color: '#888888', align: 'end', flex: 1 }
          ]}
        ]
      },
      footer: {
        type: 'box', layout: 'vertical', paddingAll: '8px',
        contents: [{
          type: 'button', style: 'secondary', height: 'sm',
          action: { type: 'uri', label: '📍 Googleマップで見る', uri: `https://www.google.com/maps/search/${encodeURIComponent(s.name + ' ' + destination)}` }
        }]
      }
    }))

    messages.push({
      type: 'flex', altText: `${day.day}日目: ${day.title}`,
      contents: {
        type: 'carousel',
        contents: [
          {
            type: 'bubble', size: 'kilo',
            body: {
              type: 'box', layout: 'vertical', alignItems: 'center', justifyContent: 'center',
              backgroundColor: '#1565C0', paddingAll: '24px',
              contents: [
                { type: 'text', text: `${day.day}日目`, color: '#ffffff', weight: 'bold', size: 'xxl', align: 'center' },
                { type: 'text', text: day.title, color: '#ffffff', size: 'sm', align: 'center', margin: 'md', wrap: true },
                { type: 'text', text: '← スワイプして見る', color: '#ffffff', size: 'xs', align: 'center', margin: 'sm' }
              ]
            }
          },
          ...spotCards
        ]
      }
    })
  }

  messages.push({
    type: 'text',
    text: '💬 「もう一度」→ 別の旅行プランを生成\n💬 「最初から」→ メニューに戻る'
  })

  return messages
}

async function handleStep(userId, text, callGemini, PROMPT_TEMPLATE, THEME_LABELS, WEATHER_LABELS) {
  const session = getSession(userId)
  const { step, data } = session

  if (text === '旅行' || text === '旅行プランを作りたい' || text === '旅行プラン') {
    sessions.set(userId, { step: 'travel_dest', data: { mode: 'travel' } })
    return [{ type: 'text', text: '✈️ 旅行プランを作りましょう！\n\n📍 どこに行きたいですか？\n例：京都、沖縄、北海道・函館' }]
  }

  if (text === 'デートプラン' || text === 'デートプランを作る') {
    const hint = session.data?.imageHint ? `\n\n📸 「${session.data.imageHint}」を参考にします！` : ''
    sessions.set(userId, { step: 'wishes', data: { imageHint: session.data?.imageHint, imageArea: session.data?.imageArea } })
    return [{
      type: 'text',
      text: `💑 デートプランを作りましょう！${hint}\n\n💬 やりたいことを教えてください。\n例：水族館に行きたい、夜景が見たい\n\n📸 SNSの写真を送ってもOKです！`,
      quickReply: qr(['スキップ'])
    }]
  }

  if (text === '最初から') {
    sessions.set(userId, { step: 'menu', data: {} })
    return makeMenuCarousel()
  }

  const changeMatch = text.match(/^変更:(\d{1,2}:\d{2})$/)
  if (changeMatch && data.plan) {
    const targetTime = changeMatch[1]
    const targetSpot = data.plan.spots?.find(s => s.time === targetTime)
    if (targetSpot) {
      session.data.changeTarget = targetTime
      session.step = 'spot_change'
      return [{
        type: 'text',
        text: `🔄 ${targetTime}「${targetSpot.name}」を変更します。\nどんなスポットにしますか？`,
        quickReply: qr(['自動で提案して', 'スキップ'])
      }]
    }
  }

  if (text === 'もう一度' && (step === 'done' || step === 'travel_done')) {
    const isTravel = step === 'travel_done'
    return {
      messages: [{ type: 'text', text: isTravel ? '✈️ 別の旅行プランを考え中...' : '💕 別のプランを考え中...\nしばらくお待ちください！' }],
      asyncTask: async () => {
        try {
          if (isTravel) {
            const plan = await generateTravelPlan(data, callGemini)
            return travelPlanToMessages(plan)
          }
          const plan = await generatePlan(data, callGemini, PROMPT_TEMPLATE, THEME_LABELS, WEATHER_LABELS)
          data.plan = plan
          return planToMessages(plan)
        } catch {
          return [{ type: 'text', text: 'プラン生成に失敗しました。もう一度お試しください。' }]
        }
      }
    }
  }

  switch (step) {
    case 'start':
    case 'menu': {
      session.step = 'menu'
      return makeMenuCarousel()
    }

    case 'wishes': {
      session.data.wishes = text === 'スキップ' ? (session.data.imageHint || '') : text
      session.step = 'area'
      const areaQr = session.data.imageArea
        ? qr([session.data.imageArea], ['おまかせ'])
        : qr(['おまかせ'])
      return [{ type: 'text', text: '📍 エリアはどこにしますか？\n例：横浜、渋谷、大阪・心斎橋\n\n（AIに決めてもらう場合は「おまかせ」）', quickReply: areaQr }]
    }

    case 'area': {
      session.data.area = (text === 'おまかせ' || text === 'スキップ') ? '' : text
      session.step = 'date'
      return [{ type: 'text', text: `📅 デートはいつですか？`, quickReply: qr(['今日'], ['明日'], ['今週土曜', nextWeekday(6)], ['今週日曜', nextWeekday(0)]) }]
    }

    case 'date': {
      let dateStr = text
      const now = new Date(new Date().toLocaleString('en', { timeZone: 'Asia/Tokyo' }))
      if (text === '今日') dateStr = now.toISOString().split('T')[0]
      else if (text === '明日') { const t = new Date(now); t.setDate(t.getDate() + 1); dateStr = t.toISOString().split('T')[0] }
      session.data.date = dateStr
      session.step = 'time'
      return [{ type: 'text', text: '⏰ 何時から何時まで？', quickReply: qr(['10時〜20時'], ['11時〜21時'], ['12時〜22時'], ['スキップ']) }]
    }

    case 'time': {
      let startTime = '11:00', endTime = '20:00'
      if (text !== 'スキップ') {
        const m = text.match(/(\d{1,2})(?:[:時](\d{0,2}))?(?:[〜~\-–]|から)(\d{1,2})(?:[:時](\d{0,2}))?/)
        if (m) {
          startTime = `${m[1].padStart(2, '0')}:${(m[2] || '00').padStart(2, '0')}`
          endTime = `${m[3].padStart(2, '0')}:${(m[4] || '00').padStart(2, '0')}`
        }
      }
      session.data.startTime = startTime
      session.data.endTime = endTime
      session.step = 'transport'
      return [{ type: 'text', text: '🚗 移動手段は？', quickReply: qr(['🚗 車', '車'], ['🚃 公共交通機関', '公共交通機関']) }]
    }

    case 'transport': {
      const byCar = text === '1' || text === '車' || text.includes('車')
      session.data.transport = byCar ? '車' : '公共交通機関'
      session.step = 'theme'
      return [{ type: 'text', text: '🎨 テーマを選んでください', quickReply: qr(['🏃 アクティブ', 'アクティブ'], ['🍽️ グルメ', 'グルメ'], ['☕ まったり', 'まったり'], ['🚗 ドライブ', 'ドライブ'], ['🎲 おまかせ', 'おまかせ']) }]
    }

    case 'theme': {
      session.data.theme = THEME_MAP[text] ?? null
      session.step = 'budget'
      return [{ type: 'text', text: '💰 予算はおふたりの合計で？', quickReply: qr(['5,000円', '5000'], ['10,000円', '10000'], ['20,000円', '20000'], ['30,000円', '30000']) }]
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
            session.data.plan = plan
            return planToMessages(plan)
          } catch {
            session.step = 'budget'
            return [{ type: 'text', text: 'プラン生成に失敗しました。もう一度予算を送ってください。' }]
          }
        }
      }
    }

    case 'travel_dest': {
      session.data.destination = text
      session.step = 'travel_nights'
      return [{ type: 'text', text: '🌙 何泊の旅行ですか？', quickReply: qr(['1泊2日', '1泊'], ['2泊3日', '2泊'], ['3泊4日', '3泊']) }]
    }

    case 'travel_nights': {
      let nights = 1
      if (text === '2' || text.includes('2泊')) nights = 2
      else if (text === '3' || text.includes('3泊')) nights = 3
      session.data.nights = nights
      session.step = 'travel_style'
      return [{ type: 'text', text: '🏨 宿のタイプは？', quickReply: qr(['♨️ 温泉旅館', '温泉'], ['🏙️ シティホテル', 'シティ'], ['🏖️ リゾート', 'リゾート'], ['🎲 おまかせ', 'おまかせ']) }]
    }

    case 'travel_style': {
      const styleMap = { '1': '温泉旅館', '2': 'シティホテル', '3': 'リゾートホテル', '4': 'おまかせ', '温泉': '温泉旅館', 'シティ': 'シティホテル', 'リゾート': 'リゾートホテル', 'おまかせ': 'おまかせ' }
      session.data.travelStyle = styleMap[text] ?? text
      session.step = 'travel_budget'
      return [{ type: 'text', text: '💰 予算はおふたりの合計で？\n（宿泊・食事・観光すべて込み）', quickReply: qr(['30,000円', '30000'], ['50,000円', '50000'], ['80,000円', '80000'], ['100,000円', '100000']) }]
    }

    case 'travel_budget': {
      const travelBudget = parseInt(text.replace(/[^0-9]/g, '')) || 50000
      session.data.budget = travelBudget
      session.step = 'travel_generating'

      return {
        messages: [{ type: 'text', text: '✈️ 素敵な旅行プランを考え中...\nしばらくお待ちください！' }],
        asyncTask: async () => {
          try {
            const plan = await generateTravelPlan(session.data, callGemini)
            session.step = 'travel_done'
            return travelPlanToMessages(plan)
          } catch {
            session.step = 'travel_budget'
            return [{ type: 'text', text: '旅行プラン生成に失敗しました。もう一度予算を送ってください。' }]
          }
        }
      }
    }

    case 'spot_change': {
      const { plan, changeTarget } = session.data
      const currentSpot = plan?.spots?.find(s => s.time === changeTarget)
      const userRequest = text === 'スキップ' ? '' : text
      session.step = 'done'

      return {
        messages: [{ type: 'text', text: '🔄 変更中...' }],
        asyncTask: async () => {
          try {
            const otherSpots = (plan.spots ?? [])
              .filter(s => s.time !== changeTarget)
              .map(s => `${s.time} ${s.name}（${s.category}）`).join('\n')

            const prompt = `以下のデートプランで${changeTarget}のスポット「${currentSpot?.name ?? ''}」を別のスポットに変えてください。
エリア: ${plan.area}
他のスポット:
${otherSpots}
${userRequest ? `変更希望: ${userRequest}` : '自動で最適なスポットを提案してください。'}

以下のJSON形式のみで1件返してください：
{
  "time": "${changeTarget}",
  "name": "場所名",
  "category": "食事|観光|体験|移動",
  "duration_min": 数値,
  "transport": "徒歩|電車|バス|車",
  "parking_fee": 0,
  "memo": "ひとことメモ",
  "budget": 数値
}`
            const raw = await callGemini(prompt)
            const m = raw.match(/\{[\s\S]*\}/)
            if (!m) throw new Error('parse error')
            const newSpot = JSON.parse(m[0])
            const idx = plan.spots.findIndex(s => s.time === changeTarget)
            if (idx !== -1) plan.spots[idx] = newSpot

            return [
              { type: 'text', text: `✅「${newSpot.name}」に変更しました！` },
              { type: 'flex', altText: '🗺️ 更新されたタイムライン', contents: { type: 'carousel', contents: planToMessages(plan)[1].contents.contents } }
            ]
          } catch {
            return [{ type: 'text', text: 'スポットの変更に失敗しました。もう一度お試しください。' }]
          }
        }
      }
    }

    default: {
      sessions.set(userId, { step: 'menu', data: {} })
      return makeMenuCarousel()
    }
  }
}

async function handleImage(userId, imageBase64, callGeminiVision) {
  const session = getSession(userId)
  const prompt = 'この画像に写っている観光スポット・場所・体験・料理などを日本語で教えてください。\n以下のJSON形式のみで返してください：\n{"place": "場所名や体験名（わかれば具体的に）", "area": "エリア・都市名（わかれば）", "description": "どんな場所/体験か20字以内"}'
  let info = { place: '', area: '', description: '' }
  try {
    const raw = await callGeminiVision(imageBase64, prompt)
    const m = raw.match(/\{[\s\S]*\}/)
    if (m) info = { ...info, ...JSON.parse(m[0]) }
  } catch { /* 解析失敗はデフォルト値のまま */ }

  const hint = info.place || info.description || '気になる場所'
  session.data.imageHint = hint
  session.data.imageArea = info.area || ''

  return [{
    type: 'text',
    text: `📸 「${hint}」${info.area ? `（${info.area}）` : ''}ですね！\nこれを参考にプランを作りましょう！`,
    quickReply: qr(['💑 デートプラン', 'デートプラン'], ['✈️ 旅行プラン', '旅行'])
  }]
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

  return {
    middleware, client,
    handleStep: (userId, text) => handleStep(userId, text, callGemini, PROMPT_TEMPLATE, THEME_LABELS, WEATHER_LABELS),
    handleImage: (userId, imageBase64, callGeminiVision) => handleImage(userId, imageBase64, callGeminiVision)
  }
}
