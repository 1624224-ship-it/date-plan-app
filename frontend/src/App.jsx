import { useState, useEffect } from 'react'
import { Routes, Route } from 'react-router-dom'
import InputForm from './components/InputForm'
import PlanTimeline from './components/PlanTimeline'
import CalendarRegister from './components/CalendarRegister'
import PlanSharePage from './pages/PlanSharePage'

function LoadingScreen() {
  return (
    <div className="flex flex-col items-center justify-center py-28 select-none">
      <div className="text-7xl animate-heartbeat mb-6">💕</div>
      <div className="flex gap-2 mb-5">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="w-2.5 h-2.5 bg-rose-400 rounded-full inline-block animate-bounce"
            style={{ animationDelay: `${i * 0.18}s` }}
          />
        ))}
      </div>
      <p className="text-rose-500 font-medium text-base">素敵なプランを考え中...</p>
    </div>
  )
}

export default function App() {
  const [step, setStep] = useState('input') // 'input' | 'loading' | 'plan' | 'calendar'
  const [plan, setPlan] = useState(null)
  const [formData, setFormData] = useState(null)
  const [sessionId, setSessionId] = useState(null)
  const [authError, setAuthError] = useState(false)

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const auth = params.get('auth')
    const session = params.get('session')
    if (auth === 'success' && session) {
      setSessionId(session)
    }
    if (auth === 'error') {
      setAuthError(true)
      setTimeout(() => setAuthError(false), 5000)
    }
    if (auth) {
      window.history.replaceState({}, '', '/')
    }
  }, [])

  const handleGenerate = async (data) => {
    setFormData(data)
    setStep('loading')
    try {
      const res = await fetch('/api/generate-plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      const result = await res.json()
      if (!res.ok) throw new Error(result.error || 'プランの生成に失敗しました。')
      setPlan(result)
      setStep('plan')
    } catch (err) {
      console.error(err)
      alert(err.message)
      setStep('input')
    }
  }

  const handleRegenerate = () => {
    if (formData) handleGenerate(formData)
  }

  return (
    <Routes>
      <Route path="/plan/:id" element={<PlanSharePage />} />
      <Route path="*" element={<MainApp authError={authError} step={step} plan={plan} formData={formData} sessionId={sessionId} onGenerate={handleGenerate} onRegenerate={handleRegenerate} setStep={setStep} />} />
    </Routes>
  )
}

function MainApp({ authError, step, plan, formData, sessionId, onGenerate, onRegenerate, setStep }) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-pink-50 via-rose-50 to-pink-100">
      <header className="sticky top-0 z-10 bg-white/80 backdrop-blur-sm border-b border-pink-200 shadow-sm">
        <div className="max-w-xl mx-auto px-4 py-4 flex items-center gap-3">
          <span className="text-2xl">💑</span>
          <h1 className="text-xl font-bold text-rose-500 tracking-tight">デートプラン提案</h1>
        </div>
      </header>

      {authError && (
        <div className="max-w-xl mx-auto px-4 pt-4">
          <div className="bg-red-50 border border-red-200 text-red-600 rounded-2xl px-4 py-3 text-sm">
            Google認証に失敗しました。もう一度お試しください。
          </div>
        </div>
      )}

      <main className="max-w-xl mx-auto px-4 py-8">
        {step === 'input' && <InputForm onGenerate={onGenerate} initialData={formData} />}
        {step === 'loading' && <LoadingScreen />}
        {step === 'plan' && (
          <PlanTimeline
            plan={plan}
            formData={formData}
            onDecide={() => setStep('calendar')}
            onRegenerate={onRegenerate}
            onEditConditions={() => setStep('input')}
          />
        )}
        {step === 'calendar' && (
          <CalendarRegister
            plan={plan}
            sessionId={sessionId}
            onBack={() => setStep('plan')}
            onDone={() => setStep('input')}
          />
        )}
      </main>
    </div>
  )
}
