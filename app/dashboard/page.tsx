import Link from 'next/link'
import { ArrowUpRight, BookOpen, ChevronDown, Command, HelpCircle, History, Megaphone, Newspaper, Plus, Settings, Users } from 'lucide-react'

const userWorkspaces = [
  { href: '/dashboard/public', label: 'Public Facing', description: 'Ask questions and explore trusted answers.', icon: Users, tone: 'from-slate-100 to-white text-slate-700' },
  { href: '/dashboard/media', label: 'Media House', description: 'Manage media queries and approved responses.', icon: Newspaper, tone: 'from-slate-100 to-white text-slate-700' },
]

const officialWorkspaces = [
  { href: '/dashboard/communications', label: 'Communications Official', description: 'Review cases, sources, and outgoing drafts.', icon: Megaphone, tone: 'from-slate-100 to-white text-slate-700' },
  { href: '/dashboard/knowledge', label: 'Knowledge Manager', description: 'Maintain trusted sources and data quality.', icon: BookOpen, tone: 'from-slate-100 to-white text-slate-700' },
]

function WorkspaceGroup({ title, description, items, tone }: { title: string; description: string; items: typeof officialWorkspaces; tone: 'emerald' | 'blue' }) {
  return (
    <div className={`rounded-2xl border p-3 sm:p-4 border-slate-200 bg-slate-50/70 shadow-[0_12px_32px_rgba(15,23,42,0.06)]`}>
      <div className="mb-2"><h3 className="text-xs font-bold tracking-[0.16em] text-slate-700">{title}</h3><p className="mt-1 text-xs text-slate-500">{description}</p></div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {items.map(({ href, label, description: itemDescription, icon: Icon, tone: cardTone }) => (
          <Link key={href} href={href} className="group flex min-h-[112px] flex-col rounded-xl border border-slate-200 bg-white p-3 shadow-[0_5px_18px_rgba(15,23,42,0.06)] transition hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-[0_14px_30px_rgba(15,23,42,0.12)]">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 text-slate-600 shadow-inner"><Icon size={18} /></div>
            <div className="mt-2.5 flex items-start justify-between gap-2"><div><h4 className="text-sm font-semibold">{label}</h4><p className="mt-1 text-xs leading-4 text-slate-500">{itemDescription}</p></div><ArrowUpRight size={15} className="shrink-0 text-slate-300 transition group-hover:text-slate-900" /></div>
          </Link>
        ))}
      </div>
    </div>
  )
}

export default function DashboardIndexPage() {
  return (
    <main className="min-h-screen overflow-hidden bg-[#f8faff] text-slate-900">
      <div className="mx-auto flex min-h-screen w-full max-w-[1180px] flex-col bg-white shadow-[0_18px_70px_rgba(71,85,105,0.12)] lg:my-3 lg:min-h-[calc(100vh-24px)] lg:rounded-[18px]">
        <div className="flex flex-1">
          <aside className="hidden w-[74px] shrink-0 flex-col items-center border-r border-slate-100 bg-[#f4f7fb] py-5 md:flex">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-white text-slate-500 shadow-sm"><Command size={17} /></div>
            <button aria-label="New workspace" className="mt-7 flex h-9 w-9 items-center justify-center rounded-full bg-slate-900 text-white shadow-sm transition hover:scale-105"><Plus size={18} /></button>
            <div className="mt-auto flex flex-col gap-5 text-slate-400">
              <button aria-label="Help" className="transition hover:text-slate-700"><HelpCircle size={16} /></button>
              <button aria-label="History" className="transition hover:text-slate-700"><History size={16} /></button>
              <button aria-label="Settings" className="transition hover:text-slate-700"><Settings size={16} /></button>
            </div>
          </aside>

          <div className="flex min-w-0 flex-1 flex-col">
            <header className="flex items-center justify-between px-5 py-3 sm:px-8">
              <div className="flex min-w-0 items-center gap-3 text-sm font-medium text-slate-700"><img src="/images/stats-sa-logo.png" alt="Statistics South Africa" className="h-30 w-auto max-w-[210px] object-contain" /><ChevronDown size={14} className="shrink-0 text-slate-400" /></div>
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-blue-300 to-violet-400 text-[10px] font-bold text-white">SA</div>
            </header>

            <section className="mx-auto flex w-full max-w-[980px] flex-1 flex-col px-5 pb-4 pt-3 sm:px-8 sm:pt-5 lg:pt-6">
              <div className="text-center">
                <p className="text-xl font-semibold tracking-tight sm:text-2xl"><span className="bg-gradient-to-r from-blue-500 via-violet-500 to-rose-400 bg-clip-text text-transparent">Hello & Welcome to STAT-Intel</span></p>
                <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-300 sm:text-3xl">What can we do for you today?</h1>
              </div>

              <section className="mt-5 space-y-3" aria-labelledby="workspaces-heading">
                <div className="flex items-center justify-between"><div><p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">Role access</p><h2 id="workspaces-heading" className="mt-1 text-lg font-semibold">Choose a workspace</h2></div><span className="text-xs text-slate-400">4 available</span></div>
                <div className="grid gap-3 lg:grid-cols-2">
                  <WorkspaceGroup title="STATS-SA OFFICIALS" description="Approved communications and knowledge management." items={officialWorkspaces} tone="emerald" />
                  <WorkspaceGroup title="NORMAL USERS / PUBLIC FACING" description="Trusted information and approved responses." items={userWorkspaces} tone="blue" />
                </div>
              </section>

              <p className="mt-auto pt-4 text-center text-[10px] text-slate-400">Stats SA Intelligence may provide inaccurate information. Verify responses against approved sources.</p>
            </section>
          </div>
        </div>
      </div>
    </main>
  )
}

