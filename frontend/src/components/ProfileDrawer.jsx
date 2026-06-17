import { loadProfile, saveProfile } from '../utils/profile.js'
import { useState } from 'react'

export default function ProfileDrawer({ onClose }) {
  const [profile, setProfile] = useState(loadProfile())
  const [editMemo, setEditMemo] = useState(profile.memo)

  const topCategories = Object.entries(profile.likedCategories ?? {})
    .sort((a, b) => b[1] - a[1])

  const removeTag = (tag) => {
    const next = { ...profile, tags: profile.tags.filter((t) => t !== tag) }
    setProfile(next)
    saveProfile(next)
  }

  const saveMemo = () => {
    const next = { ...profile, memo: editMemo }
    setProfile(next)
    saveProfile(next)
  }

  const totalLearned = (profile.likedSpots?.length ?? 0) +
    (profile.tags?.length ?? 0) +
    (profile.likedGenres?.length ?? 0) +
    (profile.history?.length ?? 0)

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex justify-end" onClick={onClose}>
      <div
        className="bg-white w-full max-w-sm h-full overflow-y-auto shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="bg-gradient-to-r from-rose-400 to-pink-400 p-5 text-white">
          <button onClick={onClose} className="text-white/70 text-sm mb-2">← 閉じる</button>
          <h2 className="font-bold text-xl">💕 彼女プロファイル</h2>
          <p className="text-rose-100 text-xs mt-1">
            {totalLearned > 0
              ? `${totalLearned}件のデータから学習中`
              : 'デートを重ねるほど賢くなります'}
          </p>
        </div>

        <div className="p-5 space-y-6">
          {totalLearned === 0 && (
            <div className="text-center py-8 text-gray-400">
              <div className="text-5xl mb-3">🌱</div>
              <p className="text-sm">まだデータがありません。<br />プランを決定した後に振り返りを入力すると<br />AIが学習していきます。</p>
            </div>
          )}

          {/* 好きなカテゴリ */}
          {topCategories.length > 0 && (
            <div>
              <p className="text-sm font-bold text-gray-700 mb-3">📊 好きなカテゴリ</p>
              <div className="space-y-2">
                {topCategories.map(([cat, count]) => (
                  <div key={cat} className="flex items-center gap-3">
                    <span className="text-sm text-gray-600 w-16">{cat}</span>
                    <div className="flex-1 bg-pink-100 rounded-full h-2.5 overflow-hidden">
                      <div
                        className="bg-gradient-to-r from-rose-400 to-pink-400 h-full rounded-full transition-all"
                        style={{ width: `${Math.min(100, count * 20)}%` }}
                      />
                    </div>
                    <span className="text-xs text-gray-400">{count}回</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 好きなジャンル */}
          {profile.likedGenres?.length > 0 && (
            <div>
              <p className="text-sm font-bold text-gray-700 mb-2">🍽️ 好きな食のジャンル</p>
              <div className="flex flex-wrap gap-2">
                {profile.likedGenres.map((g) => (
                  <span key={g} className="px-3 py-1 bg-orange-50 text-orange-500 border border-orange-200 rounded-full text-xs font-medium">
                    {g}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* タグ */}
          {profile.tags?.length > 0 && (
            <div>
              <p className="text-sm font-bold text-gray-700 mb-2">🏷️ 特徴</p>
              <div className="flex flex-wrap gap-2">
                {profile.tags.map((tag) => (
                  <span
                    key={tag}
                    className="px-3 py-1 bg-pink-50 text-pink-600 border border-pink-200 rounded-full text-xs font-medium flex items-center gap-1"
                  >
                    {tag}
                    <button
                      onClick={() => removeTag(tag)}
                      className="text-pink-300 hover:text-pink-500 ml-0.5"
                    >×</button>
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* メモ */}
          <div>
            <p className="text-sm font-bold text-gray-700 mb-2">📝 メモ</p>
            <textarea
              value={editMemo}
              onChange={(e) => setEditMemo(e.target.value)}
              onBlur={saveMemo}
              placeholder="彼女の好みを自由に書いておこう..."
              rows={3}
              className="w-full px-4 py-3 rounded-2xl border border-pink-200 focus:border-rose-400 outline-none transition bg-white text-gray-800 text-sm resize-none placeholder-gray-400"
            />
            <p className="text-xs text-gray-400 mt-1">フォーカスを外すと自動保存</p>
          </div>

          {/* 過去の履歴 */}
          {profile.history?.length > 0 && (
            <div>
              <p className="text-sm font-bold text-gray-700 mb-2">📅 過去のデート</p>
              <div className="space-y-2">
                {profile.history.map((h, i) => (
                  <div key={i} className="bg-pink-50 rounded-2xl px-4 py-3 text-sm">
                    <p className="text-xs text-gray-400">{h.date}</p>
                    <p className="font-medium text-gray-700 text-xs mt-0.5">{h.title}</p>
                    {h.likedSpots?.length > 0 && (
                      <p className="text-xs text-rose-400 mt-1">💕 {h.likedSpots.join('・')}</p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
