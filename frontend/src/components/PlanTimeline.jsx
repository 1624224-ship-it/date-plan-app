const CATEGORY_STYLE = {
  食事: 'bg-orange-100 text-orange-600',
  観光: 'bg-emerald-100 text-emerald-600',
  体験: 'bg-violet-100 text-violet-600',
  移動: 'bg-gray-100 text-gray-500',
}

const TRANSPORT_ICON = { 徒歩: '🚶', 電車: '🚃', バス: '🚌', 車: '🚗' }

function StarScore({ score, color }) {
  if (!score) return <span className="text-gray-300 text-xs">—</span>
  return (
    <span className={`font-bold text-sm ${color}`}>
      {score.toFixed(1)}
    </span>
  )
}

function LunchTable({ options, area }) {
  if (!options || options.length === 0) return null

  const mapsUrl = (name) =>
    `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(name + ' ' + (area ?? ''))}`
  const tabelogUrl = (name) =>
    `https://tabelog.com/rstLst/?vs=1&sk=${encodeURIComponent(name)}&sa=${encodeURIComponent(area ?? '')}`
  const hotpepperUrl = (name) =>
    `https://www.hotpepper.jp/strJ/search/?keyword=${encodeURIComponent(name + ' ' + (area ?? ''))}`

  return (
    <div className="bg-white/80 backdrop-blur-sm rounded-3xl shadow-md border border-pink-100 p-5 mt-4">
      <h3 className="font-bold text-gray-700 mb-4 text-sm flex items-center gap-2">
        🍽️ ランチおすすめ比較（5選）
      </h3>

      <div className="space-y-3">
        {options.map((r, i) => (
          <div key={i} className="bg-pink-50 rounded-2xl p-4 border border-pink-100">
            {/* 店名・ジャンル */}
            <div className="flex items-start justify-between mb-2">
              <div>
                <span className="text-xs text-rose-400 font-bold">#{i + 1}</span>
                <h4 className="font-bold text-gray-800 text-sm">{r.name}</h4>
                <span className="text-xs text-gray-500">{r.genre} · ¥{(r.price_per_person ?? 0).toLocaleString()}/人</span>
              </div>
              {r.hotpepper && (
                <span className="text-xs bg-red-100 text-red-500 font-medium px-2 py-0.5 rounded-full">HP掲載</span>
              )}
            </div>

            {/* 評価バー */}
            <div className="grid grid-cols-3 gap-2 mb-3">
              <div className="bg-white rounded-xl p-2 text-center border border-pink-100">
                <p className="text-xs text-gray-400 mb-1">食べログ</p>
                <StarScore score={r.tabelog} color="text-yellow-500" />
              </div>
              <div className="bg-white rounded-xl p-2 text-center border border-pink-100">
                <p className="text-xs text-gray-400 mb-1">Google</p>
                <StarScore score={r.google} color="text-blue-500" />
              </div>
              <div className="bg-white rounded-xl p-2 text-center border border-pink-100">
                <p className="text-xs text-gray-400 mb-1">HP</p>
                <span className="text-sm">{r.hotpepper ? '✅' : '—'}</span>
              </div>
            </div>

            <p className="text-xs text-gray-600 mb-3">{r.memo}</p>

            {/* リンク */}
            <div className="flex gap-2 flex-wrap">
              <a
                href={mapsUrl(r.name)}
                target="_blank"
                rel="noreferrer"
                className="text-xs bg-white border border-gray-200 rounded-full px-3 py-1.5 text-gray-600 hover:bg-gray-50 transition flex items-center gap-1"
              >
                🗺️ Google Maps
              </a>
              <a
                href={tabelogUrl(r.name)}
                target="_blank"
                rel="noreferrer"
                className="text-xs bg-white border border-gray-200 rounded-full px-3 py-1.5 text-gray-600 hover:bg-gray-50 transition flex items-center gap-1"
              >
                🍴 食べログ
              </a>
              {r.hotpepper && (
                <a
                  href={hotpepperUrl(r.name)}
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs bg-white border border-gray-200 rounded-full px-3 py-1.5 text-gray-600 hover:bg-gray-50 transition flex items-center gap-1"
                >
                  🔴 ホットペッパー
                </a>
              )}
            </div>
          </div>
        ))}
      </div>

      <p className="text-xs text-gray-400 mt-3 text-center">
        ※ 評価はAIによる推定です。実際の評価はリンク先でご確認ください。
      </p>
    </div>
  )
}

function SpotCard({ spot, index, isLast, area }) {
  const categoryStyle = CATEGORY_STYLE[spot.category] ?? 'bg-gray-100 text-gray-500'
  const transportIcon = TRANSPORT_ICON[spot.transport] ?? '🚶'
  const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(spot.name + ' ' + (area ?? ''))}`

  return (
    <div className="flex gap-3">
      <div className="flex flex-col items-center flex-shrink-0">
        <div className="w-9 h-9 rounded-full bg-gradient-to-br from-rose-300 to-pink-400 flex items-center justify-center text-white font-bold text-sm shadow-sm">
          {index + 1}
        </div>
        {!isLast && <div className="w-px flex-1 bg-pink-200 my-1.5 min-h-[1.5rem]" />}
      </div>

      <div className="pb-4 flex-1">
        <div className="bg-pink-50 border border-pink-100 rounded-2xl p-4">
          <div className="flex items-start justify-between gap-2 mb-2">
            <div>
              <span className="text-xs font-semibold text-rose-400 block">{spot.time}</span>
              <h4 className="font-bold text-gray-800 text-sm leading-snug mt-0.5">{spot.name}</h4>
            </div>
            <span className={`text-xs px-2.5 py-1 rounded-full font-medium flex-shrink-0 ${categoryStyle}`}>
              {spot.category}
            </span>
          </div>
          <p className="text-xs text-gray-600 mb-3 leading-relaxed">{spot.memo}</p>
          <div className="flex items-center gap-3 text-xs text-gray-500 border-t border-pink-100 pt-2.5">
            <span>⏱ {spot.duration_min}分</span>
            <span>{transportIcon} {spot.transport}</span>
            <span className="ml-auto font-semibold text-rose-500">¥{(spot.budget ?? 0).toLocaleString()}</span>
          </div>
          <a
            href={mapsUrl}
            target="_blank"
            rel="noreferrer"
            className="mt-2.5 flex items-center gap-1 text-xs text-blue-500 hover:text-blue-600 transition"
          >
            🗺️ Google Mapsで見る
          </a>
        </div>
      </div>
    </div>
  )
}

export default function PlanTimeline({ plan, formData, onDecide, onRegenerate, onEditConditions }) {
  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="bg-gradient-to-r from-rose-400 to-pink-400 rounded-3xl p-5 text-white shadow-lg">
        <p className="text-rose-100 text-xs font-medium mb-1">提案プラン</p>
        <h2 className="text-xl font-bold leading-snug">{plan.title}</h2>
        {plan.area && !formData?.area && (
          <p className="text-rose-100 text-xs mt-1 flex items-center gap-1">
            📍 AIが選んだエリア: <span className="font-semibold text-white">{plan.area}</span>
          </p>
        )}
        <p className="text-rose-100 text-sm mt-1">合計予算: ¥{(plan.total_budget ?? 0).toLocaleString()}</p>
      </div>

      {/* Timeline */}
      <div className="bg-white/80 backdrop-blur-sm rounded-3xl shadow-md border border-pink-100 p-5">
        <h3 className="font-bold text-gray-700 mb-4 text-sm flex items-center gap-2">
          🗺️ タイムライン
        </h3>
        <div className="space-y-0">
          {plan.spots?.map((spot, i) => (
            <SpotCard key={i} spot={spot} index={i} isLast={i === plan.spots.length - 1} area={formData?.area} />
          ))}
        </div>
        <div className="mt-3 pt-3 border-t border-pink-100 flex justify-between items-center text-sm">
          <span className="text-gray-500">合計予算</span>
          <span className="font-bold text-rose-500 text-base">¥{(plan.total_budget ?? 0).toLocaleString()}</span>
        </div>
      </div>

      {/* Lunch options */}
      <LunchTable options={plan.lunch_options} area={formData?.area} />

      {/* Actions */}
      <div className="space-y-3 pt-1">
        <button
          onClick={onDecide}
          className="w-full py-4 bg-gradient-to-r from-rose-400 to-pink-400 hover:from-rose-500 hover:to-pink-500 text-white font-bold rounded-full shadow-lg hover:shadow-xl transition-all text-base active:scale-95"
        >
          ✨ このプランで決定
        </button>
        <button
          onClick={onRegenerate}
          className="w-full py-3 bg-white text-rose-400 font-bold rounded-full border-2 border-rose-200 hover:bg-rose-50 transition-all active:scale-95"
        >
          🔄 別のプランを見る
        </button>
        <button
          onClick={onEditConditions}
          className="w-full py-3 bg-white text-gray-500 font-medium rounded-full border-2 border-gray-200 hover:bg-gray-50 transition-all active:scale-95 text-sm"
        >
          ✏️ 条件を変更する
        </button>
      </div>
    </div>
  )
}
