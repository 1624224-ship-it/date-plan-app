/** テキスト地名 → 座標（OpenStreetMap Nominatim 順ジオコーディング） */
export async function geocodeArea(query) {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=1&accept-language=ja&countrycodes=jp`,
      { headers: { 'User-Agent': 'DatePlanApp/1.0' } }
    )
    const data = await res.json()
    if (!data[0]) return null
    return { lat: parseFloat(data[0].lat), lon: parseFloat(data[0].lon) }
  } catch {
    return null
  }
}

/** ブラウザGPSで現在地座標を取得 */
export function getCurrentPosition() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('このブラウザはGPSに対応していません'))
      return
    }
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      timeout: 10000,
      maximumAge: 60000,
    })
  })
}

/** 座標 → 日本語の地名（OpenStreetMap Nominatim） */
export async function reverseGeocode(lat, lon) {
  const res = await fetch(
    `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json&accept-language=ja`,
    { headers: { 'User-Agent': 'DatePlanApp/1.0' } }
  )
  const data = await res.json()
  const a = data.address ?? {}
  // 市区町村 + 都道府県
  const city = a.city || a.town || a.village || a.county || ''
  const pref = a.state || ''
  return city ? `${city}（${pref}）` : pref || '現在地'
}

/** Open-Meteo で指定日の天気予報を取得（16日先まで無料） */
const WMO_RAIN = new Set([51,53,55,56,57,61,63,65,66,67,80,81,82,85,86,95,96,99])
const WMO_SNOW = new Set([71,73,75,77,85,86])

export async function fetchWeatherForDate(lat, lon, dateStr) {
  try {
    const res = await fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
      `&daily=weathercode,temperature_2m_max,temperature_2m_min` +
      `&timezone=Asia%2FTokyo&start_date=${dateStr}&end_date=${dateStr}`
    )
    const data = await res.json()
    const code = data.daily?.weathercode?.[0]
    const tMax = data.daily?.temperature_2m_max?.[0]
    const tMin = data.daily?.temperature_2m_min?.[0]

    if (code == null) return null

    let label, type
    if (WMO_SNOW.has(code))      { label = '雪'; type = 'rainy' }
    else if (WMO_RAIN.has(code)) { label = '雨'; type = 'rainy' }
    else if (code >= 45)         { label = '霧・曇り'; type = 'sunny' }
    else if (code >= 3)          { label = '曇り'; type = 'sunny' }
    else if (code >= 1)          { label = '晴れのち曇り'; type = 'sunny' }
    else                         { label = '快晴'; type = 'sunny' }

    const temp = tMax != null ? `${Math.round(tMin)}〜${Math.round(tMax)}℃` : ''
    return { label, type, temp }
  } catch {
    return null
  }
}

/** 16日超の日付は季節で推定 */
export function estimateWeatherFromMonth(dateStr) {
  const month = new Date(dateStr).getMonth() + 1
  if (month === 6 || month === 7 || month === 9) return { label: '雨が多い季節', type: 'rainy', temp: '' }
  return { label: '晴れが多い季節', type: 'sunny', temp: '' }
}
