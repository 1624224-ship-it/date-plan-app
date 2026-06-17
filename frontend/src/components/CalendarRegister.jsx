import { useState } from 'react'

function SuccessScreen({ plan, onDone }) {
  return (
    <div className="text-center py-16 space-y-4">
      <div className="text-7xl">🎉</div>
      <h2 className="text-2xl font-bold text-gray-800">登録完了！</h2>
      <p className="text-gray-600">
        Googleカレンダーに{' '}
        <span className="font-bold text-rose-500">{plan.spots?.length}</span> 件のイベントを追加しました
      </p>
      <p className="text-rose-400 text-sm">素敵なデートを楽しんでください 💑</p>
      <div className="pt-4">
        <button
          onClick={onDone}
          className="px-8 py-3 bg-gradient-to-r from-rose-400 to-pink-400 text-white font-bold rounded-full shadow-md hover:shadow-lg transition-all active:scale-95"
        >
          最初に戻る
        </button>
      </div>
    </div>
  )
}

export default function CalendarRegister({ plan, sessionId, onBack, onDone }) {
  const [date, setDate] = useState('')
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState(null)

  const todayStr = new Date().toISOString().split('T')[0]

  const handleGoogleAuth = () => {
    window.location.href = '/api/auth/google'
  }

  const handleRegister = async () => {
    if (!date) {
      setError('デートの日付を選択してください。')
      return
    }

    setLoading(true)
    setError(null)

    try {
      const res = await fetch('/api/calendar/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, plan, date }),
      })
      const data = await res.json()
      if (data.success) {
        setSuccess(true)
      } else {
        setError(data.error ?? '登録に失敗しました。')
      }
    } catch {
      setError('通信エラーが発生しました。バックエンドが起動しているか確認してください。')
    } finally {
      setLoading(false)
    }
  }

  if (success) {
    return <SuccessScreen plan={plan} onDone={onDone} />
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="bg-gradient-to-r from-rose-400 to-pink-400 rounded-3xl p-5 text-white shadow-lg">
        <p className="text-rose-100 text-xs font-medium mb-1">カレンダー登録</p>
        <h2 className="text-xl font-bold">{plan.title}</h2>
      </div>

      {/* Main card */}
      <div className="bg-white/80 backdrop-blur-sm rounded-3xl shadow-md border border-pink-100 p-6">
        {!sessionId ? (
          /* Not authenticated */
          <div className="text-center py-4">
            <div className="text-5xl mb-4">📆</div>
            <p className="text-gray-600 text-sm mb-6 leading-relaxed">
              Googleカレンダーに登録するには<br />
              Googleアカウントでのログインが必要です
            </p>
            <button
              onClick={handleGoogleAuth}
              className="inline-flex items-center gap-3 px-6 py-3 bg-white border border-gray-200 rounded-full shadow-sm hover:shadow-md transition-all text-gray-700 font-medium text-sm"
            >
              <svg width="18" height="18" viewBox="0 0 18 18" xmlns="http://www.w3.org/2000/svg">
                <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.874 2.684-6.615z" fill="#4285F4"/>
                <path d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.258c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332C2.438 15.983 5.482 18 9 18z" fill="#34A853"/>
                <path d="M3.964 10.707c-.18-.54-.282-1.117-.282-1.707 0-.59.102-1.167.282-1.707V4.961H.957C.347 6.175 0 7.55 0 9s.348 2.825.957 4.039l3.007-2.332z" fill="#FBBC05"/>
                <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0 5.482 0 2.438 2.017.957 4.961L3.964 6.293C4.672 4.166 6.656 3.58 9 3.58z" fill="#EA4335"/>
              </svg>
              Googleでログイン
            </button>
          </div>
        ) : (
          /* Authenticated */
          <div className="space-y-5">
            <div className="flex items-center gap-2 text-emerald-600 text-sm font-medium">
              <span className="w-5 h-5 bg-emerald-100 rounded-full flex items-center justify-center text-xs">✓</span>
              Googleアカウント連携済み
            </div>

            {/* Date picker */}
            <div>
              <label className="block text-sm font-medium text-gray-600 mb-2">
                デートの日付
              </label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                min={todayStr}
                className="w-full px-4 py-3 rounded-2xl border border-pink-200 focus:border-rose-400 focus:ring-2 focus:ring-rose-100 outline-none transition bg-white text-gray-800"
              />
            </div>

            {/* Preview */}
            <div>
              <p className="text-xs text-gray-500 mb-2">
                登録するイベント（{plan.spots?.length}件）
              </p>
              <div className="space-y-1.5">
                {plan.spots?.map((spot, i) => (
                  <div
                    key={i}
                    className="flex items-center gap-3 bg-pink-50 rounded-xl px-4 py-2.5 text-sm"
                  >
                    <span className="text-rose-400 font-semibold w-12 flex-shrink-0">
                      {spot.time}
                    </span>
                    <span className="text-gray-700 font-medium">{spot.name}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {error && (
          <div className="mt-4 p-3 bg-red-50 border border-red-100 text-red-600 rounded-2xl text-sm">
            {error}
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="space-y-3 pt-1">
        {sessionId && (
          <button
            onClick={handleRegister}
            disabled={loading || !date}
            className="w-full py-4 bg-gradient-to-r from-rose-400 to-pink-400 hover:from-rose-500 hover:to-pink-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold rounded-full shadow-lg hover:shadow-xl transition-all text-base active:scale-95"
          >
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <svg className="animate-spin h-5 w-5" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                </svg>
                登録中...
              </span>
            ) : (
              '📅 Googleカレンダーに追加'
            )}
          </button>
        )}
        <button
          onClick={onBack}
          className="w-full py-3 bg-white text-rose-400 font-bold rounded-full border-2 border-rose-200 hover:bg-rose-50 transition-all active:scale-95"
        >
          ← プランに戻る
        </button>
      </div>
    </div>
  )
}
