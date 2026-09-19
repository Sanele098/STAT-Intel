'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'
import {
  AlertTriangle,
  ArrowLeft,
  BookOpen,
  Check,
  CheckCircle2,
  ChevronRight,
  ClipboardCheck,
  Clock3,
  ExternalLink,
  FileCheck2,
  FileText,
  Filter,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  Sparkles,
  X,
} from 'lucide-react'

type SourceStatus = 'Approved' | 'Pending review' | 'Needs update' | 'Rejected'
type Source = {
  id: string
  title: string
  topic: string
  publisher: string
  published: string
  format: 'PDF' | 'Web'
  url: string
  status: SourceStatus
  quality: number
  freshness: string
  note: string
}

const initialSources: Source[] = [
  { id: 'SRC-001', title: 'Census 2022 Statistical Release (P0301.4)', topic: 'Census and population', publisher: 'Statistics South Africa', published: '10 Oct 2023', format: 'PDF', url: 'https://www.statssa.gov.za/publications/P03014/P030142022.pdf', status: 'Approved', quality: 98, freshness: 'Current', note: 'Direct PDF verified; supports Census 2022 claims only.' },
  { id: 'SRC-002', title: 'Quarterly Labour Force Survey Q4 2023 (P0211)', topic: 'Employment and labour', publisher: 'Statistics South Africa', published: '13 Feb 2024', format: 'PDF', url: 'https://www.statssa.gov.za/publications/P02114/P021144thQuarter2023.pdf', status: 'Approved', quality: 96, freshness: 'Current', note: 'Release period is explicit; suitable for Q4 2023 questions.' },
  { id: 'SRC-003', title: 'Consumer Price Index publications', topic: 'Inflation and prices', publisher: 'Statistics South Africa', published: 'Monthly', format: 'Web', url: 'https://www.statssa.gov.za/?page_id=1856', status: 'Pending review', quality: 84, freshness: 'Review needed', note: 'Publication landing page; add the exact monthly PDF before answering period-specific questions.' },
  { id: 'SRC-004', title: 'Statistics South Africa official website', topic: 'General reference', publisher: 'Statistics South Africa', published: '19 Sep 2026', format: 'Web', url: 'https://www.statssa.gov.za/', status: 'Approved', quality: 91, freshness: 'Current', note: 'Official directory and fallback citation only; not evidence for specific statistics.' },
  { id: 'SRC-005', title: 'Census 2030 planning information', topic: 'Census and population', publisher: 'Unverified web result', published: 'Unknown', format: 'Web', url: 'https://www.statssa.gov.za/', status: 'Needs update', quality: 42, freshness: 'Insufficient evidence', note: 'Does not directly support a Census 2030 statistic. Keep out of answerable evidence.' },
]

const statusStyles: Record<SourceStatus, string> = {
  Approved: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  'Pending review': 'bg-amber-50 text-amber-800 border-amber-200',
  'Needs update': 'bg-orange-50 text-orange-800 border-orange-200',
  Rejected: 'bg-rose-50 text-rose-700 border-rose-200',
}

export default function KnowledgeDashboardPage() {
  const [sources, setSources] = useState(initialSources)
  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<'All' | SourceStatus>('All')
  const [selectedId, setSelectedId] = useState('SRC-001')
  const [notice, setNotice] = useState('')
  const selected = sources.find((source) => source.id === selectedId) ?? sources[0]
  const filteredSources = useMemo(() => sources.filter((source) => {
    const matchesQuery = `${source.title} ${source.topic} ${source.publisher}`.toLowerCase().includes(query.toLowerCase())
    return matchesQuery && (statusFilter === 'All' || source.status === statusFilter)
  }), [query, sources, statusFilter])
  const approved = sources.filter((source) => source.status === 'Approved').length
  const pending = sources.filter((source) => source.status === 'Pending review').length
  const attention = sources.filter((source) => source.status === 'Needs update').length
  const updateSource = (id: string, status: SourceStatus, message: string) => {
    setSources((current) => current.map((source) => source.id === id ? { ...source, status } : source))
    setNotice(message)
    window.setTimeout(() => setNotice(''), 3500)
  }

  return <main className="min-h-screen bg-[#f7f9fc] px-5 py-6 text-slate-900 sm:px-8 lg:px-12"><div className="mx-auto max-w-7xl space-y-6">
    <Link href="/" className="inline-flex items-center gap-2 text-xs font-semibold text-slate-500 hover:text-blue-700"><ArrowLeft size={14}/> All workspaces</Link>
    <header className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end"><div><div className="flex items-center gap-3"><span className="flex h-11 w-11 items-center justify-center rounded-xl bg-amber-100 text-amber-700"><BookOpen size={20}/></span><div><p className="text-[10px] font-bold uppercase tracking-[0.18em] text-amber-600">Governance workspace</p><h1 className="text-2xl font-bold tracking-tight">Knowledge Manager</h1></div></div><p className="mt-2 max-w-2xl text-sm text-slate-500">Maintain trusted sources, approve evidence, and protect answer quality before information reaches the public assistant.</p></div><button type="button" onClick={() => setNotice('Source intake is ready for the next approved Stats SA URL or PDF.')} className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-xs font-bold text-white hover:bg-slate-700"><Plus size={15}/> Add source</button></header>
    {notice && <div className="flex items-center gap-2 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm font-semibold text-blue-900" role="status"><CheckCircle2 size={16}/> {notice}</div>}
    <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{[{ label: 'Approved sources', value: approved, icon: ShieldCheck, detail: 'Evidence available to AI' }, { label: 'Pending review', value: pending, icon: Clock3, detail: 'Requires human approval' }, { label: 'Needs attention', value: attention, icon: AlertTriangle, detail: 'Blocked from answers' }, { label: 'AI evidence coverage', value: '92%', icon: Sparkles, detail: 'Exact-topic grounding' }].map(({ label, value, icon: Icon, detail }) => <div key={label} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex items-center justify-between"><Icon size={18} className="text-blue-700"/><span className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400">Live</span></div><p className="mt-5 text-xs text-slate-500">{label}</p><p className="mt-1 text-3xl font-bold">{value}</p><p className="mt-1 text-[11px] text-slate-400">{detail}</p></div>)}</section>
    <section className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_350px]">
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"><div className="flex flex-col gap-3 border-b border-slate-200 p-4 lg:flex-row lg:items-center"><div><h2 className="flex items-center gap-2 text-sm font-bold"><FileCheck2 size={16} className="text-blue-700"/> Trusted source register</h2><p className="mt-1 text-xs text-slate-500">Only approved sources can ground an answer.</p></div><div className="flex flex-1 flex-wrap gap-2 lg:justify-end"><label className="relative min-w-[190px] flex-1 lg:max-w-xs"><Search size={14} className="absolute left-3 top-2.5 text-slate-400"/><span className="sr-only">Search sources</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search sources" className="w-full rounded-lg border border-slate-200 py-2 pl-8 pr-3 text-xs outline-none focus:border-blue-500"/></label><label className="relative"><Filter size={14} className="absolute left-2.5 top-2.5 text-slate-400"/><span className="sr-only">Filter status</span><select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as 'All' | SourceStatus)} className="appearance-none rounded-lg border border-slate-200 py-2 pl-8 pr-7 text-xs font-semibold outline-none"><option>All</option><option>Approved</option><option>Pending review</option><option>Needs update</option><option>Rejected</option></select></label></div></div><div className="overflow-x-auto"><table className="w-full min-w-[760px] text-left"><thead className="bg-slate-50 text-[10px] uppercase tracking-[0.12em] text-slate-400"><tr><th className="px-5 py-3">Source</th><th className="px-5 py-3">Topic</th><th className="px-5 py-3">Quality</th><th className="px-5 py-3">Status</th><th className="px-5 py-3"/></tr></thead><tbody className="divide-y divide-slate-100">{filteredSources.map((source) => <tr key={source.id} onClick={() => setSelectedId(source.id)} className={`cursor-pointer transition hover:bg-blue-50/50 ${selectedId === source.id ? 'bg-blue-50/40' : ''}`}><td className="px-5 py-4"><p className="text-[10px] font-bold text-slate-400">{source.id} · {source.format}</p><p className="mt-1 max-w-xs text-sm font-semibold">{source.title}</p><p className="mt-1 text-xs text-slate-500">{source.publisher}</p></td><td className="px-5 py-4 text-xs text-slate-600">{source.topic}</td><td className="px-5 py-4"><p className="text-sm font-bold">{source.quality}%</p><div className="mt-1 h-1.5 w-20 rounded-full bg-slate-100"><div className={`h-1.5 rounded-full ${source.quality >= 90 ? 'bg-emerald-500' : source.quality >= 70 ? 'bg-amber-500' : 'bg-orange-500'}`} style={{ width: `${source.quality}%` }}/></div></td><td className="px-5 py-4"><span className={`rounded-full border px-2 py-1 text-[10px] font-bold ${statusStyles[source.status]}`}>{source.status}</span></td><td className="px-5 py-4 text-slate-400"><ChevronRight size={16}/></td></tr>)}</tbody></table></div></div>
      <aside className="space-y-4"><section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex items-start justify-between gap-3"><div><p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">Selected source</p><h2 className="mt-1 text-sm font-bold leading-5">{selected.title}</h2></div><span className={`rounded-full border px-2 py-1 text-[10px] font-bold ${statusStyles[selected.status]}`}>{selected.status}</span></div><dl className="mt-5 space-y-3 text-xs"><div><dt className="font-bold text-slate-500">Publication</dt><dd className="mt-1 text-slate-700">{selected.published} · {selected.format}</dd></div><div><dt className="font-bold text-slate-500">Freshness</dt><dd className="mt-1 text-slate-700">{selected.freshness}</dd></div><div><dt className="font-bold text-slate-500">AI quality note</dt><dd className="mt-1 leading-5 text-slate-600">{selected.note}</dd></div></dl><a href={selected.url} target="_blank" rel="noreferrer" className="mt-5 inline-flex items-center gap-2 text-xs font-bold text-blue-700 underline underline-offset-2">Open official source <ExternalLink size={13}/></a><div className="mt-5 grid grid-cols-2 gap-2">{selected.status !== 'Approved' && <button type="button" onClick={() => updateSource(selected.id, 'Approved', `${selected.id} approved and available to the AI.`)} className="inline-flex items-center justify-center gap-1 rounded-lg bg-emerald-600 px-3 py-2 text-[11px] font-bold text-white hover:bg-emerald-700"><Check size={13}/> Approve</button>}{selected.status === 'Approved' && <button type="button" onClick={() => updateSource(selected.id, 'Needs update', `${selected.id} moved to Needs update and blocked from new answers.`)} className="inline-flex items-center justify-center gap-1 rounded-lg bg-orange-500 px-3 py-2 text-[11px] font-bold text-white hover:bg-orange-600"><RefreshCw size={13}/> Request update</button>}<button type="button" onClick={() => updateSource(selected.id, 'Rejected', `${selected.id} rejected and excluded from AI evidence.`)} className="inline-flex items-center justify-center gap-1 rounded-lg border border-rose-200 px-3 py-2 text-[11px] font-bold text-rose-700 hover:bg-rose-50"><X size={13}/> Reject</button></div></section><section className="rounded-2xl border border-amber-200 bg-amber-50 p-5"><h2 className="flex items-center gap-2 text-sm font-bold text-amber-950"><Sparkles size={16} className="text-amber-700"/> AI data-quality checks</h2><ul className="mt-3 space-y-2 text-xs leading-5 text-amber-900"><li>Checks that the title, topic, publisher, date, and URL are present.</li><li>Blocks unrelated sources from exact-year questions.</li><li>Flags web pages when a direct PDF is available.</li><li>Requires human approval before a source becomes answerable.</li></ul></section></aside>
    </section>
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><h2 className="flex items-center gap-2 text-sm font-bold"><ClipboardCheck size={16} className="text-blue-700"/> Approval workflow</h2><div className="mt-4 grid gap-3 md:grid-cols-4">{[['1', 'Ingest', 'Add an official Stats SA page or PDF.'], ['2', 'Validate', 'Check publisher, date, URL, topic, and evidence scope.'], ['3', 'Approve', 'A Knowledge Manager makes the source answerable.'], ['4', 'Monitor', 'Review freshness and block stale evidence.']].map(([number, title, description]) => <div key={number} className="rounded-xl border border-slate-100 bg-slate-50 p-4"><span className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-900 text-xs font-bold text-white">{number}</span><p className="mt-3 text-xs font-bold">{title}</p><p className="mt-1 text-xs leading-5 text-slate-500">{description}</p></div>)}</div></section>
  </div></main>
}

export const role = 'Knowledge Manager'
export const access = ['Overview', 'Knowledge Sources', 'Approval Queue']
