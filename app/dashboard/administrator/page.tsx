import Link from 'next/link'
import { ArrowLeft, ShieldCheck, Users } from 'lucide-react'

export default function AdministratorDashboardPage() {
  return <main className="min-h-screen bg-[#f7f9fc] px-5 py-6 text-slate-900 sm:px-8 lg:px-12"><div className="mx-auto max-w-6xl space-y-6"><Link href="/" className="inline-flex items-center gap-2 text-xs font-semibold text-slate-500 hover:text-blue-700"><ArrowLeft size={14}/> All workspaces</Link><header><div className="flex items-center gap-3"><span className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-200 text-slate-700"><ShieldCheck size={19}/></span><div><p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-600">Restricted access</p><h1 className="text-2xl font-bold tracking-tight">Administration</h1></div></div><p className="mt-2 text-sm text-slate-500">Manage users, roles and system access.</p></header><section className="grid gap-4 sm:grid-cols-3">{[['Active users','38'],['Roles','5'],['Audit events','1,284']].map(([label,value]) => <div key={label} className="rounded-2xl border border-slate-200 bg-white p-5"><Users size={18} className="text-slate-600"/><p className="mt-4 text-xs text-slate-500">{label}</p><p className="mt-1 text-3xl font-bold">{value}</p></div>)}</section><section className="rounded-2xl border border-slate-200 bg-white p-5"><h2 className="text-sm font-semibold">Access control</h2><p className="mt-2 text-xs text-slate-500">Only authorised administrators can change permissions.</p></section></div></main>
}

export const role = 'Administrator'
export const access = ['Overview', 'Users & Roles', 'Audit Logs']
