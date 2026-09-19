import { createOpenAI } from '@ai-sdk/openai'
import { generateText } from 'ai'

const selfHostedAI = createOpenAI({
  baseURL: process.env.SELF_HOSTED_AI_BASE_URL ?? 'http://localhost:11434/v1',
  apiKey: process.env.SELF_HOSTED_AI_API_KEY ?? 'ollama',
})
import { createClient } from '@supabase/supabase-js'

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SECRET_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
  return url && key ? createClient(url, key) : null
}

function toCase(item: any, sources: any[]) {
  const question = item.question ?? ''
  const normalizedQuestion = question.toLowerCase()
  const sourceMatches = sources.filter((source) => {
    const titleTerms = String(source.title ?? '').toLowerCase().split(/\s+/).filter((term) => term.length > 3 && !['official', 'statistics', 'south', 'africa', 'pdf'].includes(term))
    const titleMatch = titleTerms.filter((term) => normalizedQuestion.includes(term)).length
    const contentMatch = `${source.title} ${source.content ?? ''}`.toLowerCase().split(/\s+/).some((term) => term.length > 4 && normalizedQuestion.includes(term))
    return titleMatch >= 2 || (titleMatch >= 1 && /\b(pdf|document|policy|questionnaire|publication)\b/.test(normalizedQuestion)) || contentMatch
  })
  const status = item.status === 'answered' ? 'Approved' : item.status === 'in_review' ? 'Awaiting review' : item.status === 'escalated' ? 'Awaiting review' : item.status === 'rejected' ? 'Rejected' : 'Needs edits'
  const priority = item.status === 'escalated' || item.status === 'in_review' ? 'High' : item.question.length > 160 ? 'Medium' : 'Low'
  return { id: item.case_reference, title: question.length > 72 ? `${question.slice(0, 69)}…` : question, requester: 'Public user', received: new Date(item.created_at).toLocaleString(), date: item.created_at.slice(0, 10), status, priority, confidence: item.answer ? '91%' : '—', question, answer: item.answer ?? '', sources: sourceMatches.slice(0, 4).map((source) => ({ title: source.title, detail: `Stats SA${source.published_at ? ` · Published ${source.published_at}` : ''}`, excerpt: source.content ?? source.topic, url: source.source_url ?? 'https://www.statssa.gov.za/' })) }
}

export async function GET() {
  const supabase = getSupabase()
  if (!supabase) return Response.json({ error: 'The communications data service is not configured.' }, { status: 503 })
  const [{ data: enquiries, error: enquiryError }, { data: sources, error: sourceError }] = await Promise.all([
    supabase.from('public_queries').select('id,case_reference,question,answer,status,created_at,updated_at').in('status', ['escalated', 'in_review', 'needs_edits']).order('created_at', { ascending: false }),
    supabase.from('stats_sa_sources').select('id,title,content,published_at,source_url,approved').eq('approved', true).order('published_at', { ascending: false }),
  ])
  if (enquiryError || sourceError) return Response.json({ error: 'Live communications data could not be loaded.' }, { status: 503 })
  return Response.json({ cases: (enquiries ?? []).map((item) => toCase(item, sources ?? [])), sources: sources ?? [] })
}

export async function PATCH(request: Request) {
  const body = await request.json().catch(() => null)
  const caseId = typeof body?.caseId === 'string' ? body.caseId : ''
  const status = typeof body?.status === 'string' ? body.status : ''
  const answer = typeof body?.answer === 'string' ? body.answer.trim() : ''
  if (!caseId || !status) return Response.json({ error: 'Case and status are required.' }, { status: 400 })
  const supabase = getSupabase()
  if (!supabase) return Response.json({ error: 'The communications data service is not configured.' }, { status: 503 })
  const mappedStatus = status === 'Approved' ? 'answered' : status === 'Rejected' ? 'rejected' : status === 'Awaiting review' ? 'in_review' : 'needs_edits'
  const { data: updatedCase, error } = await supabase.from('public_queries').update({ status: mappedStatus, answer: answer || null, updated_at: new Date().toISOString() }).eq('case_reference', caseId).select('case_reference,question,answer,status,updated_at').single()
  if (error || !updatedCase) return Response.json({ error: 'The case could not be updated.' }, { status: 503 })
  return Response.json({ ok: true, caseId: updatedCase.case_reference, question: updatedCase.question, answer: updatedCase.answer, status: updatedCase.status, message: mappedStatus === 'answered' ? 'The approved response is now attached to the original query.' : 'The original query remains linked to this case.' })
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null)
  const question = typeof body?.question === 'string' ? body.question.trim() : ''
  const answer = typeof body?.answer === 'string' ? body.answer : ''
  const sources = Array.isArray(body?.sources) ? body.sources : []
  const cases = Array.isArray(body?.cases) ? body.cases : []
  const selectedCase = body?.selectedCase ?? null
  if (!question) return Response.json({ error: 'A question is required.' }, { status: 400 })
  try {
    const approvedSources = sources.length ? sources : [{ title: 'Stats SA official information', source_url: 'https://www.statssa.gov.za/', content: 'Official Statistics South Africa website' }]
    const prompt = `You are preparing a DRAFT response for a Stats SA Communications Official to review. For a case-drafting request, answer the original public question using the supplied approved source evidence. If the source content directly answers the question, provide the answer and cite the source title and exact supplied URL. Do not say the information is unavailable merely because the case was escalated. If the supplied evidence genuinely does not answer it, state that clearly. Never approve or release a response; human approval remains mandatory. Respond conversationally and concisely, as if speaking aloud. Analyze the escalated case queue and approved Stats SA sources supplied in context. If asked about a case, identify its case ID, status, requester, question, existing draft, priority, and next action. Never invent facts, never approve or release a response, and clearly say when the available context is insufficient. When using a source, cite it by title and include a final Sources section with the full official URL on its own line so it is clickable. Use markdown links in this exact format: [Source title](official URL). Only link to URLs supplied in the approved Stats SA sources or https://www.statssa.gov.za/. Human approval remains mandatory.\n\nOfficial voice question:\n${question}\n\nCurrently selected case:\n${JSON.stringify(selectedCase)}\n\nEscalated case queue:\n${JSON.stringify(cases)}\n\nApproved Stats SA sources:\n${JSON.stringify(approvedSources)}\n\nExisting draft context:\n${answer}`
    const result = await generateText({ model: selfHostedAI(process.env.SELF_HOSTED_AI_MODEL ?? 'qwen2.5:7b'), system: 'You are preparing a DRAFT response for a Stats SA Communications Official to review. For a case-drafting request, answer the original public question using the supplied approved source evidence. If the source content directly answers the question, provide the answer and cite the source title and exact supplied URL. Do not say the information is unavailable merely because the case was escalated. If the supplied evidence genuinely does not answer it, state that clearly. Never approve or release a response; human approval remains mandatory. Respond conversationally and concisely, as if speaking aloud. Analyze the escalated case queue and approved Stats SA sources supplied in context. If asked about a case, identify its case ID, status, requester, question, existing draft, priority, and next action. Never invent facts, never approve or release a response, and clearly say when the available context is insufficient. When using a source, cite it by title and include a final Sources section with the full official URL on its own line so it is clickable. Use markdown links in this exact format: [Source title](official URL). Only link to URLs supplied in the approved Stats SA sources or https://www.statssa.gov.za/. Human approval remains mandatory.', prompt })
    return Response.json({ answer: result.text })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error('[v0] Communications AI request failed:', message)
    const retryable = message.toLowerCase().includes('quota') || message.toLowerCase().includes('rate') || message.toLowerCase().includes('503')
    return Response.json({ error: retryable ? 'The self-hosted AI server is temporarily unavailable. Please try again.' : 'The self-hosted AI server could not complete this request. Check the Ollama or vLLM connection.' }, { status: 503 })
  }
}

export const runtime = 'nodejs'
