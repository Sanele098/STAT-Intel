import { createOpenAI } from '@ai-sdk/openai'
import { generateText } from 'ai'

const selfHostedAI = createOpenAI({
  baseURL: process.env.SELF_HOSTED_AI_BASE_URL ?? 'http://localhost:11434/v1',
  apiKey: process.env.SELF_HOSTED_AI_API_KEY ?? 'ollama',
})
import { createClient } from '@supabase/supabase-js'

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SECRET_KEY
  return url && key ? createClient(url, key) : null
}

export async function GET(request: Request) {
  const supabase = getSupabase()
  if (!supabase) return Response.json({ error: 'Media query service is not configured.' }, { status: 503 })
  const mediaHouse = new URL(request.url).searchParams.get('mediaHouse')
  const { data, error } = await supabase.from('public_queries').select('id,case_reference,question,answer,status,created_at,updated_at').eq('query_channel', 'media').eq('escalation_reason', `media-house:${mediaHouse ?? ''}`).order('created_at', { ascending: false })
  if (error) return Response.json({ error: 'Media queries could not be loaded.' }, { status: 503 })
  return Response.json({ queries: data ?? [] })
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null)
  const question = typeof body?.question === 'string' ? body.question.trim() : ''
  if (!question || question.length < 10) return Response.json({ error: 'Please provide a detailed media question.' }, { status: 400 })
  const supabase = getSupabase()
  if (!supabase) return Response.json({ error: 'Media query service is not configured.' }, { status: 503 })
  const mediaHouse = typeof body?.mediaHouse === 'string' ? body.mediaHouse.trim() : ''
  if (!mediaHouse) return Response.json({ error: 'Please select a media house.' }, { status: 400 })
  const { data: house } = await supabase.from('media_houses').select('id,name,status').eq('name', mediaHouse).maybeSingle()
  if (!house || house.status !== 'approved') return Response.json({ error: 'This media house is not approved.' }, { status: 403 })
  const normalizedQuestion = question.toLowerCase().replace(/[^a-z0-9\\s']/g, ' ').replace(/\\s+/g, ' ').trim()
  const { data: recentMediaQueries, error: duplicateLookupError } = await supabase.from('public_queries').select('case_reference,question,status,answer,updated_at').eq('query_channel', 'media').eq('media_house_id', house.id).order('created_at', { ascending: false }).limit(100)
  if (duplicateLookupError) return Response.json({ error: 'Existing media queries could not be checked.' }, { status: 503 })
  const questionTerms = new Set(normalizedQuestion.split(/\\s+/).filter((term: string) => term.length > 2))
  const duplicate = (recentMediaQueries ?? []).find((item) => {
    const existingNormalized = item.question.toLowerCase().replace(/[^a-z0-9\\s']/g, ' ').replace(/\\s+/g, ' ').trim()
    if (existingNormalized === normalizedQuestion) return true
    const existingTerms = new Set(existingNormalized.split(/\\s+/).filter((term: string) => term.length > 2))
    const overlap = [...questionTerms].filter((term) => existingTerms.has(term)).length
    return Math.max(questionTerms.size, existingTerms.size) > 1 && overlap / Math.max(questionTerms.size, existingTerms.size) >= 0.65
  })
  if (duplicate) return Response.json({ duplicate: { caseId: duplicate.case_reference, question: duplicate.question, status: duplicate.status, answer: duplicate.answer, updatedAt: duplicate.updated_at } })
  const caseReference = `MED-${Math.floor(100000 + Math.random() * 900000)}`
  const { data: sources } = await supabase.from('stats_sa_sources').select('title,content,published_at,source_url,approved').eq('approved', true).order('published_at', { ascending: false }).limit(50)
  let draft = 'A Communications Official must review and approve this media response before release.'
  try {
    const result = await generateText({ model: selfHostedAI(process.env.SELF_HOSTED_AI_MODEL ?? 'qwen2.5:7b'), system: 'You prepare a polished internal draft for a Stats SA Communications Official responding to a media house. Use only the supplied approved sources. Never invent figures or claim official approval. Return exactly this structure: SUBJECT: concise subject; DRAFT RESPONSE: a clear, publication-ready answer; SOURCE: source title and exact URL; EVIDENCE NOTE: relevant page, table, or limitation. If the sources do not answer the question, say EVIDENCE GAP and explain what must be verified. This remains a draft until an official approves it.', prompt: `Media question:\n${question}\n\nApproved sources:\n${JSON.stringify(sources ?? [])}` })
    draft = result.text
  } catch {
    draft = 'AI draft unavailable. Communications Official must prepare the response from approved sources.'
  }
  const { data, error } = await supabase.from('public_queries').insert({ case_reference: caseReference, question, answer: draft, status: 'in_review', media_house_id: house.id, query_channel: 'media', escalation_reason: `media-house:${house.name}` }).select('case_reference,question,answer,status,created_at').single()
  if (error) return Response.json({ error: 'The query could not be submitted.' }, { status: 503 })
  return Response.json({ query: data, message: 'Your question was submitted with an AI-prepared draft for Communications review and approval.' }, { status: 201 })
}
