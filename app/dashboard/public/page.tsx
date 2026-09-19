'use client'

import Link from 'next/link'
import useSWR from 'swr'
import { FormEvent, useMemo, useRef, useState } from 'react'
import { ArrowLeft, BookOpen, CheckCircle2, Clock3, FileText, Loader2, Plus, Send, Sparkles, Ticket, Trash2, UserRound } from 'lucide-react'

type Source = { id: string; title: string; publisher: string; source_url: string | null; published_at: string | null }
type ApiEnquiry = { case_id: string; question: string; status: 'answered' | 'escalated' | 'in_review' | 'closed'; response: string | null; escalation_reason: string | null; progress: string; updated_at: string; created_at: string; source_ids: string[] }
type ApiData = { enquiries: ApiEnquiry[]; sources: Source[] }
type Mode = 'ask' | 'enquiries'
type Conversation = { caseId: string; question: string; answer: string; sources: Source[]; relatedSources: Source[]; status: 'answered' | 'information_gap'; escalated: boolean }

const fetcher = (url: string) => fetch(url).then((response) => {
  if (!response.ok) throw new Error('Supabase data could not be loaded.')
  return response.json()
})

function formatDate(value: string) {
  return new Intl.DateTimeFormat('en-ZA', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
}

const approvedQuestions = [
  { title: 'What is Stats SA?', question: 'What is Statistics South Africa and what information does it publish?', category: 'About Stats SA' },
  { title: 'Population statistics', question: 'What are the latest official population statistics published by Stats SA?', category: 'Population' },
  { title: 'Employment statistics', question: 'What are the latest official employment statistics published by Stats SA?', category: 'Employment' },
  { title: 'Inflation and prices', question: 'What is the latest consumer price inflation rate published by Stats SA?', category: 'Economy' },
]

function StatusBadge({ status }: { status: ApiEnquiry['status'] }) {
  const label = status === 'in_review' ? 'In review' : status[0].toUpperCase() + status.slice(1)
  return <span className={`rounded-full px-2 py-1 text-[10px] font-bold ${status === 'escalated' ? 'bg-amber-100 text-amber-800' : status === 'answered' ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-600'}`}>{label}</span>
}

function ConversationMessage({ type, children, label, time }: { type: 'user' | 'assistant'; children: React.ReactNode; label: string; time?: string }) {
  const user = type === 'user'
  return <div className={`flex items-end gap-2 ${user ? 'justify-end' : 'justify-start'}`}>
    {!user && <span className="mb-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-blue-100 text-blue-700"><Sparkles size={14} /></span>}
    <div className={`max-w-[88%] sm:max-w-[76%] ${user ? 'items-end' : 'items-start'} flex flex-col`}>
      <span className="mb-1 px-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">{label}</span>
      <div className={`rounded-2xl px-4 py-3 text-sm leading-6 shadow-sm ${user ? 'rounded-br-md bg-blue-600 text-white' : 'rounded-bl-md border border-slate-200 bg-white text-slate-700'}`}>{children}</div>
      {time && <span className="mt-1 px-1 text-[10px] text-slate-400">{time}</span>}
    </div>
    {user && <span className="mb-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-200 text-slate-600"><UserRound size={14} /></span>}
  </div>
}

export default function PublicDashboardPage() {
  const { data, error: dataError, mutate } = useSWR<ApiData>('/api/public/ask', fetcher)
  const [mode, setMode] = useState<Mode>('ask')
  const [selectedId, setSelectedId] = useState('')
  const [question, setQuestion] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [conversation, setConversation] = useState<Conversation | null>(null)
  const [sessionId, setSessionId] = useState(() => crypto.randomUUID())
  const [pendingEscalation, setPendingEscalation] = useState<{ caseId: string; question: string; answer: string; sources: Source[] } | null>(null)
  const [duplicate, setDuplicate] = useState<{ caseId: string; question: string; status: ApiEnquiry['status']; answer: string | null; updatedAt: string } | null>(null)
  const [deletingCaseId, setDeletingCaseId] = useState('')
  const [followUps, setFollowUps] = useState<string[]>([])
  const [clarifyingCaseId, setClarifyingCaseId] = useState('')
  const requestController = useRef<AbortController | null>(null)

  const enquiries = data?.enquiries ?? []
  const selected = enquiries.find((item) => item.case_id === selectedId) ?? enquiries[0]
  const activeEnquiry = conversation ? enquiries.find((item) => item.case_id === conversation.caseId) : undefined
  const conversationAwaitingReview = Boolean(conversation?.escalated || activeEnquiry?.status === 'escalated' || activeEnquiry?.status === 'in_review')
  const sourceMap = useMemo(() => new Map((data?.sources ?? []).map((source) => [source.id, source])), [data?.sources])
  const selectedSources = selected?.source_ids.map((id) => sourceMap.get(id)).filter(Boolean) as Source[] | undefined

  function startNewSession() {
    setConversation(null)
    setFollowUps([])
    setPendingEscalation(null)
    setQuestion('')
    setError('')
    setSessionId(crypto.randomUUID())
    setMode('ask')
    setClarifyingCaseId('')
  }

  function openEnquiry(caseId: string) {
    const enquiry = enquiries.find((item) => item.case_id === caseId)
    if (!enquiry) return
    const enquirySources = enquiry.source_ids.map((id) => sourceMap.get(id)).filter(Boolean) as Source[]
    setSelectedId(caseId)
    setConversation({
      caseId: enquiry.case_id,
      question: enquiry.question,
      answer: enquiry.response ?? 'This enquiry is awaiting an official response.',
      sources: enquirySources,
      relatedSources: [],
      status: enquiry.status === 'answered' ? 'answered' : 'information_gap',
      escalated: enquiry.status === 'escalated' || enquiry.status === 'in_review',
    })
    setFollowUps([])
    setPendingEscalation(null)
    setDuplicate(null)
    setError('')
    setMode('ask')
  }

  function addClarification(caseId: string) {
    openEnquiry(caseId)
    setClarifyingCaseId(caseId)
    setQuestion('')
  }

  async function deleteEnquiry(caseId: string) {
    if (deletingCaseId || !window.confirm(`Delete enquiry ${caseId}? This cannot be undone.`)) return
    setDeletingCaseId(caseId)
    setError('')
    try {
      const response = await fetch(`/api/public/ask?caseId=${encodeURIComponent(caseId)}`, { method: 'DELETE' })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error ?? 'This enquiry could not be deleted.')
      if (conversation?.caseId === caseId) setConversation(null)
      if (selectedId === caseId) setSelectedId('')
      await mutate()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'This enquiry could not be deleted.')
    } finally {
      setDeletingCaseId('')
    }
  }

  async function confirmEscalation() {
    if (!pendingEscalation || loading) return
    setLoading(true)
    const controller = new AbortController()
    requestController.current = controller
    try {
      const response = await fetch('/api/public/ask', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ question: pendingEscalation.question, caseId: pendingEscalation.caseId, allowEscalation: true }), signal: controller.signal })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error ?? 'This enquiry could not be escalated.')
      setConversation((current) => current ? { ...current, escalated: true } : current)
      setPendingEscalation(null)
      await mutate()
    } catch (err) {
      if (!(err instanceof DOMException && err.name === 'AbortError')) setError(err instanceof Error ? err.message : 'This enquiry could not be escalated.')
    } finally { requestController.current = null; setLoading(false) }
  }

  async function askQuestion(event?: FormEvent, presetQuestion?: string) {
    event?.preventDefault()
    const asked = (presetQuestion ?? question).trim()
    if (!asked || loading) return
    setMode('ask')
    setLoading(true)
    setError('')
    const controller = new AbortController()
    requestController.current = controller
    try {
      const response = await fetch('/api/public/ask', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ question: asked, caseId: conversation?.caseId, sessionId, allowEscalation: false }), signal: controller.signal })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error ?? 'We could not process that enquiry.')
      if (result.duplicate) {
        setDuplicate(result.duplicate)
        setQuestion('')
        return
      }
      if (result.followUp && conversation?.caseId === result.caseId) {
        setFollowUps((current) => [...current, asked])
        setConversation((current) => current ? { ...current, answer: result.answer, escalated: Boolean(result.escalated), sources: result.status === 'information_gap' ? [] : result.sources ?? current.sources, relatedSources: result.status === 'information_gap' ? [] : result.relatedSources ?? current.relatedSources, status: result.status ?? current.status } : current)
        setQuestion('')
        setClarifyingCaseId('')
        await mutate()
        return
      }
      const nextConversation = { caseId: result.caseId, question: asked, answer: result.answer, sources: result.status === 'information_gap' ? [] : result.sources ?? [], relatedSources: result.status === 'information_gap' ? [] : result.relatedSources ?? [], status: result.status ?? 'information_gap', escalated: Boolean(result.escalated) }
      setFollowUps([])
      setConversation(nextConversation)
      setQuestion('')
      if (result.requiresConsent) setPendingEscalation(nextConversation)
      await mutate()
    } catch (err) {
      if (!(err instanceof DOMException && err.name === 'AbortError')) setError(err instanceof Error ? err.message : 'We could not process that enquiry.')
    } finally { requestController.current = null; setLoading(false) }
  }

  function cancelQuestion() {
    requestController.current?.abort()
    setLoading(false)
  }

  return <main className="min-h-screen bg-[#f3f6fb] text-slate-900">
    <div className="mx-auto flex min-h-screen max-w-[1440px]">
      <aside className="hidden w-60 shrink-0 border-r border-slate-200 bg-white px-4 py-5 lg:flex lg:flex-col">
        <Link href="/dashboard" className="mb-8 inline-flex items-center gap-2 px-2 text-xs font-semibold text-slate-500 hover:text-blue-700"><ArrowLeft size={14} /> Dashboard</Link>
        <div className="mb-8 flex items-center gap-3 px-2"><span className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-100 text-blue-700"><Sparkles size={17} /></span><div><p className="text-[10px] font-bold uppercase tracking-[0.16em] text-blue-600">Public access</p><p className="text-sm font-bold">Information desk</p></div></div>
        <nav className="space-y-1" aria-label="Public workspace navigation"><p className="px-3 pb-2 text-[10px] font-bold uppercase tracking-widest text-slate-400">Workspace</p><button onClick={() => setMode('ask')} className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-semibold ${mode === 'ask' ? 'bg-blue-50 text-blue-700' : 'text-slate-600 hover:bg-slate-50'}`}><Plus size={16} /> Ask a question</button><button onClick={() => setMode('enquiries')} className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-semibold ${mode === 'enquiries' ? 'bg-blue-50 text-blue-700' : 'text-slate-600 hover:bg-slate-50'}`}><Ticket size={16} /> My enquiries <span className="ml-auto rounded-full bg-slate-100 px-2 py-0.5 text-[10px]">{enquiries.length}</span></button></nav>
        <div className="mt-auto rounded-2xl bg-slate-50 p-4"><p className="text-xs font-semibold text-slate-700">Approved information sources</p><p className="mt-2 text-xs leading-5 text-slate-500">Responses use approved Stats SA sources. Unclear questions are escalated rather than guessed.</p></div>
      </aside>

      <section className="min-w-0 flex-1 px-4 py-4 sm:px-7 sm:py-6">
        <header className="flex items-end justify-between border-b border-slate-200 pb-5"><div><p className="text-[10px] font-bold uppercase tracking-[0.18em] text-blue-600">Public user dashboard</p><h1 className="mt-1 text-2xl font-bold tracking-tight">Ask Stats SA</h1><p className="mt-1 text-sm text-slate-500">Official statistics information desk</p></div><div className="flex items-center gap-2"><button onClick={startNewSession} className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-600 shadow-sm hover:border-blue-200 hover:text-blue-700"><Plus size={14} /> New question</button><div className="hidden items-center gap-2 rounded-full bg-white px-3 py-2 text-xs font-semibold text-slate-600 shadow-sm lg:flex"><Sparkles size={14} className="text-blue-600" /> Public workspace</div></div></header>

        {mode === 'enquiries' && <section className="mx-auto mt-6 w-full max-w-4xl"><div className="space-y-3"><div><h2 className="text-xl font-bold text-slate-900">My enquiries</h2><p className="mt-1 text-sm text-slate-500">Review what was asked, response status, dates, and manage each case.</p></div>{enquiries.map((enquiry) => <article key={enquiry.case_id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex flex-wrap items-start justify-between gap-4"><button onClick={() => openEnquiry(enquiry.case_id)} className="min-w-0 flex-1 text-left"><div className="flex flex-wrap items-center gap-2"><span className="text-[10px] font-bold uppercase tracking-[0.14em] text-blue-600">{enquiry.case_id}</span><StatusBadge status={enquiry.status} /></div><h3 className="mt-2 text-base font-bold text-slate-900">{enquiry.question}</h3></button><button onClick={() => deleteEnquiry(enquiry.case_id)} disabled={Boolean(deletingCaseId)} aria-label={`Delete case ${enquiry.case_id}`} className="inline-flex shrink-0 items-center gap-2 rounded-lg border border-red-200 px-3 py-2 text-xs font-bold text-red-700 hover:bg-red-50 disabled:opacity-60"><Trash2 size={14} />{deletingCaseId === enquiry.case_id ? 'Deleting…' : 'Delete case'}</button></div><dl className="mt-4 grid gap-3 border-t border-slate-100 pt-4 sm:grid-cols-3"><div><dt className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Asked</dt><dd className="mt-1 text-xs font-semibold text-slate-700">{formatDate(enquiry.created_at)}</dd></div><div><dt className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Last updated</dt><dd className="mt-1 text-xs font-semibold text-slate-700">{formatDate(enquiry.updated_at)}</dd></div><div><dt className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Response</dt><dd className="mt-1 line-clamp-2 text-xs text-slate-600">{enquiry.response ?? enquiry.progress}</dd></div></dl><div className="mt-4 flex flex-wrap justify-end gap-2"><button onClick={() => addClarification(enquiry.case_id)} className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-xs font-bold text-white hover:bg-blue-700"><Plus size={14} /> Amend / add information</button><button onClick={() => openEnquiry(enquiry.case_id)} className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50">Open case</button></div></article>)}</div></section>}
        <div className="mt-5 lg:hidden"><div className="grid grid-cols-2 gap-2 rounded-xl bg-slate-200/70 p-1"><button onClick={() => setMode('ask')} className={`rounded-lg px-3 py-2 text-xs font-bold ${mode === 'ask' ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-500'}`}>Ask a question</button><button onClick={() => setMode('enquiries')} className={`rounded-lg px-3 py-2 text-xs font-bold ${mode === 'enquiries' ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-500'}`}>My enquiries ({enquiries.length})</button></div></div>

        {mode === 'ask' && <div className="mx-auto mt-3 grid w-full max-w-5xl gap-4 lg:grid-cols-[minmax(0,1fr)_280px] lg:items-start"><section className="min-w-0 overflow-hidden rounded-3xl border border-slate-200 bg-[#e9f0fa] shadow-sm"><div className="border-b border-slate-200/80 bg-white/80 px-5 py-4"><div className="flex items-center justify-between"><div><p className="text-sm font-bold text-slate-800">Stats SA assistant</p><p className="text-xs text-slate-500">Official statistics information desk</p></div><span className="rounded-full bg-blue-50 px-2.5 py-1 text-[10px] font-bold text-blue-700">Approved information sources</span></div></div><div className="min-h-[360px] space-y-5 overflow-y-auto px-4 py-6 sm:px-7"><ConversationMessage type="assistant" label="Stats SA assistant">Hello. I can help you find information from approved Stats SA sources. Ask about population, employment, inflation, Census, or other published statistics.</ConversationMessage>{conversation && <><ConversationMessage type="user" label="You">{conversation.question}</ConversationMessage>{loading && <div className="mx-5 my-4 flex items-center gap-3 rounded-2xl border border-blue-200 bg-white px-4 py-3 text-sm text-slate-700 shadow-sm" role="status" aria-live="polite"><span className="relative flex h-3 w-3" aria-hidden="true"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-blue-400 opacity-70"/><span className="relative inline-flex h-3 w-3 rounded-full bg-blue-600"/></span><span><strong className="font-semibold text-slate-900">Checking approved Stats SA sources</strong><span className="ml-1 text-slate-500">Please wait while the assistant prepares your answer.</span></span></div>}<ConversationMessage type="assistant" label="Stats SA assistant"><p className={`mb-3 text-[10px] font-bold uppercase tracking-[0.14em] ${conversation.status === 'answered' ? 'text-blue-700' : 'text-amber-800'}`}>{conversation.status === 'answered' ? 'Information found' : 'No verified information found'}</p>{conversation.status === 'answered' ? <><p>{conversation.answer}</p><p className="mt-3 text-xs font-bold text-emerald-700">Answered from approved sources</p></> : <div className="rounded-xl border-2 border-amber-300 bg-amber-50 p-4 text-amber-950"><div className="flex items-center gap-2"><Clock3 size={16} className="text-amber-700" /><p className="text-xs font-bold uppercase tracking-[0.12em] text-amber-800">Official verification required</p></div><dl className="mt-3 space-y-2 text-xs"><div><dt className="font-bold text-amber-800">Current status</dt><dd className="mt-0.5 font-semibold">{conversation.escalated ? 'Escalated — awaiting Stats SA official review' : 'Unresolved — awaiting your escalation decision'}</dd></div><div><dt className="font-bold text-amber-800">Why it was escalated</dt><dd className="mt-0.5">No approved Stats SA source directly answers this exact question. Related publications are not used as an answer.</dd></div></dl><p className="mt-3 border-t border-amber-200 pt-3 text-xs leading-5">The AI has not provided an answer. Stats SA officials will be notified only when you choose “Yes, send for review.”</p></div>}{conversation.sources.length > 0 && <div className="mt-4 border-t border-slate-100 pt-3 text-xs">{conversation.status === 'answered' && <p className="font-bold">Evidence used</p>}{conversation.sources.map((source) => <p key={source.id} className="mt-1"><a href={source.source_url ?? 'https://www.statssa.gov.za/'} target="_blank" rel="noreferrer" className="font-semibold text-blue-700 underline decoration-blue-200 underline-offset-2 hover:text-blue-900">{source.title}</a><span className="ml-2 text-slate-400">· {source.publisher}</span></p>)}</div>}</ConversationMessage></>}</div><form onSubmit={(event) => askQuestion(event)} className="border-t border-slate-200 bg-white p-4"><label htmlFor="public-question" className="sr-only">Ask Stats SA</label><div className="flex gap-2"><input id="public-question" value={question} onChange={(event) => setQuestion(event.target.value)} placeholder={clarifyingCaseId ? 'Add clarification to this enquiry…' : 'Ask a question about Stats SA…'} className="min-w-0 flex-1 rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100" /><button type="submit" disabled={loading} className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-3 text-sm font-bold text-white hover:bg-blue-700 disabled:opacity-60"><Send size={15} /> Send</button></div>{error && <p className="mt-2 text-xs text-red-600">{error}</p>}</form></section><aside aria-labelledby="common-questions-title" className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm lg:sticky lg:top-6"><div className="flex items-start justify-between gap-3"><div><p className="text-[10px] font-bold uppercase tracking-[0.14em] text-emerald-700">Approved topics</p><h2 id="common-questions-title" className="mt-1 text-base font-bold text-slate-900">Common questions</h2><p className="mt-1 text-xs leading-5 text-slate-500">Start with trusted Stats SA information.</p></div><CheckCircle2 size={17} className="shrink-0 text-emerald-600" /></div><div className="mt-4 space-y-2">{approvedQuestions.map((item) => <button key={item.title} onClick={() => askQuestion(undefined, item.question)} disabled={loading} className="group w-full rounded-xl border border-slate-200 bg-slate-50/60 p-3 text-left transition hover:border-blue-300 hover:bg-white hover:shadow-sm disabled:opacity-60"><span className="block text-[10px] font-bold uppercase tracking-[0.1em] text-emerald-700">{item.category}</span><span className="mt-1 block text-sm font-semibold leading-5 text-slate-800 group-hover:text-blue-700">{item.title}</span><span className="mt-1 block text-[11px] text-slate-500">Get approved answer</span></button>)}</div></aside></div>}
      </section>
      {mode === 'enquiries' && selected && <div className="fixed bottom-5 right-5 z-20 flex flex-wrap justify-end gap-2"><button onClick={() => addClarification(selected.case_id)} className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-xs font-bold text-white shadow-lg hover:bg-blue-700"><Plus size={14} /> Add clarification</button><button onClick={() => deleteEnquiry(selected.case_id)} disabled={Boolean(deletingCaseId)} className="inline-flex items-center gap-2 rounded-xl border border-red-200 bg-white px-4 py-2.5 text-xs font-bold text-red-700 shadow-lg hover:bg-red-50 disabled:opacity-60"><Trash2 size={14} /> {deletingCaseId === selected.case_id ? 'Deleting…' : 'Delete this enquiry'}</button></div>}
      {loading && <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/55 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="ai-thinking-title"><div className="w-full max-w-sm rounded-3xl border border-white/20 bg-white p-7 text-center shadow-2xl"><div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-blue-50 text-blue-700"><span className="relative flex h-8 w-8 items-center justify-center"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-blue-400 opacity-50"/><Sparkles size={22} className="relative" /></span></div><h2 id="ai-thinking-title" className="mt-5 text-lg font-bold text-slate-900">Preparing your answer</h2><p className="mt-2 text-sm leading-6 text-slate-500">The AI is checking approved Stats SA sources and preparing a grounded response. Please wait.</p><div className="mt-5 h-1.5 overflow-hidden rounded-full bg-slate-100"><div className="h-full w-2/5 animate-[loading_1.4s_ease-in-out_infinite] rounded-full bg-blue-600" /></div><button type="button" onClick={cancelQuestion} className="mt-6 rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-bold text-slate-600 hover:bg-slate-50">Cancel query</button></div></div>}
      {duplicate && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/35 p-4" role="dialog" aria-modal="true" aria-labelledby="duplicate-title"><div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl"><div className="flex items-start gap-3"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-100 text-blue-700"><Ticket size={19} /></span><div><h2 id="duplicate-title" className="font-bold text-slate-900">You already asked something similar</h2><p className="mt-1 text-sm leading-6 text-slate-600">We found an existing enquiry, so we did not create a duplicate. Would you like to open it?</p></div></div><div className="mt-4 rounded-xl bg-slate-50 p-3 text-xs text-slate-600"><span className="font-bold text-slate-700">{duplicate.caseId}</span><p className="mt-1 line-clamp-3">{duplicate.question}</p><p className="mt-2 text-slate-400">Updated {formatDate(duplicate.updatedAt)}</p></div><div className="mt-5 flex justify-end gap-2"><button onClick={() => setDuplicate(null)} className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-bold text-slate-600 hover:bg-slate-50">Keep chatting</button><button onClick={() => openEnquiry(duplicate.caseId)} className="rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-blue-700">Open enquiry</button></div></div></div>}
      {pendingEscalation && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/35 p-4" role="dialog" aria-modal="true" aria-labelledby="escalation-title"><div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl"><div className="flex items-start gap-3"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-700"><Clock3 size={19} /></span><div><h2 id="escalation-title" className="font-bold text-slate-900">This question needs official review</h2><p className="mt-1 text-sm leading-6 text-slate-600">No approved Stats SA source was strong enough to answer it. Would you like to send it to an official for review?</p></div></div><div className="mt-4 rounded-xl bg-slate-50 p-3 text-xs text-slate-600"><span className="font-bold text-slate-700">Case {pendingEscalation.caseId}</span><p className="mt-1 line-clamp-2">{pendingEscalation.question}</p></div><div className="mt-5 flex justify-end gap-2"><button onClick={() => setPendingEscalation(null)} className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-bold text-slate-600 hover:bg-slate-50">Cancel</button><button onClick={confirmEscalation} disabled={loading} className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-blue-700 disabled:opacity-60">{loading && <Loader2 size={15} className="animate-spin" />} Yes, send for review</button></div></div></div>}
    </div>
  </main>
}

export const role = 'Public User'
export const access = ['Ask grounded questions', 'Track escalations', 'Review citations']
