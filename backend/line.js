import * as line from '@line/bot-sdk'

const sessions = new Map()

const PREFECTURE_STATIONS = {
  '東京':  ['渋谷・恵比寿', '新宿・代々木', '表参道・原宿', '銀座・有楽町', '六本木・麻布', '池袋', '上野・浅草', '吉祥寺', 'お台場'],
  '神奈川': ['横浜・みなとみらい', '鎌倉・江ノ島', '湘南・茅ヶ崎', '箱根', '川崎'],
  '大阪':  ['梅田・北新地', 'なんば・心斎橋', '天王寺・阿倍野', 'USJ周辺'],
  '京都':  ['京都駅周辺', '祇園・東山', '嵐山・嵯峨野', '河原町・四条'],
  '愛知':  ['名古屋駅周辺', '栄・矢場町', '大須'],
  '福岡':  ['博多', '天神・大名', 'キャナルシティ周辺'],
  '北海道': ['札幌・すすきの', '小樽', '函館'],
  '沖縄':  ['那覇・国際通り', '美浜・北谷', '恩納村・万座'],
}

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
  const { area, wishes, theme, budget, startTime, endTime, transport, lat, lng } = data

  const areaLine = area
    ? `- エリア: ${area}${lat && lng ? `（緯度${Number(lat).toFixed(4)}, 経度${Number(lng).toFixed(4)}）` : ''}`
    : `- エリア: （指定なし。やりたいことの内容から最適なエリアをあなたが選んでください）`

  const coordsNote = lat && lng
    ? `※ 上記の座標は現在地です。この座標から近い順にスポットを優先して提案してください。`
    : ''

  const transportLine = transport === '車'
    ? `- 移動手段: 車\n※ エリア間の移動は車を前提にしてください。駐車場に停めて同エリア内を徒歩で回る場合は徒歩でOKです。駐車場があるスポットにはparking_feeに料金目安を入れてください。`
    : transport
    ? `- 移動手段: 公共交通機関\n※ スポット間の移動は電車・バスを前提にしてください。`
    : ''

  const prompt = PROMPT_TEMPLATE
    .replace('{areaLine}', areaLine)
    .replace('{coordsNote}', [coordsNote, transportLine].filter(Boolean).join('\n'))
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

function planToMessages(plan, planUrl) {
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
            { type: 'text', text: area || 'エリア未定', size: 'sm', flex: 3, wrap: true }
          ]},
          { type: 'box', layout: 'horizontal', contents: [
            { type: 'text', text: '💰 合計予算', size: 'sm', color: '#888888', flex: 2 },
            { type: 'text', text: `¥${(plan.total_budget ?? 0).toLocaleString()}`, size: 'sm', flex: 3, color: '#e91e8c', weight: 'bold' }
          ]}
        ]
      },
      ...(planUrl ? { footer: {
        type: 'box', layout: 'vertical', paddingAll: '10px',
        contents: [{
          type: 'button', style: 'primary', height: 'sm', color: '#e91e8c',
          action: { type: 'uri', label: '🌐 予約・詳細をウェブで見る', uri: planUrl }
        }]
      }} : {})
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
      { type: 'text', text: s.memo || '詳細はウェブで確認', size: 'sm', wrap: true, color: '#555555' },
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

  function buildRestaurantCards(options, planUrl) {
    return (options ?? []).slice(0, 3).map(r => {
      const mapsUrl = `https://www.google.com/maps/search/${encodeURIComponent(r.name + ' ' + area)}`
      return {
        type: 'bubble', size: 'kilo',
        body: {
          type: 'box', layout: 'vertical', paddingAll: '14px', spacing: 'sm',
          contents: [
            { type: 'text', text: r.name, weight: 'bold', size: 'md', wrap: true },
            { type: 'text', text: r.genre, size: 'sm', color: '#888888' },
            { type: 'text', text: `¥${(r.price_per_person ?? 0).toLocaleString()}/人`, size: 'sm', color: '#e91e8c', weight: 'bold', margin: 'sm' },
            { type: 'text', text: r.memo || '詳細はウェブで確認', size: 'xs', color: '#666666', wrap: true, margin: 'sm' }
          ]
        },
        footer: {
          type: 'box', layout: 'vertical', spacing: 'sm', paddingAll: '10px',
          contents: [
            {
              type: 'button', style: 'primary', height: 'sm', color: '#e91e8c',
              action: { type: 'uri', label: '📍 Googleマップで探す', uri: mapsUrl }
            },
            ...(planUrl ? [{
              type: 'button', style: 'secondary', height: 'sm',
              action: { type: 'uri', label: '🔗 予約・詳細を見る', uri: planUrl }
            }] : [])
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
    const cards = [makeSectionCard('🍽️', 'ランチおすすめ', '#FF6B35'), ...buildRestaurantCards(plan.lunch_options, planUrl)]
    messages.push({ type: 'flex', altText: '🍽️ ランチおすすめ', contents: { type: 'carousel', contents: cards } })
  }

  if (plan.dinner_options?.length) {
    const cards = [makeSectionCard('🌙', 'ディナーおすすめ', '#7B1FA2'), ...buildRestaurantCards(plan.dinner_options, planUrl)]
    messages.push({ type: 'flex', altText: '🌙 ディナーおすすめ', contents: { type: 'carousel', contents: cards } })
  }

  messages.push({
    type: 'text',
    text: 'このプランどうだった？🗺️ 正直に教えてね！\n\n💬 「もう一度」→ 別プランを生成\n💬 「最初から」→ メニューに戻る',
    quickReply: {
      items: [
        { type: 'action', action: { type: 'message', label: '😍 最高！', text: 'FB:5' } },
        { type: 'action', action: { type: 'message', label: '😊 よかった', text: 'FB:4' } },
        { type: 'action', action: { type: 'message', label: '😐 まあまあ', text: 'FB:3' } },
        { type: 'action', action: { type: 'message', label: '😅 微妙だった', text: 'FB:2' } },
        { type: 'action', action: { type: 'message', label: '📅 まだ使ってない', text: 'FB:0' } },
      ]
    }
  })

  return messages
}

function makeMenuCarousel() {
  return [
    { type: 'text', text: 'こんにちは！💑✈️⏱️\nどのプランを作りますか？' },
    {
      type: 'flex',
      altText: 'プランの種類を選んでください',
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
              type: 'box', layout: 'vertical', backgroundColor: '#FF8C00', paddingAll: '20px',
              contents: [
                { type: 'text', text: '⏱️', size: 'xxl', align: 'center' },
                { type: 'text', text: '空き時間プラン', color: '#ffffff', weight: 'bold', size: 'lg', align: 'center', margin: 'sm' }
              ]
            },
            body: {
              type: 'box', layout: 'vertical', paddingAll: '16px',
              contents: [{ type: 'text', text: 'ちょっと時間が空いた！場所と時間を入れるだけで今すぐ使えるプランをサッと提案します⚡', size: 'sm', wrap: true, color: '#555555' }]
            },
            footer: {
              type: 'box', layout: 'vertical', paddingAll: '12px',
              contents: [{
                type: 'button', style: 'primary', color: '#FF8C00',
                action: { type: 'message', label: '⏱️ 空き時間プランを作る', text: '空き時間' }
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
  const { destination, departure, nights, travelStyle, travelTheme, travelWho, travelDates, travelTransport, travelWishes, budget } = data
  const extras = [
    departure     ? `- 出発地: ${departure}` : '',
    travelDates   ? `- 旅行時期: ${travelDates}` : '',
    travelWho     ? `- 同行者: ${travelWho}` : '',
    travelTheme   ? `- テーマ: ${travelTheme}` : '',
    travelTransport ? `- 移動手段の希望: ${travelTransport}` : '',
    travelWishes  ? `- やりたいこと: ${travelWishes}` : '',
  ].filter(Boolean).join('\n')
  const prompt = `あなたは旅行プランを提案する専門家です。
以下の条件で${nights}泊${nights + 1}日の旅行プランをJSONで提案してください：
- 目的地: ${destination}
- 宿泊スタイル: ${travelStyle || 'おまかせ'}
- 予算（ふたり合計・宿泊込み）: ${Number(budget).toLocaleString()}円
${extras}

以下のJSON形式のみで返してください。テキストや前置き、コードブロック（バッククォート）は一切不要です。JSONのみ返してください。
すべての数値フィールドは必ず整数（数字のみ）で返してください。文字列は絶対に使わないでください。

{
  "title": "旅行プランのタイトル",
  "destination": "実際の目的地名",
  "nights": ${nights},
  "total_budget": 50000,
  "accommodation_memo": "おすすめの宿のタイプや特徴",
  "price_per_night": 15000,
  "transport_options": [
    {"type": "新幹線", "detail": "東京→大阪 約2時間30分", "est_cost": 13500, "is_flight": false},
    {"type": "飛行機", "detail": "羽田→関空 約1時間", "est_cost": 18000, "is_flight": true},
    {"type": "レンタカー", "detail": "現地でのレンタカー利用", "est_cost": 8000, "is_flight": false}
  ],
  "accommodation_options": [
    {"name": "旅館Aの名前", "type": "温泉旅館", "est_price_per_night": 25000, "memo": "露天風呂付き客室が人気"},
    {"name": "ホテルBの名前", "type": "シティホテル", "est_price_per_night": 15000, "memo": "駅近で観光に便利"},
    {"name": "リゾートCの名前", "type": "リゾートホテル", "est_price_per_night": 30000, "memo": "海が見えるプール付き"}
  ],
  "days": [
    {
      "day": 1,
      "title": "1日目のテーマ",
      "spots": [
        {
          "time": "10:00",
          "name": "場所名",
          "category": "観光",
          "duration_min": 60,
          "transport": "電車",
          "memo": "ひとことメモ",
          "budget": 1000
        }
      ]
    }
  ]
}`
  const rawText = await callGemini(prompt)
  console.log('Travel plan raw response (first 300):', rawText.slice(0, 300))
  const cleaned = rawText.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim()
  const jsonMatch = cleaned.match(/\{[\s\S]*\}/)
  if (!jsonMatch) throw new Error('旅行プラン生成に失敗しました（JSONが見つかりません）')
  return JSON.parse(jsonMatch[0])
}

// アフィリエイトリンクはウェブページ側で使用（line.jsから移動済み）
export const AFFILIATE = {
  jalan: (destination, travelStyle = '', travelTheme = '', accommodationMemo = '') => {
    const dest = destination || ''
    const style = travelStyle || ''
    const theme = travelTheme || ''
    const memo = accommodationMemo || ''
    const base = 'https://px.a8.net/svt/ejp?a8mat='
    const onsenRedirect = encodeURIComponent('https://www.jalan.net/onsen/?keyword=' + dest)
    if (dest.includes('ディズニー') || dest.includes('TDR') || dest.includes('舞浜'))
      return { url: `${base}4B5Y0E%2B6MQUCY%2B14CS%2B63OYA`, label: '🎡 TDRホテルを予約する' }
    if (dest.includes('ペット') || dest.includes('犬'))
      return { url: `${base}4B5Y0E%2B6MQUCY%2B14CS%2B63H8I`, label: '🐕 ペットOKの宿を探す' }
    if (style.includes('卒業') || theme.includes('卒業') || dest.includes('卒業'))
      return { url: `${base}4B5Y0E%2B6MQUCY%2B14CS%2B691UQ`, label: '🎓 卒業旅行プランを見る' }
    if (style.includes('温泉') || theme.includes('温泉') || memo.includes('温泉'))
      return { url: `${base}4B5Y0E%2B6MQUCY%2B14CS%2B63WO2&a8ejpredirect=${onsenRedirect}`, label: '♨️ じゃらんで温泉宿を探す' }
    return { url: `${base}4B5Y0E%2B6MQUCY%2B14CS%2B67JUA&a8ejpredirect=${onsenRedirect}`, label: '🏨 じゃらんで宿を探す' }
  },
  retty: (name, area) => `https://px.a8.net/svt/ejp?a8mat=4B5YSE%2BARL7LE%2B4EI4%2BBWVTE&a8ejpredirect=${encodeURIComponent('https://retty.me/area/?keyword=' + name + ' ' + area)}`,
}

const TRAVEL_CATEGORY_COLOR = { '食事': '#FF6B35', '観光': '#4CAF50', '体験': '#2196F3', 'チェックイン': '#1565C0' }
const TRAVEL_TRANSPORT_ICON = { '徒歩': '🚶', '電車': '🚃', 'バス': '🚌', '車': '🚗' }

function buildDayCarousel(day, destination) {
  const spotCards = (day.spots ?? []).map(s => ({
    type: 'bubble', size: 'kilo',
    header: {
      type: 'box', layout: 'vertical',
      backgroundColor: TRAVEL_CATEGORY_COLOR[s.category] ?? '#666666', paddingAll: '12px',
      contents: [
        { type: 'text', text: s.time || '--:--', color: '#ffffff', size: 'lg', weight: 'bold' },
        { type: 'text', text: s.name || 'スポット', color: '#ffffff', size: 'sm', wrap: true, margin: 'xs' }
      ]
    },
    body: {
      type: 'box', layout: 'vertical', paddingAll: '12px', spacing: 'sm',
      contents: [
        { type: 'text', text: s.memo || '詳細はウェブで確認', size: 'sm', wrap: true, color: '#555555' },
        { type: 'separator', margin: 'sm' },
        { type: 'box', layout: 'horizontal', margin: 'sm', contents: [
          { type: 'text', text: `⏱ ${s.duration_min ?? '-'}分`, size: 'xs', color: '#888888', flex: 1 },
          { type: 'text', text: `${TRAVEL_TRANSPORT_ICON[s.transport] ?? '🚶'} ${s.transport || '移動'}`, size: 'xs', color: '#888888', align: 'center', flex: 1 },
          { type: 'text', text: `¥${(s.budget ?? 0).toLocaleString()}`, size: 'xs', color: '#888888', align: 'end', flex: 1 }
        ]}
      ]
    },
    footer: {
      type: 'box', layout: 'vertical', paddingAll: '8px', spacing: 'xs',
      contents: [
        { type: 'button', style: 'secondary', height: 'sm', action: { type: 'uri', label: '📍 Googleマップで見る', uri: `https://www.google.com/maps/search/${encodeURIComponent((s.name || 'スポット') + ' ' + destination)}` } },
        { type: 'button', style: 'secondary', height: 'sm', action: { type: 'message', label: '🔄 このスポットを変更', text: `旅行変更:${day.day}:${s.time}` } }
      ]
    }
  }))
  return {
    type: 'flex', altText: `${day.day ?? '?'}日目: ${day.title || '旅行プラン'}`,
    contents: {
      type: 'carousel',
      contents: [
        {
          type: 'bubble', size: 'kilo',
          body: {
            type: 'box', layout: 'vertical', alignItems: 'center', justifyContent: 'center',
            backgroundColor: '#1565C0', paddingAll: '24px',
            contents: [
              { type: 'text', text: `${day.day ?? '?'}日目`, color: '#ffffff', weight: 'bold', size: 'xxl', align: 'center' },
              { type: 'text', text: day.title || '旅行プラン', color: '#ffffff', size: 'sm', align: 'center', margin: 'md', wrap: true },
              { type: 'text', text: '← スワイプして見る', color: '#ffffff', size: 'xs', align: 'center', margin: 'sm' }
            ]
          }
        },
        ...spotCards
      ]
    }
  }
}

function travelPlanToMessages(plan, planUrl = '') {
  const destination = plan.destination ?? ''
  const nights = plan.nights ?? 1

  // 1. サマリーバブル
  const summaryContents = [
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
      { type: 'text', text: plan.accommodation_memo || '宿泊タイプ未指定', size: 'xs', flex: 3, wrap: true }
    ]},
    { type: 'box', layout: 'horizontal', contents: [
      { type: 'text', text: '💰 合計予算', size: 'sm', color: '#888888', flex: 2 },
      { type: 'text', text: `¥${(plan.total_budget ?? 0).toLocaleString()}`, size: 'sm', flex: 3, color: '#1565C0', weight: 'bold' }
    ]},
  ]
  if ((plan.transport_options ?? []).length > 0) {
    summaryContents.push({ type: 'separator', margin: 'md' })
    summaryContents.push({ type: 'text', text: '🚃 おすすめ移動手段', size: 'xs', color: '#888888', margin: 'md' })
    for (const t of plan.transport_options.slice(0, 2)) {
      summaryContents.push({ type: 'box', layout: 'horizontal', margin: 'sm', contents: [
        { type: 'text', text: t.is_flight ? `✈️ ${t.type}` : `🚃 ${t.type}`, size: 'xs', flex: 2, color: '#1565C0', weight: 'bold' },
        { type: 'text', text: t.detail || t.type || '詳細不明', size: 'xs', flex: 4, color: '#555555', wrap: true },
        { type: 'text', text: `¥${(t.est_cost ?? 0).toLocaleString()}`, size: 'xs', flex: 2, align: 'end', color: '#888888' }
      ]})
    }
  }

  const hasFlightOption = (plan.transport_options ?? []).some(t => t.is_flight)
  const footerContents = [
    ...(hasFlightOption ? [{
      type: 'button', style: 'secondary', height: 'sm',
      action: { type: 'uri', label: '✈️ 航空券を検索する', uri: 'https://www.airtrip.jp/' }
    }] : []),
    ...(planUrl ? [{
      type: 'button', style: 'primary', height: 'sm', color: '#1565C0',
      action: { type: 'uri', label: '🌐 宿予約・全プランをウェブで見る', uri: planUrl }
    }] : [])
  ]

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
      body: { type: 'box', layout: 'vertical', spacing: 'sm', contents: summaryContents },
      ...(footerContents.length > 0 ? { footer: {
        type: 'box', layout: 'vertical', paddingAll: '10px', spacing: 'sm',
        contents: footerContents
      }} : {})
    }
  }

  const messages = [summaryMsg]

  // 2. 宿泊施設・移動手段カード
  const accOptions = plan.accommodation_options ?? []
  const transportOptions = plan.transport_options ?? []
  const hasFlightOption = transportOptions.some(t => t.is_flight)

  const infoCardContents = []

  if (accOptions.length > 0) {
    infoCardContents.push({ type: 'text', text: '🏨 おすすめ宿泊施設', weight: 'bold', size: 'sm', color: '#1565C0' })
    for (const a of accOptions.slice(0, 3)) {
      infoCardContents.push({
        type: 'box', layout: 'vertical', margin: 'sm', paddingAll: '10px',
        backgroundColor: '#f0f4ff', cornerRadius: '8px',
        contents: [
          { type: 'box', layout: 'horizontal', contents: [
            { type: 'text', text: a.name || '宿泊施設', size: 'sm', weight: 'bold', flex: 3, wrap: true },
            { type: 'text', text: `¥${(a.est_price_per_night ?? 0).toLocaleString()}/泊〜`, size: 'xs', color: '#1565C0', flex: 2, align: 'end', weight: 'bold' }
          ]},
          { type: 'text', text: a.type || '宿泊', size: 'xs', color: '#888888', margin: 'xs' }
        ]
      })
    }
  }

  if (transportOptions.length > 0) {
    if (infoCardContents.length > 0) infoCardContents.push({ type: 'separator', margin: 'md' })
    infoCardContents.push({ type: 'text', text: '✈️ 移動手段', weight: 'bold', size: 'sm', color: '#1565C0', margin: 'md' })
    for (const t of transportOptions.slice(0, 2)) {
      infoCardContents.push({
        type: 'box', layout: 'horizontal', margin: 'sm',
        contents: [
          { type: 'text', text: t.detail || t.type || '移動', size: 'xs', flex: 4, wrap: true, color: '#333333' },
          { type: 'text', text: `目安¥${(t.est_cost ?? 0).toLocaleString()}`, size: 'xs', flex: 2, align: 'end', color: '#888888' }
        ]
      })
    }
  }

  const infoFooterContents = []
  if (hasFlightOption) {
    infoFooterContents.push({
      type: 'button', style: 'secondary', height: 'sm',
      action: { type: 'uri', label: '✈️ 航空券を検索する', uri: 'https://www.airtrip.jp/' }
    })
  }
  if (planUrl) {
    infoFooterContents.push({
      type: 'button', style: 'primary', color: '#1565C0', height: 'sm',
      action: { type: 'uri', label: '🌐 全日程・宿予約をウェブで見る', uri: planUrl }
    })
  }

  if (infoCardContents.length > 0 || infoFooterContents.length > 0) {
    messages.push({
      type: 'flex', altText: '🏨 宿泊施設・移動手段',
      contents: {
        type: 'bubble',
        header: {
          type: 'box', layout: 'vertical', backgroundColor: '#1565C0', paddingAll: '12px',
          contents: [{ type: 'text', text: '🗓️ 旅の手配', color: '#ffffff', weight: 'bold', size: 'sm' }]
        },
        body: { type: 'box', layout: 'vertical', paddingAll: '14px', spacing: 'sm', contents: infoCardContents },
        ...(infoFooterContents.length > 0 ? { footer: {
          type: 'box', layout: 'vertical', paddingAll: '10px', spacing: 'sm',
          contents: infoFooterContents
        }} : {})
      }
    })
  }

  // 3. フィードバック + ヒント
  messages.push({
    type: 'text',
    text: 'このプランどうだった？🗺️ 正直に教えてね！\n\n💬 「もう一度」→ 別の旅行プランを生成\n💬 「最初から」→ メニューに戻る',
    quickReply: {
      items: [
        { type: 'action', action: { type: 'message', label: '😍 最高！', text: 'FB:5' } },
        { type: 'action', action: { type: 'message', label: '😊 よかった', text: 'FB:4' } },
        { type: 'action', action: { type: 'message', label: '😐 まあまあ', text: 'FB:3' } },
        { type: 'action', action: { type: 'message', label: '😅 微妙だった', text: 'FB:2' } },
        { type: 'action', action: { type: 'message', label: '📅 まだ使ってない', text: 'FB:0' } },
      ]
    }
  })

  return messages
}

async function handleStep(userId, text, callGemini, PROMPT_TEMPLATE, THEME_LABELS, WEATHER_LABELS, savePlan, frontendUrl, locationData = null) {
  const session = getSession(userId)
  const { step, data } = session

  if (text === '空き時間' || text === '空き時間プラン') {
    sessions.set(userId, { step: 'gap_location', data: { mode: 'gap' } })
    return [{
      type: 'text',
      text: '⏱️ 空き時間プランを作りましょう！\n\n📍 今どこにいますか？\n位置情報ボタンを使うか、場所名を入力してください✏️',
      quickReply: {
        items: [
          { type: 'action', action: { type: 'location', label: '📍 現在地を送る' } },
          { type: 'action', action: { type: 'message', label: '渋谷・恵比寿', text: '渋谷・恵比寿' } },
          { type: 'action', action: { type: 'message', label: '新宿・代々木', text: '新宿・代々木' } },
          { type: 'action', action: { type: 'message', label: '表参道・原宿', text: '表参道・原宿' } },
          { type: 'action', action: { type: 'message', label: '銀座・有楽町', text: '銀座・有楽町' } },
          { type: 'action', action: { type: 'message', label: '梅田・北新地', text: '梅田・北新地' } },
          { type: 'action', action: { type: 'message', label: 'なんば・心斎橋', text: 'なんば・心斎橋' } },
          { type: 'action', action: { type: 'message', label: '横浜みなとみらい', text: '横浜・みなとみらい' } },
        ]
      }
    }]
  }

  if (text === '旅行' || text === '旅行プランを作りたい' || text === '旅行プラン') {
    sessions.set(userId, { step: 'travel_dest', data: { mode: 'travel' } })
    return [{ type: 'text', text: '✈️ 旅行プランを作りましょう！\n\n📍 どこに行きたいですか？\n例：京都、沖縄、北海道・函館、台湾' }]
  }

  if (text === 'デートプラン' || text === 'デートプランを作る') {
    sessions.set(userId, { step: 'wishes', data: {} })
    return [{
      type: 'text',
      text: `💑 デートプランを作りましょう！\n\n💬 やりたいことを教えてください。\n例：水族館に行きたい、夜景が見たい`,
      quickReply: qr(['スキップ'])
    }]
  }

  if (text === '最初から') {
    sessions.set(userId, { step: 'menu', data: {} })
    return makeMenuCarousel()
  }

  const travelChangeMatch = text.match(/^旅行変更:(\d+):(.+)$/)
  if (travelChangeMatch && data.travelPlan) {
    const dayNum = parseInt(travelChangeMatch[1])
    const targetTime = travelChangeMatch[2]
    const targetDay = data.travelPlan.days?.find(d => d.day === dayNum)
    const targetSpot = targetDay?.spots?.find(s => s.time === targetTime)
    if (targetSpot) {
      session.data.travelChangeTarget = { day: dayNum, time: targetTime }
      session.step = 'travel_spot_change'
      return [{ type: 'text', text: `🔄 ${dayNum}日目 ${targetTime}「${targetSpot.name}」を変更します。\nどんなスポットにしますか？`, quickReply: qr(['自動で提案して', 'スキップ']) }]
    }
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

  if (text === 'もう一度' && (step === 'done' || step === 'travel_done' || step === 'feedback_rating' || step === 'feedback_comment')) {
    const isTravel = step === 'travel_done' || session.data.prevDoneStep === 'travel_done'
    return {
      messages: [{ type: 'text', text: isTravel ? '✈️ 別の旅行プランを考え中...' : '💕 別のプランを考え中...\nしばらくお待ちください！' }],
      asyncTask: async () => {
        try {
          if (isTravel) {
            const plan = await generateTravelPlan(data, callGemini)
            const planId = await savePlan?.(plan, 'travel', data)
            const cleanUrl = (frontendUrl || '').trim()
            const planUrl = planId && cleanUrl.startsWith('https://') ? `${cleanUrl}/plan/${planId}` : null
            data.travelPlan = plan
            data.travelPlanUrl = planUrl
            return travelPlanToMessages(plan, planUrl)
          }
          const plan = await generatePlan(data, callGemini, PROMPT_TEMPLATE, THEME_LABELS, WEATHER_LABELS)
          data.plan = plan
          const planId = await savePlan?.(plan, 'date', data)
          const planUrl = planId && frontendUrl ? `${frontendUrl}/plan/${planId}` : null
          return planToMessages(plan, planUrl)
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

    case 'gap_location': {
      if (locationData) {
        session.data.area = locationData.title || locationData.address || '現在地'
        session.data.lat = locationData.lat
        session.data.lng = locationData.lng
      } else {
        session.data.area = text
      }
      session.step = 'gap_time'
      return [{ type: 'text', text: '⏱️ 何時間ありますか？', quickReply: qr(['30分'], ['1時間'], ['2時間'], ['3時間以上', '3時間']) }]
    }

    case 'gap_time': {
      const now = new Date(new Date().toLocaleString('en', { timeZone: 'Asia/Tokyo' }))
      const hrs = text === '30分' ? 0.5 : text === '1時間' ? 1 : text === '2時間' ? 2 : 3
      const end = new Date(now.getTime() + hrs * 60 * 60 * 1000)
      session.data.startTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
      session.data.endTime = `${String(end.getHours()).padStart(2, '0')}:${String(end.getMinutes()).padStart(2, '0')}`
      session.data.budget = 3000
      session.data.theme = null
      session.data.wishes = `${text}で効率よく楽しめるコンパクトなプランで`
      session.step = 'generating'
      return {
        messages: [{ type: 'text', text: `⏱️ ${text}で楽しめるプランを考え中...\nしばらくお待ちください！` }],
        asyncTask: async () => {
          try {
            const plan = await generatePlan(session.data, callGemini, PROMPT_TEMPLATE, THEME_LABELS, WEATHER_LABELS)
            session.step = 'feedback_rating'
            session.data.prevDoneStep = 'done'
            session.data.plan = plan
            const planId = await savePlan?.(plan, 'date', session.data)
            const planUrl = planId && frontendUrl ? `${frontendUrl}/plan/${planId}` : null
            return planToMessages(plan, planUrl)
          } catch {
            session.step = 'gap_time'
            return [{ type: 'text', text: 'プラン生成に失敗しました。もう一度時間を送ってください。' }]
          }
        }
      }
    }

    case 'wishes': {
      session.data.wishes = text === 'スキップ' ? '' : text
      session.step = 'prefecture'
      return [{ type: 'text', text: '📍 どの都道府県でデートしますか？\n一覧にない場所は直接入力もできます✏️', quickReply: qr(
        ['東京'], ['神奈川'], ['大阪'], ['京都'],
        ['愛知'], ['福岡'], ['北海道'], ['沖縄'], ['おまかせ']
      ) }]
    }

    case 'prefecture': {
      if (text === 'おまかせ') {
        session.data.area = ''
        session.step = 'date'
        return [{ type: 'text', text: `📅 デートはいつですか？`, quickReply: qr(['今日'], ['明日'], ['今週土曜', nextWeekday(6)], ['今週日曜', nextWeekday(0)]) }]
      }
      session.data.prefecture = text
      session.step = 'station'
      const stations = PREFECTURE_STATIONS[text] ?? []
      const stationOptions = [...stations.map(s => [s]), ['スキップ']]
      return [{ type: 'text', text: `🚉 ${text}のどのエリア・駅周辺ですか？\n一覧にない駅名・エリアも直接入力できます✏️`, quickReply: qr(...stationOptions) }]
    }

    case 'station': {
      const station = text === 'スキップ' ? '' : text
      session.data.area = station ? `${session.data.prefecture}・${station}` : session.data.prefecture
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
            session.step = 'feedback_rating'
            session.data.prevDoneStep = 'done'
            session.data.plan = plan
            const planId = await savePlan?.(plan, 'date', session.data)
            const planUrl = planId && frontendUrl ? `${frontendUrl}/plan/${planId}` : null
            return planToMessages(plan, planUrl)
          } catch {
            session.step = 'budget'
            return [{ type: 'text', text: 'プラン生成に失敗しました。もう一度予算を送ってください。' }]
          }
        }
      }
    }

    case 'travel_dest': {
      session.data.destination = text
      session.step = 'travel_departure'
      return [{ type: 'text', text: '🏠 出発地はどこですか？\n（交通手段・航空券の提案に使います）', quickReply: qr(['東京・関東', '東京'], ['大阪・関西', '大阪'], ['名古屋・中部', '名古屋'], ['福岡・九州', '福岡']) }]
    }

    case 'travel_departure': {
      session.data.departure = text === 'スキップ' ? '' : text
      session.step = 'travel_nights'
      return [{ type: 'text', text: '🌙 何泊の旅行ですか？', quickReply: qr(['1泊2日', '1泊'], ['2泊3日', '2泊'], ['3泊4日', '3泊']) }]
    }

    case 'travel_nights': {
      let nights = 1
      if (text === '2' || text.includes('2泊')) nights = 2
      else if (text === '3' || text.includes('3泊')) nights = 3
      session.data.nights = nights
      session.step = 'travel_dates'
      return [{ type: 'text', text: '📅 いつ頃行きますか？', quickReply: qr(['今月中', '今月'], ['来月', '来月'], ['夏休み', '夏'], ['年末年始', '年末'], ['スキップ']) }]
    }

    case 'travel_dates': {
      session.data.travelDates = text === 'スキップ' ? '' : text
      session.step = 'travel_who'
      return [{ type: 'text', text: '👫 誰と行きますか？', quickReply: qr(['💑 カップル', 'カップル'], ['👫 友達', '友達'], ['👨‍👩‍👧 家族', '家族']) }]
    }

    case 'travel_who': {
      session.data.travelWho = text
      session.step = 'travel_theme'
      return [{ type: 'text', text: '🎯 旅行のテーマは？', quickReply: qr(['🏛️ 観光メイン', '観光'], ['🍽️ グルメ', 'グルメ'], ['♨️ 温泉のんびり', '温泉'], ['🏃 アクティブ', 'アクティブ'], ['💑 記念日', '記念日'], ['🎲 おまかせ', 'おまかせ']) }]
    }

    case 'travel_theme': {
      session.data.travelTheme = text
      session.step = 'travel_style'
      return [{ type: 'text', text: '🏨 宿のタイプは？', quickReply: qr(['♨️ 温泉旅館', '温泉'], ['🏙️ シティホテル', 'シティ'], ['🏖️ リゾート', 'リゾート'], ['🎲 おまかせ', 'おまかせ']) }]
    }

    case 'travel_style': {
      const styleMap = { '温泉': '温泉旅館', 'シティ': 'シティホテル', 'リゾート': 'リゾートホテル', 'おまかせ': 'おまかせ' }
      session.data.travelStyle = styleMap[text] ?? text
      session.step = 'travel_transport'
      return [{ type: 'text', text: '🚗 移動手段は？', quickReply: qr(['🚗 レンタカー・車', '車'], ['🚃 公共交通機関', '公共交通機関']) }]
    }

    case 'travel_transport': {
      session.data.travelTransport = text.includes('車') ? '車' : '公共交通機関'
      session.step = 'travel_wishes'
      return [{ type: 'text', text: '💬 やりたいこと・行きたい場所はありますか？\n例：絶景を見たい、海鮮を食べたい\n（なければスキップでOK）', quickReply: qr(['スキップ']) }]
    }

    case 'travel_wishes': {
      session.data.travelWishes = text === 'スキップ' ? '' : text
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
            session.step = 'feedback_rating'
            session.data.prevDoneStep = 'travel_done'
            const planId = await savePlan?.(plan, 'travel', session.data)
            const cleanUrl = (frontendUrl || '').trim()
            const planUrl = planId && cleanUrl.startsWith('https://') ? `${cleanUrl}/plan/${planId}` : null
            session.data.travelPlan = plan
            session.data.travelPlanUrl = planUrl
            return travelPlanToMessages(plan, planUrl)
          } catch (err) {
            console.error('Travel plan error:', err?.message ?? err)
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

    case 'travel_spot_change': {
      const { travelPlan, travelChangeTarget } = session.data
      const { day: dayNum, time: targetTime } = travelChangeTarget || {}
      const userRequest = text === 'スキップ' ? '' : text
      const targetDay = travelPlan?.days?.find(d => d.day === dayNum)
      const currentSpot = targetDay?.spots?.find(s => s.time === targetTime)
      session.step = 'travel_done'
      return {
        messages: [{ type: 'text', text: '🔄 変更中...' }],
        asyncTask: async () => {
          try {
            const allSpots = (travelPlan.days ?? []).flatMap(d =>
              (d.spots ?? []).map(s => `${d.day}日目 ${s.time} ${s.name}（${s.category}）`)
            ).join('\n')
            const prompt = `以下の旅行プランで${dayNum}日目 ${targetTime}「${currentSpot?.name ?? ''}」を別のスポットに変えてください。
目的地: ${travelPlan.destination}
現在のプラン:\n${allSpots}
${userRequest ? `変更希望: ${userRequest}` : '自動で最適なスポットを提案してください。'}

以下のJSON形式のみで1件返してください：
{"time":"${targetTime}","name":"場所名","category":"観光","duration_min":60,"transport":"電車","memo":"ひとことメモ","budget":1000}`
            const raw = await callGemini(prompt)
            const m = raw.match(/\{[\s\S]*\}/)
            if (!m) throw new Error('parse error')
            const newSpot = JSON.parse(m[0])
            if (targetDay) {
              const idx = targetDay.spots.findIndex(s => s.time === targetTime)
              if (idx !== -1) targetDay.spots[idx] = newSpot
            }
            return [
              { type: 'text', text: `✅ ${dayNum}日目「${newSpot.name}」に変更しました！` },
              buildDayCarousel(targetDay, travelPlan.destination)
            ]
          } catch {
            return [{ type: 'text', text: 'スポットの変更に失敗しました。もう一度お試しください。' }]
          }
        }
      }
    }

    case 'feedback_rating': {
      const ratingMap = { 'FB:5': 5, 'FB:4': 4, 'FB:3': 3, 'FB:2': 2, 'FB:0': 0 }
      const rating = ratingMap[text]
      if (rating === undefined) {
        return [{ type: 'text', text: 'このプランどうだった？🗺️ 正直に教えてね！', quickReply: {
          items: [
            { type: 'action', action: { type: 'message', label: '😍 最高！', text: 'FB:5' } },
            { type: 'action', action: { type: 'message', label: '😊 よかった', text: 'FB:4' } },
            { type: 'action', action: { type: 'message', label: '😐 まあまあ', text: 'FB:3' } },
            { type: 'action', action: { type: 'message', label: '😅 微妙だった', text: 'FB:2' } },
            { type: 'action', action: { type: 'message', label: '📅 まだ使ってない', text: 'FB:0' } },
          ]
        } }]
      }
      session.data.feedbackRating = rating
      session.step = 'feedback_comment'
      console.log(`📊 FEEDBACK rating=${rating} userId=${userId} area=${session.data.area ?? session.data.destination ?? '?'}`)
      if (rating === 0) {
        session.step = session.data.prevDoneStep ?? 'done'
        return [{ type: 'text', text: 'またぜひ使ってみてね🗺️ 「最初から」でメニューに戻れます！', quickReply: qr(['最初から']) }]
      }
      return [{
        type: 'text',
        text: 'ありがとう！💕 よかったら一言だけ聞かせてね 👂（スキップでもOK）',
        quickReply: qr(['スキップ'])
      }]
    }

    case 'feedback_comment': {
      const comment = text === 'スキップ' ? '' : text
      if (comment) {
        console.log(`📊 FEEDBACK comment="${comment}" userId=${userId} rating=${session.data.feedbackRating}`)
      }
      session.step = session.data.prevDoneStep ?? 'done'
      return [{ type: 'text', text: '送ってくれてありがとう！✨ またいつでも使ってね🗺️', quickReply: qr(['もう一度'], ['最初から']) }]
    }

    default: {
      if (session.step === 'generating') {
        session.step = 'budget'
        return [{ type: 'text', text: '💰 予算はおふたりの合計で？', quickReply: qr(['5,000円', '5000'], ['10,000円', '10000'], ['20,000円', '20000'], ['30,000円', '30000']) }]
      }
      if (session.step === 'travel_generating') {
        session.step = 'travel_budget'
        return [{ type: 'text', text: '💰 予算はおふたりの合計で？\n（宿泊・食事・観光すべて込み）', quickReply: qr(['30,000円', '30000'], ['50,000円', '50000'], ['80,000円', '80000'], ['100,000円', '100000']) }]
      }
      sessions.set(userId, { step: 'menu', data: {} })
      return makeMenuCarousel()
    }
  }
}


export function createLineRouter(callGemini, PROMPT_TEMPLATE, THEME_LABELS, WEATHER_LABELS, savePlan, frontendUrl) {
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
    handleStep: (userId, text, locationData = null) => handleStep(userId, text, callGemini, PROMPT_TEMPLATE, THEME_LABELS, WEATHER_LABELS, savePlan, frontendUrl, locationData)
  }
}
