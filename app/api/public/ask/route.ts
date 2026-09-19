import { createOpenAI } from '@ai-sdk/openai'
import { generateText } from 'ai'

const selfHostedAI = createOpenAI({
  baseURL: process.env.SELF_HOSTED_AI_BASE_URL ?? 'http://localhost:11434/v1',
  apiKey: process.env.SELF_HOSTED_AI_API_KEY ?? 'ollama',
})
import { createClient } from '@supabase/supabase-js'

function getSupabase() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!supabaseUrl || !supabaseKey) return null
  return createClient(supabaseUrl, supabaseKey)
}

export async function GET() {
  const supabase = getSupabase()
  if (!supabase) return Response.json({ error: 'The Stats SA data service is not configured.' }, { status: 503 })
  const [{ data: enquiries, error: enquiriesError }, { data: sources, error: sourcesError }] = await Promise.all([
    supabase.from('public_queries').select('id,case_reference,question,answer,status,escalation_reason,created_at,updated_at').order('created_at', { ascending: false }),
    supabase.from('statsa_knowledge_sources').select('id,title,topic,source_url,source_date').order('source_date', { ascending: false }),
  ])
  if (enquiriesError || sourcesError) return Response.json({ error: 'Supabase data could not be loaded.' }, { status: 503 })
  const { data: links, error: linksError } = await supabase.from('public_query_sources').select('query_id,source_id')
  if (linksError) return Response.json({ error: 'Supabase source links could not be loaded.' }, { status: 503 })
  const sourceIdsByQuery = new Map<string, string[]>()
  for (const link of links ?? []) sourceIdsByQuery.set(link.query_id, [...(sourceIdsByQuery.get(link.query_id) ?? []), link.source_id])
  return Response.json({
    enquiries: (enquiries ?? []).map((item) => ({
      case_id: item.case_reference,
      question: item.question,
      status: item.status,
      response: item.answer,
      escalation_reason: item.escalation_reason,
      progress: item.status === 'escalated' || item.status === 'in_review' ? 'Awaiting official review' : item.status === 'answered' ? 'Answered from approved Stats SA source data' : 'Requires case action',
      updated_at: item.updated_at,
      created_at: item.created_at,
      source_ids: sourceIdsByQuery.get(item.id) ?? [],
    })),
    sources: sources ?? [],
  })
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null)
  const cleanedQuestion = typeof body?.question === 'string' ? body.question.trim() : ''
  const allowEscalation = body?.allowEscalation === true
  const existingCaseId = typeof body?.caseId === 'string' ? body.caseId : ''
  if (!cleanedQuestion || cleanedQuestion.length > 1000) return Response.json({ error: 'Please enter a question up to 1,000 characters.' }, { status: 400 })
  const supabase = getSupabase()
  if (!supabase) return Response.json({ error: 'The Stats SA knowledge service is not configured yet.' }, { status: 503 })

  let existingCase: { case_reference: string; question: string; answer: string | null; status: string } | null = null
  if (existingCaseId) {
    const { data, error: existingCaseError } = await supabase
      .from('public_queries')
      .select('case_reference,question,answer,status')
      .eq('case_reference', existingCaseId)
      .maybeSingle()
    if (existingCaseError) return Response.json({ error: 'The existing enquiry could not be loaded.' }, { status: 503 })
    existingCase = data
  }

  // Check the user's existing enquiries first so repeated questions do not create duplicate cases.
  const { data: existingEnquiries, error: enquiryLookupError } = await supabase
    .from('public_queries')
    .select('case_reference,question,status,answer,updated_at')
    .order('created_at', { ascending: false })
    .limit(100)
  if (enquiryLookupError) return Response.json({ error: 'Existing enquiries could not be checked.' }, { status: 503 })

  const questionTerms = new Set(cleanedQuestion.toLowerCase().replace(/[^a-z0-9\s']/g, ' ').split(/\s+/).filter((term: string) => term.length > 2))
  const duplicate = (existingEnquiries ?? []).find((item) => {
    const existingTerms = new Set(item.question.toLowerCase().replace(/[^a-z0-9\s']/g, ' ').split(/\s+/).filter((term: string) => term.length > 2))
    if (cleanedQuestion.toLowerCase() === item.question.trim().toLowerCase()) return true
    const overlap = [...questionTerms].filter((term) => existingTerms.has(term)).length
    const denominator = Math.max(questionTerms.size, existingTerms.size)
    return denominator > 1 && overlap / denominator >= 0.65
  })
  if (duplicate && !existingCase) return Response.json({
    duplicate: {
      caseId: duplicate.case_reference,
      question: duplicate.question,
      status: duplicate.status,
      answer: duplicate.answer,
      updatedAt: duplicate.updated_at,
    },
  })

  const { data: sources, error: sourceError } = await supabase.from('statsa_knowledge_sources').select('id,title,topic,content,source_url,source_date').limit(8)
  if (sourceError) return Response.json({ error: 'Approved source data could not be loaded.' }, { status: 503 })
  const normalizedQuestion = cleanedQuestion.toLowerCase().replace(/[^a-z0-9\s']/g, ' ').replace(/\s+/g, ' ').trim()
  const conversationalQuestions = new Set([
    'hi',
    'hello',
    'hey',
    'hiya',
    'good morning',
    'good afternoon',
    'good evening',
    'good night',
    'how are you',
    'how are you doing',
    'what can you do',
    'thanks',
    'thank you',
    'thank you so much',
    'bye',
    'goodbye',
    'see you',
    'see you later',
  ])
  const isConversational = conversationalQuestions.has(normalizedQuestion) || /^(hi|hello|hey|thanks|thank you|bye|goodbye)[\s']*(there|again|all)?$/.test(normalizedQuestion)
  const terms = normalizedQuestion.split(/\s+/).filter((term: string) => term.length > 3).slice(0, 8)
  const requestedYears: string[] = normalizedQuestion.match(/\b(?:19|20)\d{2}\b/g) ?? []
  const sourceMatches = (sources ?? []).filter((source) => {
    const searchable = `${source.title} ${source.topic} ${source.content}`.toLowerCase()
    const sourceYears: string[] = searchable.match(/\b(?:19|20)\d{2}\b/g) ?? []
    if (requestedYears.length && !requestedYears.some((year) => searchable.includes(year))) return false
    const matchedTerms = terms.filter((term: string) => searchable.includes(term))
    return matchedTerms.length >= (requestedYears.length ? 2 : 1)
  })
  const relatedSources = isConversational ? [] : (sources ?? []).filter((source) => {
    const searchable = `${source.title} ${source.topic} ${source.content}`.toLowerCase()
    return terms.some((term: string) => searchable.includes(term))
  })
  const groundedSources = sourceMatches
  let needsReview = !isConversational && groundedSources.length === 0
  let informationGap = needsReview && !isConversational
  let answer = isConversational
    ? 'Hello. I can help you find official Statistics South Africa information. Ask a question about topics such as the census, inflation, employment, households, or population statistics.'
    : informationGap
      ? `I could not verify information about “${cleanedQuestion}” from the approved Stats SA sources available to me. I will not infer an answer from unrelated sources. This enquiry needs official review.`
      : `This enquiry needs official review because no approved Stats SA source directly answers “${cleanedQuestion}”. I will not substitute related statistics or cite an unrelated publication.`

  if (!needsReview && !isConversational) {
    const context = groundedSources.map((source, index) => `[${index + 1}] ${source.title} (${source.topic})\n${source.content}\nSource: ${source.source_url ?? 'Official Stats SA source'}`).join('\n\n')
    try {
      const result = await generateText({
        model: selfHostedAI(process.env.SELF_HOSTED_AI_MODEL ?? 'qwen2.5:7b'),
        system: 'You are the Stats SA public information assistant. Write a concise, plain-language draft answer using only the supplied approved Stats SA source excerpts. Do not add facts, estimates, dates, or interpretation that are not explicitly supported. If the excerpts do not answer the question, say that official review is required and clearly state that Stats SA officials have been notified when the enquiry is escalated. Keep citation markers such as [1] exactly where they support a claim. Do not describe the answer as a generic chatbot response. Clearly label the result as answered from approved sources, official verification required, related information found, or insufficient evidence. Include inline citation markers for supported claims.',
        prompt: `Question: ${cleanedQuestion}\n\nApproved source excerpts:\n${context}\n\nFirst write exactly one control line: RESOLUTION: ANSWERED or RESOLUTION: UNRESOLVED. Use ANSWERED only when the excerpts directly contain enough information to answer the exact question. Use UNRESOLVED when the question asks for a missing year, statistic, definition, comparison, or detail not present in the excerpts. Then write the answer with inline citations. For UNRESOLVED, do not guess; explain that official review is required.`,
      })
      const generated = result.text.trim()
      const resolution = generated.match(/^RESOLUTION:\s*(ANSWERED|UNRESOLVED)\s*/i)?.[1]?.toUpperCase()
      answer = generated.replace(/^RESOLUTION:\s*(ANSWERED|UNRESOLVED)\s*/i, '').trim() || answer
      if (resolution === 'UNRESOLVED' || !resolution) { needsReview = true; informationGap = true; answer = answer || `I could not verify “${cleanedQuestion}” from the approved Stats SA sources. Official review is required.` }
    } catch (error) {
console.error('[v0] Self-hosted AI generation failed:', error)
    return Response.json({ error: 'The self-hosted AI server could not generate a response. Check that Ollama or vLLM is running and that SELF_HOSTED_AI_BASE_URL is reachable.' }, { status: 502 })
    }
  }

  if (existingCase) {
    const followUp = `Follow-up: ${cleanedQuestion}`
    const updatedQuestion = `${existingCase.question}\n\n${followUp}`
    const canAnswerFollowUp = isConversational || groundedSources.length > 0
    const followUpAnswer = canAnswerFollowUp
      ? answer
      : 'This follow-up has been added to the existing enquiry. Stats SA officials have already been notified and we are still awaiting feedback.'
    const updatedAnswer = [existingCase.answer, `Follow-up response: ${followUpAnswer}`].filter(Boolean).join('\n\n')
    const { error: updateError } = await supabase
      .from('public_queries')
      .update({ question: updatedQuestion, answer: updatedAnswer, updated_at: new Date().toISOString() })
      .eq('case_reference', existingCase.case_reference)
    if (updateError) return Response.json({ error: 'The follow-up could not be added to the enquiry.' }, { status: 503 })
    return Response.json({
      caseId: existingCase.case_reference,
      answer: followUpAnswer,
      escalated: !canAnswerFollowUp || existingCase.status === 'escalated' || existingCase.status === 'in_review',
      status: !canAnswerFollowUp ? 'information_gap' : 'answered',
      requiresConsent: !canAnswerFollowUp && existingCase.status !== 'escalated' && existingCase.status !== 'in_review',
      notification: !canAnswerFollowUp ? 'This enquiry is unresolved. Stats SA officials will be notified after you confirm escalation.' : null,
      escalationReason: !canAnswerFollowUp ? 'No approved source directly answers the exact question.' : null,
      followUp: true,
      answeredByAi: canAnswerFollowUp,
      appendedToOfficialReview: !canAnswerFollowUp,
      sources: groundedSources.map((source) => ({ id: source.id, title: source.title, publisher: 'Statistics South Africa', source_url: source.source_url, published_at: source.source_date })),
    })
  }

  if (allowEscalation && existingCaseId && needsReview) {
    const { error: updateError } = await supabase.from('public_queries').update({ status: 'escalated', updated_at: new Date().toISOString() }).eq('case_reference', existingCaseId)
    if (updateError) return Response.json({ error: 'The enquiry could not be escalated.' }, { status: 503 })
    return Response.json({ caseId: existingCaseId, originalQuestion: cleanedQuestion, answer, status: 'in_review', escalated: true, notification: 'Stats SA officials have been notified. This enquiry is awaiting human review before any response is released.', escalationReason: 'Official Verification Required', sources: [] })
  }

  const caseReference = `PUB-${Date.now().toString().slice(-6)}`
  const trackedStatus = needsReview ? (allowEscalation ? 'escalated' : 'in_review') : 'answered'
  const { data: enquiry, error: insertError } = await supabase.from('public_queries').insert({ case_reference: caseReference, question: cleanedQuestion, answer, status: trackedStatus, escalation_reason: needsReview ? 'No approved source matched this enquiry.' : null }).select('id').single()
  if (insertError || !enquiry) return Response.json({ error: 'The enquiry could not be tracked.' }, { status: 503 })
  if (groundedSources.length) {
    const { error: linkError } = await supabase.from('public_query_sources').insert(groundedSources.map((source) => ({ query_id: enquiry.id, source_id: source.id })))
    if (linkError) return Response.json({ error: 'The enquiry was saved, but its source links could not be created.' }, { status: 503 })
  }
  return Response.json({ caseId: caseReference, answer, status: isConversational ? 'answered' : needsReview ? 'information_gap' : 'answered', escalated: needsReview && allowEscalation, requiresConsent: needsReview && !allowEscalation, notification: needsReview ? 'Stats SA officials have been notified. This enquiry is awaiting human review before any response is released.' : null, escalationReason: needsReview ? 'Insufficient approved evidence' : null, sources: groundedSources.map((source) => ({ id: source.id, title: source.title, publisher: 'Statistics South Africa', source_url: source.source_url, published_at: source.source_date })), relatedSources: relatedSources.filter((source) => !groundedSources.some((grounded) => grounded.id === source.id)).map((source) => ({ id: source.id, title: source.title, publisher: 'Statistics South Africa', source_url: source.source_url, published_at: source.source_date })) })
}

export async function DELETE(request: Request) {
  const caseId = new URL(request.url).searchParams.get('caseId')?.trim()
  if (!caseId) return Response.json({ error: 'A case ID is required.' }, { status: 400 })

  const supabase = getSupabase()
  if (!supabase) return Response.json({ error: 'The Stats SA knowledge service is not configured yet.' }, { status: 503 })

  const { error } = await supabase.from('public_queries').delete().eq('case_reference', caseId)
  if (error) return Response.json({ error: 'The enquiry could not be deleted.' }, { status: 503 })
  return Response.json({ deleted: true, caseId })
}

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
