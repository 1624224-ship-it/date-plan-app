import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'

const API_BASE = import.meta.env.VITE_API_URL || ''

const JALAN = (dest, style = '', theme = '', memo = '') => {
  const base = 'https://px.a8.net/svt/ejp?a8mat='
  const r = encodeURIComponent('https://www.jalan.net/onsen/?keyword=' + dest)
  if (dest.includes('ディズニー') || dest.includes('TDR') || dest.includes('舞浜'))
    return { url: `${base}4B5Y0E%2B6MQUCY%2B14CS%2B63OYA`, label: '🎡 TDRホテルを予約する' }
  if (dest.includes('ペット') || dest.includes('犬'))
    return { url: `${base}4B5Y0E%2B6MQUCY%2B14CS%2B63H8I`, label: '🐕 ペットOKの宿を探す' }
  if (style.includes('卒業') || theme.includes('卒業') || dest.includes('卒業'))
    return { url: `${base}4B5Y0E%2B6MQUCY%2B14CS%2B691UQ`, label: '🎓 卒業旅行プランを見る' }
  if (style.includes('温泉') || theme.includes('温泉') || memo.includes('温泉'))
    return { url: `${base}4B5Y0E%2B6MQUCY%2B14CS%2B63WO2&a8ejpredirect=${r}`, label: '♨️ じゃらんで温泉宿を探す' }
  return { url: `${base}4B5Y0E%2B6MQUCY%2B14CS%2B67JUA&a8ejpredirect=${r}`, label: '🏨 じゃらんで宿を探す' }
}

const RETTY = (name, area) =>
  `https://px.a8.net/svt/ejp?a8mat=4B5YSE%2BARL7LE%2B4EI4%2BBWVTE&a8ejpredirect=${encodeURIComponent('https://retty.me/area/?keyword=' + name + ' ' + area)}`

const CATEGORY_COLOR = { 食事: 'bg-orange-100 text-orange-600', 観光: 'bg-emerald-100 text-emerald-600', 体験: 'bg-violet-100 text-violet-600', 移動: 'bg-gray-100 text-gray-500', チェックイン: 'bg-blue-100 text-blue-600' }
const TRANSPORT_ICON = { 徒歩: '🚶', 電車: '🚃', バス: '🚌', 車: '🚗' }

function SpotCard({ spot, area }) {
  const mapsUrl = `https://www.google.com/maps/search/${encodeURIComponent(spot.name + ' ' + (area ?? ''))}`
  return (
    <div className="bg-white rounded-2xl border border-pink-100 p-4 shadow-sm">
      <div className="flex items-start justify-between gap-2 mb-2">
        <div>
          <span className="text-xs font-semibold text-rose-400">{spot.time}</span>
          <h4 className="font-bold text-gray-800 text-sm mt-0.5">{spot.name}</h4>
        </div>
        <span className={`text-xs px-2 py-1 rounded-full font-medium flex-shrink-0 ${CATEGORY_COLOR[spot.category] ?? 'bg-gray-100 text-gray-500'}`}>
          {spot.category}
        </span>
      </div>
      <p className="text-xs text-gray-600 mb-3">{spot.memo}</p>
      <div className="flex items-center gap-3 text-xs text-gray-500 border-t border-pink-100 pt-2">
        <span>⏱ {spot.duration_min}分</span>
        <span>{TRANSPORT_ICON[spot.transport] ?? '🚶'} {spot.transport}</span>
        <span className="ml-auto font-semibold text-rose-500">¥{(spot.budget ?? 0).toLocaleString()}</span>
      </div>
      {spot.parking_fee > 0 && <p className="text-xs text-gray-400 mt-1">🅿️ 駐車場 ¥{spot.parking_fee.toLocaleString()}</p>}
      <a href={mapsUrl} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-1 text-xs text-blue-500 hover:text-blue-700">
        🗺️ Googleマップで見る
      </a>
    </div>
  )
}

function RestaurantCard({ r, area, label }) {
  const mapsUrl = `https://www.google.com/maps/search/${encodeURIComponent(r.name + ' ' + (area ?? ''))}`
  const rettyUrl = RETTY(r.name, area ?? '')
  return (
    <div className="bg-white rounded-2xl border border-pink-100 p-4 shadow-sm">
      <h4 className="font-bold text-gray-800 text-sm">{r.name}</h4>
      <p className="text-xs text-gray-500 mt-0.5">{r.genre}</p>
      <p className="text-sm font-bold text-rose-500 mt-1">¥{(r.price_per_person ?? 0).toLocaleString()}/人</p>
      <p className="text-xs text-gray-600 mt-1 mb-3">{r.memo}</p>
      <div className="flex gap-2 flex-wrap">
        <a href={mapsUrl} target="_blank" rel="noreferrer"
          className="text-xs bg-pink-50 border border-pink-200 rounded-full px-3 py-1.5 text-rose-500 font-medium hover:bg-pink-100 transition">
          📍 Googleマップ
        </a>
        <a href={rettyUrl} target="_blank" rel="noreferrer"
          className="text-xs bg-rose-500 text-white rounded-full px-3 py-1.5 font-medium hover:bg-rose-600 transition">
          🍽️ Rettyで予約する
        </a>
      </div>
      <p className="text-xs text-gray-400 mt-2">※AIによる参考提案です</p>
    </div>
  )
}

function DatePlanView({ plan, sessionData }) {
  const area = plan.area ?? sessionData?.area ?? ''
  return (
    <div className="space-y-4">
      <div className="bg-gradient-to-r from-rose-400 to-pink-400 rounded-3xl p-5 text-white shadow-lg">
        <p className="text-rose-100 text-xs mb-1">💑 デートプラン</p>
        <h2 className="text-xl font-bold">{plan.title}</h2>
        <p className="text-rose-100 text-sm mt-1">📍 {area} · ¥{(plan.total_budget ?? 0).toLocaleString()}</p>
      </div>

      <div className="bg-white/80 rounded-3xl shadow-md border border-pink-100 p-5">
        <h3 className="font-bold text-gray-700 mb-4 text-sm">🗺️ タイムライン</h3>
        <div className="space-y-3">
          {plan.spots?.map((s, i) => <SpotCard key={i} spot={s} area={area} />)}
        </div>
      </div>

      {plan.lunch_options?.length > 0 && (
        <div className="bg-white/80 rounded-3xl shadow-md border border-pink-100 p-5">
          <h3 className="font-bold text-gray-700 mb-4 text-sm">🍽️ ランチおすすめ</h3>
          <div className="space-y-3">
            {plan.lunch_options.map((r, i) => <RestaurantCard key={i} r={r} area={area} />)}
          </div>
        </div>
      )}

      {plan.dinner_options?.length > 0 && (
        <div className="bg-white/80 rounded-3xl shadow-md border border-pink-100 p-5">
          <h3 className="font-bold text-gray-700 mb-4 text-sm">🌙 ディナーおすすめ</h3>
          <div className="space-y-3">
            {plan.dinner_options.map((r, i) => <RestaurantCard key={i} r={r} area={area} />)}
          </div>
        </div>
      )}
    </div>
  )
}

const LOCAL_SPOT_COLOR = {
  '飲食店': 'bg-red-100 text-red-600',
  'カフェ': 'bg-purple-100 text-purple-600',
  '雑貨': 'bg-orange-100 text-orange-600',
  '観光施設': 'bg-blue-100 text-blue-600',
  '体験': 'bg-teal-100 text-teal-600',
}

function LocalSpotCard({ spot, dest }) {
  const mapsUrl = `https://www.google.com/maps/search/${encodeURIComponent(spot.name + ' ' + dest)}`
  return (
    <div className="bg-blue-50 rounded-2xl border border-blue-100 p-4">
      <div className="flex items-start justify-between gap-2 mb-1">
        <h4 className="font-bold text-gray-800 text-sm">{spot.name}</h4>
        <span className={`text-xs px-2 py-1 rounded-full font-medium flex-shrink-0 ${LOCAL_SPOT_COLOR[spot.category] ?? 'bg-gray-100 text-gray-500'}`}>
          {spot.category}
        </span>
      </div>
      <p className="text-xs text-gray-600 mb-1">{spot.memo}</p>
      {spot.price_range && <p className="text-xs text-gray-400 mb-2">目安：{spot.price_range}</p>}
      <a href={mapsUrl} target="_blank" rel="noreferrer" className="text-xs text-blue-500 hover:text-blue-700">
        🗺️ Googleマップで見る
      </a>
    </div>
  )
}

function TravelPlanView({ plan, sessionData }) {
  const dest = plan.destination ?? ''
  const nights = plan.nights ?? 1
  const jalan = JALAN(dest, sessionData?.travelStyle ?? '', sessionData?.travelTheme ?? '', plan.accommodation_memo ?? '')
  const transportOptions = plan.transport_options ?? []
  const accommodationOptions = plan.accommodation_options ?? []

  return (
    <div className="space-y-4">
      <div className="bg-gradient-to-r from-blue-700 to-blue-500 rounded-3xl p-5 text-white shadow-lg">
        <p className="text-blue-100 text-xs mb-1">✈️ 旅行プラン</p>
        <h2 className="text-xl font-bold">{plan.title}</h2>
        <p className="text-blue-100 text-sm mt-1">📍 {dest} · {nights}泊{nights + 1}日 · ¥{(plan.total_budget ?? 0).toLocaleString()}</p>
        {plan.accommodation_memo && <p className="text-blue-100 text-xs mt-1">🏨 {plan.accommodation_memo}</p>}
        {sessionData?.departure && <p className="text-blue-100 text-xs mt-1">🏠 出発地：{sessionData.departure}</p>}
      </div>

      {transportOptions.length > 0 && (
        <div className="bg-white/80 rounded-3xl shadow-md border border-blue-100 p-5">
          <h3 className="font-bold text-blue-700 mb-3 text-sm">🚃 交通手段</h3>
          <div className="space-y-2">
            {transportOptions.map((t, i) => (
              <div key={i} className="flex items-center justify-between bg-blue-50 rounded-2xl p-3">
                <div className="flex items-center gap-2">
                  <span className="text-lg">{t.is_flight ? '✈️' : t.type.includes('レンタカー') ? '🚗' : '🚃'}</span>
                  <div>
                    <p className="font-bold text-gray-800 text-sm">{t.type}</p>
                    <p className="text-xs text-gray-500">{t.detail}</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="font-bold text-blue-600 text-sm">¥{(t.est_cost ?? 0).toLocaleString()}</p>
                  <p className="text-xs text-gray-400">目安/人</p>
                </div>
              </div>
            ))}
          </div>
          {transportOptions.some(t => t.is_flight) && (
            <a href="https://px.a8.net/svt/ejp?a8mat=4B5YSH+7FBNEA+AD2+2N9S82"
              target="_blank" rel="noreferrer"
              className="mt-3 flex items-center justify-center gap-2 w-full py-3 bg-indigo-900 hover:bg-indigo-800 text-white font-bold rounded-2xl shadow-md transition text-sm">
              ✈️ 航空券を比較する（エアトリ）
            </a>
          )}
        </div>
      )}

      {accommodationOptions.length > 0 && (
        <div className="bg-white/80 rounded-3xl shadow-md border border-blue-100 p-5">
          <h3 className="font-bold text-blue-700 mb-3 text-sm">🏨 おすすめ宿泊施設</h3>
          <div className="space-y-3">
            {accommodationOptions.map((acc, i) => (
              <div key={i} className="bg-blue-50 rounded-2xl border border-blue-100 p-4">
                <div className="flex items-start justify-between mb-1">
                  <div>
                    <p className="font-bold text-gray-800 text-sm">{acc.name}</p>
                    <p className="text-xs text-gray-500">{acc.type}</p>
                  </div>
                  <p className="font-bold text-blue-600 text-sm">¥{(acc.est_price_per_night ?? 0).toLocaleString()}/泊</p>
                </div>
                <p className="text-xs text-gray-600 mb-3">{acc.memo}</p>
                <a href={jalan.url} target="_blank" rel="noreferrer"
                  className="inline-flex items-center gap-1 text-xs bg-blue-600 text-white px-3 py-1.5 rounded-full font-medium hover:bg-blue-700 transition">
                  🏨 じゃらんで予約する
                </a>
              </div>
            ))}
          </div>
        </div>
      )}

      {accommodationOptions.length === 0 && (
        <a href={jalan.url} target="_blank" rel="noreferrer"
          className="flex items-center justify-center gap-2 w-full py-4 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-2xl shadow-lg transition text-base">
          {jalan.label}
        </a>
      )}

      {plan.days?.map((day) => (
        <div key={day.day} className="bg-white/80 rounded-3xl shadow-md border border-blue-100 p-5">
          <h3 className="font-bold text-blue-700 mb-4 text-sm">📅 {day.day}日目：{day.title}</h3>
          <div className="space-y-3">
            {day.spots?.map((s, i) => (
              <div key={i} className="bg-blue-50 rounded-2xl border border-blue-100 p-4">
                <div className="flex items-start justify-between gap-2 mb-1">
                  <div>
                    <span className="text-xs font-semibold text-blue-500">{s.time}</span>
                    <h4 className="font-bold text-gray-800 text-sm mt-0.5">{s.name}</h4>
                  </div>
                  <span className={`text-xs px-2 py-1 rounded-full font-medium flex-shrink-0 ${CATEGORY_COLOR[s.category] ?? 'bg-gray-100 text-gray-500'}`}>
                    {s.category}
                  </span>
                </div>
                <p className="text-xs text-gray-600 mb-2">{s.memo}</p>
                <a href={`https://www.google.com/maps/search/${encodeURIComponent(s.name + ' ' + dest)}`}
                  target="_blank" rel="noreferrer" className="text-xs text-blue-500 hover:text-blue-700">
                  🗺️ Googleマップで見る
                </a>
              </div>
            ))}
          </div>
        </div>
      ))}

      {plan.local_spots?.length > 0 && (
        <div className="bg-white/80 rounded-3xl shadow-md border border-blue-100 p-5">
          <h3 className="font-bold text-blue-700 mb-3 text-sm">🛍️ 現地おすすめスポット</h3>
          <div className="space-y-3">
            {plan.local_spots.map((s, i) => <LocalSpotCard key={i} spot={s} dest={dest} />)}
          </div>
        </div>
      )}
    </div>
  )
}

export default function PlanSharePage() {
  const { id } = useParams()
  const [entry, setEntry] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    fetch(`${API_BASE}/api/plan/${id}`)
      .then(r => r.ok ? r.json() : r.json().then(e => Promise.reject(e.error)))
      .then(setEntry)
      .catch(e => setError(e || 'プランが見つかりませんでした'))
  }, [id])

  if (error) return (
    <div className="min-h-screen bg-gradient-to-br from-pink-50 to-pink-100 flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl p-8 text-center shadow-md max-w-sm w-full">
        <p className="text-4xl mb-4">😢</p>
        <p className="font-bold text-gray-700 mb-2">プランが見つかりません</p>
        <p className="text-sm text-gray-500">{error}</p>
        <p className="text-xs text-gray-400 mt-3">プランの有効期限は7日間です</p>
      </div>
    </div>
  )

  if (!entry) return (
    <div className="min-h-screen bg-gradient-to-br from-pink-50 to-pink-100 flex items-center justify-center">
      <div className="text-rose-400 text-4xl animate-pulse">💕</div>
    </div>
  )

  const { plan, type, sessionData } = entry

  return (
    <div className="min-h-screen bg-gradient-to-br from-pink-50 via-rose-50 to-pink-100">
      <header className="sticky top-0 z-10 bg-white/80 backdrop-blur-sm border-b border-pink-200 shadow-sm">
        <div className="max-w-xl mx-auto px-4 py-4 flex items-center gap-3">
          <span className="text-2xl">{type === 'travel' ? '✈️' : '💑'}</span>
          <h1 className="text-lg font-bold text-rose-500">
            {type === 'travel' ? '旅行プラン' : 'デートプラン'}
          </h1>
          <button
            onClick={() => navigator.share?.({ title: plan.title, url: window.location.href })
              ?? navigator.clipboard.writeText(window.location.href).then(() => alert('URLをコピーしました！'))}
            className="ml-auto text-xs bg-pink-100 text-rose-500 px-3 py-1.5 rounded-full font-medium hover:bg-pink-200 transition"
          >
            🔗 シェア
          </button>
        </div>
      </header>

      <main className="max-w-xl mx-auto px-4 py-6">
        {type === 'travel'
          ? <TravelPlanView plan={plan} sessionData={sessionData} />
          : <DatePlanView plan={plan} sessionData={sessionData} />
        }

        <div className="mt-6 text-center">
          <p className="text-xs text-gray-400">このプランはLINE botで生成されました</p>
          <p className="text-xs text-gray-300 mt-1">有効期限：7日間</p>
        </div>
      </main>
    </div>
  )
}
