const KEY = 'dateplan_gf_profile'

export function loadProfile() {
  try {
    return JSON.parse(localStorage.getItem(KEY)) ?? defaultProfile()
  } catch {
    return defaultProfile()
  }
}

export function saveProfile(profile) {
  localStorage.setItem(KEY, JSON.stringify(profile))
}

function defaultProfile() {
  return {
    likedSpots: [],      // 好きだったスポット名
    likedCategories: {}, // カテゴリ別スコア { '食事': 3, '観光': 1 }
    likedGenres: [],     // 好きなジャンル（カフェ、イタリアン 等）
    tags: [],            // 特徴タグ（屋内派、のんびり派 等）
    memo: '',            // 自由メモ
    history: [],         // 過去プラン履歴
  }
}

/** フィードバックをプロファイルに反映 */
export function applyFeedback(profile, { planTitle, date, likedSpots, likedLunchGenres, tags, memo }) {
  const next = { ...profile }

  // 好きだったスポットを追加（重複なし、最大30件）
  const newSpots = [...new Set([...next.likedSpots, ...likedSpots])]
  next.likedSpots = newSpots.slice(-30)

  // カテゴリスコアを加算
  likedSpots.forEach((spot) => {
    if (spot.category) {
      next.likedCategories[spot.category] = (next.likedCategories[spot.category] ?? 0) + 1
    }
  })

  // 好きなジャンル（ランチ）
  if (likedLunchGenres?.length) {
    const genres = [...new Set([...next.likedGenres, ...likedLunchGenres])]
    next.likedGenres = genres.slice(-20)
  }

  // タグ（重複なし）
  if (tags?.length) {
    next.tags = [...new Set([...next.tags, ...tags])]
  }

  // メモ
  if (memo?.trim()) {
    next.memo = memo.trim()
  }

  // 履歴追加（最大20件）
  next.history = [
    { date, title: planTitle, likedSpots: likedSpots.map((s) => s.name) },
    ...next.history,
  ].slice(0, 20)

  return next
}

/** プロンプト用の文字列を生成 */
export function profileToPromptText(profile) {
  const lines = []

  const topCategories = Object.entries(profile.likedCategories)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([k]) => k)
  if (topCategories.length) lines.push(`- 好きなカテゴリ: ${topCategories.join('、')}`)

  if (profile.likedGenres.length) lines.push(`- 好きな食のジャンル: ${profile.likedGenres.slice(0, 5).join('、')}`)
  if (profile.likedSpots.length) lines.push(`- 過去に好きだったスポット: ${profile.likedSpots.slice(-5).map(s => typeof s === 'string' ? s : s.name).join('、')}`)
  if (profile.tags.length) lines.push(`- 特徴: ${profile.tags.join('、')}`)
  if (profile.memo) lines.push(`- メモ: ${profile.memo}`)

  return lines.length
    ? `\n彼女の好み（過去のデートから学習済み）:\n${lines.join('\n')}\n上記の好みを最大限考慮してプランを提案してください。`
    : ''
}
