import { useState } from 'react'

const PRESET_TAGS = [
  '屋内派', '屋外派', 'のんびり好き', 'アクティブ好き',
  'カフェ好き', 'おしゃれ重視', '映えスポット好き', '穴場好き',
  '歩くのが好き', '歩くのが苦手', 'コスパ重視', '雰囲気重視',
]

export default function FeedbackModal({ plan, onSave, onSkip }) {
  const [likedSpotNames, setLikedSpotNames] = useState([])
  const [likedLunchGenres, setLikedLunchGenres] = useState([])
  const [selectedTags, setSelectedTags] = useState([])
  const [memo, setMemo] = useState('')

  const toggleSpot = (name) =>
    setLikedSpotNames((p) => p.includes(name) ? p.filter((x) => x !== name) : [...p, name])
  const toggleGenre = (genre) =>
    setLikedLunchGenres((p) => p.includes(genre) ? p.filter((x) => x !== genre) : [...p, genre])
  const toggleTag = (tag) =>
    setSelectedTags((p) => p.includes(tag) ? p.filter((x) => x !== tag) : [...p, tag])

  const likedSpots = (plan.spots ?? []).filter((s) => likedSpotNames.includes(s.name))

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-4">
      <div className="bg-white rounded-3xl w-full max-w-md max-h-[85vh] overflow-y-auto shadow-2xl">
        <div className="bg-gradient-to-r from-rose-400 to-pink-400 rounded-t-3xl p-5 text-white">
          <p className="text-xs text-rose-100 mb-1">💕 プランの振り返り</p>
          <h2 className="font-bold text-lg">彼女はどうだった？</h2>
          <p className="text-rose-100 text-xs mt-1">答えるほどAIが学習して次回のプランに活かします</p>
        </div>

        <div className="p-5 space-y-5">
          {/* 好きだったスポット */}
          <div>
            <p className="text-sm font-bold text-gray-700 mb-2">😊 好きだったスポット（複数OK）</p>
            <div className="space-y-2">
              {(plan.spots ?? []).map((spot) => (
                <button
                  key={spot.name}
                  type="button"
                  onClick={() => toggleSpot(spot.name)}
                  className={`w-full text-left px-4 py-2.5 rounded-2xl border-2 text-sm transition-all flex items-center justify-between ${
                    likedSpotNames.includes(spot.name)
                      ? 'border-rose-400 bg-rose-50 text-rose-700'
                      : 'border-gray-200 bg-white text-gray-600'
                  }`}
                >
                  <span>
                    <span className="text-xs text-gray-400 mr-2">{spot.time}</span>
                    {spot.name}
                  </span>
                  {likedSpotNames.includes(spot.name) && <span>💕</span>}
                </button>
              ))}
            </div>
          </div>

          {/* 好きだったランチジャンル */}
          {plan.lunch_options?.length > 0 && (
            <div>
              <p className="text-sm font-bold text-gray-700 mb-2">🍽️ 好きだった食のジャンル</p>
              <div className="flex flex-wrap gap-2">
                {[...new Set(plan.lunch_options.map((r) => r.genre))].map((genre) => (
                  <button
                    key={genre}
                    type="button"
                    onClick={() => toggleGenre(genre)}
                    className={`px-3 py-1.5 rounded-full border-2 text-xs font-medium transition-all ${
                      likedLunchGenres.includes(genre)
                        ? 'border-rose-400 bg-rose-50 text-rose-600'
                        : 'border-gray-200 text-gray-500'
                    }`}
                  >
                    {genre}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* 特徴タグ */}
          <div>
            <p className="text-sm font-bold text-gray-700 mb-2">🏷️ 彼女に当てはまるもの</p>
            <div className="flex flex-wrap gap-2">
              {PRESET_TAGS.map((tag) => (
                <button
                  key={tag}
                  type="button"
                  onClick={() => toggleTag(tag)}
                  className={`px-3 py-1.5 rounded-full border-2 text-xs font-medium transition-all ${
                    selectedTags.includes(tag)
                      ? 'border-pink-400 bg-pink-50 text-pink-600'
                      : 'border-gray-200 text-gray-500'
                  }`}
                >
                  {tag}
                </button>
              ))}
            </div>
          </div>

          {/* メモ */}
          <div>
            <p className="text-sm font-bold text-gray-700 mb-2">📝 メモ（任意）</p>
            <textarea
              value={memo}
              onChange={(e) => setMemo(e.target.value)}
              placeholder="例：パスタが大好き、海が見える場所が好き..."
              rows={2}
              className="w-full px-4 py-3 rounded-2xl border border-pink-200 focus:border-rose-400 focus:ring-2 focus:ring-rose-100 outline-none transition bg-white text-gray-800 text-sm resize-none placeholder-gray-400"
            />
          </div>

          <div className="space-y-2 pt-1">
            <button
              onClick={() => onSave({ likedSpots, likedLunchGenres, tags: selectedTags, memo })}
              className="w-full py-3.5 bg-gradient-to-r from-rose-400 to-pink-400 text-white font-bold rounded-full shadow-md hover:shadow-lg transition-all active:scale-95"
            >
              💾 保存して学習する
            </button>
            <button
              onClick={onSkip}
              className="w-full py-2.5 text-gray-400 text-sm rounded-full hover:bg-gray-50 transition-all"
            >
              スキップ
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
