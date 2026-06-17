import { useState, useEffect, useCallback, useRef } from 'react'
import { getCurrentPosition, reverseGeocode, geocodeArea, fetchWeatherForDate, estimateWeatherFromMonth } from '../utils/location.js'

const THEMES = [
  { value: 'active', label: 'アクティブ', icon: '🏃' },
  { value: 'gourmet', label: 'グルメ', icon: '🍽️' },
  { value: 'relax', label: 'まったり', icon: '☕' },
  { value: 'drive', label: 'ドライブ', icon: '🚗' },
]

const WEATHER_OPTIONS = [
  { value: 'sunny', label: '☀️ 晴れ' },
  { value: 'rainy', label: '🌧️ 雨の日' },
]

function ToggleGroup({ options, value, onChange }) {
  return (
    <div className="grid grid-cols-2 gap-2">
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          className={`py-3 px-3 rounded-2xl border-2 font-medium text-sm transition-all flex items-center justify-center gap-1.5 ${
            value === opt.value
              ? 'border-rose-400 bg-rose-50 text-rose-600 shadow-sm'
              : 'border-gray-200 bg-white text-gray-500 hover:border-pink-300 hover:bg-pink-50'
          }`}
        >
          {opt.icon && <span>{opt.icon}</span>}
          {opt.label}
        </button>
      ))}
    </div>
  )
}

function today() {
  return new Date().toISOString().split('T')[0]
}

function isForecastable(dateStr) {
  const diff = (new Date(dateStr) - new Date()) / (1000 * 60 * 60 * 24)
  return diff <= 15
}

export default function InputForm({ onGenerate, initialData }) {
  const [form, setForm] = useState(initialData ?? {
    area: '',
    wishes: '',
    theme: 'relax',
    budget: 5000,
    date: today(),
    startTime: '11:00',
    endTime: '20:00',
    weather: 'sunny',
    lat: null,
    lon: null,
  })
  const [locating, setLocating] = useState(false)
  const [weatherInfo, setWeatherInfo] = useState(null) // { label, type, temp }
  const [weatherLoading, setWeatherLoading] = useState(false)
  const geocodeTimer = useRef(null)
  const lastGpsArea = useRef(null) // GPSで設定したエリア名を記憶（テキスト変更を区別）

  const set = (key) => (val) => setForm((f) => ({ ...f, [key]: val }))

  // 日付か座標が変わったら天気を自動取得
  const updateWeather = useCallback(async (lat, lon, date) => {
    if (!lat || !lon) return
    setWeatherLoading(true)
    try {
      let info
      if (isForecastable(date)) {
        info = await fetchWeatherForDate(lat, lon, date)
      }
      if (!info) {
        info = estimateWeatherFromMonth(date)
      }
      setWeatherInfo(info)
      setForm((f) => ({ ...f, weather: info.type }))
    } finally {
      setWeatherLoading(false)
    }
  }, [])

  useEffect(() => {
    if (form.lat && form.lon) {
      updateWeather(form.lat, form.lon, form.date)
    }
  }, [form.date, form.lat, form.lon, updateWeather])

  // エリアテキスト変更時：ジオコーディング→天気取得（800msデバウンス）
  const handleAreaChange = (value) => {
    set('area')(value)
    // GPSで設定した座標をリセット（手入力に切り替わったとき）
    if (value !== lastGpsArea.current) {
      setForm((f) => ({ ...f, lat: null, lon: null }))
      setWeatherInfo(null)
    }
    if (geocodeTimer.current) clearTimeout(geocodeTimer.current)
    if (!value.trim()) return
    geocodeTimer.current = setTimeout(async () => {
      setWeatherLoading(true)
      try {
        const coords = await geocodeArea(value)
        if (!coords) return
        setForm((f) => ({ ...f, lat: coords.lat, lon: coords.lon }))
      } finally {
        setWeatherLoading(false)
      }
    }, 800)
  }

  // GPS取得
  const handleGPS = async () => {
    setLocating(true)
    try {
      const pos = await getCurrentPosition()
      const { latitude, longitude } = pos.coords
      const area = await reverseGeocode(latitude, longitude)
      lastGpsArea.current = area
      setForm((f) => ({ ...f, area, lat: latitude, lon: longitude }))
    } catch (err) {
      alert('位置情報を取得できませんでした。\nブラウザの設定でGPSを許可してください。')
    } finally {
      setLocating(false)
    }
  }

  const handleSubmit = (e) => {
    e.preventDefault()
    onGenerate({ ...form, weatherDetail: weatherInfo ? `${weatherInfo.label}${weatherInfo.temp ? '・' + weatherInfo.temp : ''}` : null })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="bg-white/80 backdrop-blur-sm rounded-3xl shadow-md border border-pink-100 p-6 space-y-6">
        <h2 className="text-base font-bold text-gray-700 flex items-center gap-2">
          <span>📍</span> デートの条件を入力してください
        </h2>

        {/* 日付 */}
        <div>
          <label className="block text-sm font-medium text-gray-600 mb-2">📅 日付</label>
          <input
            type="date"
            value={form.date}
            min={today()}
            onChange={(e) => set('date')(e.target.value)}
            required
            className="w-full px-4 py-3 rounded-2xl border border-pink-200 focus:border-rose-400 focus:ring-2 focus:ring-rose-100 outline-none transition bg-white text-gray-800 text-sm"
          />
        </div>

        {/* 開始・終了時刻 */}
        <div>
          <label className="block text-sm font-medium text-gray-600 mb-2">⏰ 開始・終了時刻</label>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="text-xs text-gray-400 mb-1 text-center">開始</p>
              <input
                type="time"
                value={form.startTime}
                onChange={(e) => set('startTime')(e.target.value)}
                required
                className="w-full px-4 py-3 rounded-2xl border border-pink-200 focus:border-rose-400 focus:ring-2 focus:ring-rose-100 outline-none transition bg-white text-gray-800 text-sm text-center"
              />
            </div>
            <div>
              <p className="text-xs text-gray-400 mb-1 text-center">終了</p>
              <input
                type="time"
                value={form.endTime}
                onChange={(e) => set('endTime')(e.target.value)}
                required
                className="w-full px-4 py-3 rounded-2xl border border-pink-200 focus:border-rose-400 focus:ring-2 focus:ring-rose-100 outline-none transition bg-white text-gray-800 text-sm text-center"
              />
            </div>
          </div>
        </div>

        {/* エリア + GPS */}
        <div>
          <label className="block text-sm font-medium text-gray-600 mb-2">エリア</label>
          <div className="flex gap-2">
            <input
              type="text"
              value={form.area}
              onChange={(e) => handleAreaChange(e.target.value)}
              placeholder={form.wishes?.trim() ? 'やりたいことからAIが決定（空欄OK）' : '例：千葉・船橋・浦安'}
              required={!form.wishes?.trim()}
              className="flex-1 px-4 py-3 rounded-2xl border border-pink-200 focus:border-rose-400 focus:ring-2 focus:ring-rose-100 outline-none transition bg-white text-gray-800 placeholder-gray-400 text-sm"
            />
            <button
              type="button"
              onClick={handleGPS}
              disabled={locating}
              title="現在地を自動入力"
              className="flex-shrink-0 w-12 h-12 rounded-2xl bg-rose-50 border-2 border-rose-200 text-rose-500 hover:bg-rose-100 transition-all flex items-center justify-center disabled:opacity-50"
            >
              {locating ? (
                <svg className="animate-spin w-5 h-5" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
                </svg>
              ) : '📍'}
            </button>
          </div>
          {form.lat && (
            <p className="text-xs text-emerald-500 mt-1.5 flex items-center gap-1">
              <span>✓</span> GPS取得済み・天気は自動で反映します
            </p>
          )}
        </div>

        {/* やりたいこと */}
        <div>
          <label className="block text-sm font-medium text-gray-600 mb-2">💬 やりたいこと（任意）</label>
          <textarea
            value={form.wishes}
            onChange={(e) => set('wishes')(e.target.value)}
            placeholder="例：水族館に行きたい、夜景が見たい、おいしいパスタを食べたい…"
            rows={3}
            className="w-full px-4 py-3 rounded-2xl border border-pink-200 focus:border-rose-400 focus:ring-2 focus:ring-rose-100 outline-none transition bg-white text-gray-800 placeholder-gray-400 text-sm resize-none"
          />
        </div>

        {/* テーマ */}
        <div>
          <label className="block text-sm font-medium text-gray-600 mb-2">テーマ</label>
          <ToggleGroup options={THEMES} value={form.theme} onChange={set('theme')} />
        </div>

        {/* 予算 */}
        <div>
          <label className="block text-sm font-medium text-gray-600 mb-2">
            予算：<span className="text-rose-500 font-bold">¥{form.budget.toLocaleString()}</span>
          </label>
          <input
            type="range" min={1000} max={20000} step={500}
            value={form.budget}
            onChange={(e) => set('budget')(Number(e.target.value))}
            className="w-full h-2 accent-rose-400 cursor-pointer"
          />
          <div className="flex justify-between text-xs text-gray-400 mt-1.5">
            <span>¥1,000</span><span>¥20,000</span>
          </div>
        </div>

        {/* 天気 */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-sm font-medium text-gray-600">天気</label>
            {weatherLoading && (
              <span className="text-xs text-rose-400 animate-pulse">予報取得中...</span>
            )}
            {!weatherLoading && weatherInfo && (
              <span className="text-xs bg-sky-50 text-sky-500 border border-sky-200 rounded-full px-2.5 py-0.5 font-medium">
                📡 {weatherInfo.label}{weatherInfo.temp ? ` ${weatherInfo.temp}` : ''}
              </span>
            )}
          </div>
          <ToggleGroup options={WEATHER_OPTIONS} value={form.weather} onChange={set('weather')} />
          {weatherInfo && (
            <p className="text-xs text-gray-400 mt-1.5 text-center">
              予報を自動取得しました。変更することもできます
            </p>
          )}
        </div>
      </div>

      <button
        type="submit"
        className="w-full py-4 bg-gradient-to-r from-rose-400 to-pink-400 hover:from-rose-500 hover:to-pink-500 text-white font-bold rounded-full shadow-lg hover:shadow-xl transition-all text-base active:scale-95"
      >
        💑 プランを生成する
      </button>
    </form>
  )
}
