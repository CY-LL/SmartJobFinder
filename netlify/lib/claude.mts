// Reads resumes, portfolios and LinkedIn data with Claude and returns a structured profile.

import Anthropic from '@anthropic-ai/sdk'
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod'
import { z } from 'zod'

const ProfileSchema = z.object({
  name: z.string().describe("The candidate's full name, or empty if not stated"),
  title: z.string().describe('Their professional headline or current/target job title, short (e.g. "Senior Product Designer")'),
  city: z.string().describe('City and province/state, e.g. "Ottawa, ON", or empty'),
  email: z.string(),
  phone: z.string(),
  linkedin: z.string().describe('LinkedIn profile URL, or empty'),
  website: z.string().describe('Portfolio or personal website URL, or empty'),
  summary: z.string().describe('2-3 sentence professional summary written only from stated facts'),
  roles: z.array(z.object({
    title: z.string(),
    org: z.string(),
    dates: z.string().describe('Years only: "2019–22", "2022–NOW", or "2018" for a single year'),
    highlights: z.array(z.string()).describe('Up to 3 concrete achievements for this role, verbatim or lightly shortened'),
  })).describe('Work experience, most recent first'),
  skills: z.array(z.string()).describe('Distinct skills, tools and languages, most important first, max 40'),
  education: z.array(z.string()).describe('e.g. "BSc Computer Science, University of Waterloo, 2015"'),
  years: z.number().describe('Total years of professional experience, counting overlapping roles once, one decimal'),
  level: z.enum(['Junior', 'Intermediate', 'Expert']).describe('Junior under 3 years, Intermediate 3-7, Expert 7+, adjusted for seniority of titles'),
})

export type ExtractedProfile = z.infer<typeof ProfileSchema>

const SYSTEM = `You extract a job seeker's profile from their resume, portfolio, LinkedIn data or website.
Only use facts that appear in the material. Never invent employers, dates, numbers or skills; leave a field empty or a list short rather than guess.
When several sources are given, combine them: prefer the most specific and most recent information, and keep every distinct role and skill.
Today's date is ${new Date().toISOString().slice(0, 10)}; use it to count years for roles that are ongoing.`

let client: Anthropic | null = null

export const claudeConfigured = () => !!Netlify.env.get('ANTHROPIC_API_KEY')

export type Source = { kind: 'pdf'; name: string; base64: string } | { kind: 'text'; name: string; text: string }

/** One Claude call over all sources. Throws Anthropic.APIError subclasses on API failures. */
export async function extractProfile(sources: Source[]): Promise<ExtractedProfile> {
  client ??= new Anthropic({ apiKey: Netlify.env.get('ANTHROPIC_API_KEY'), timeout: 55_000, maxRetries: 1 })

  const content: Anthropic.Beta.BetaContentBlockParam[] = []
  for (const s of sources) {
    if (s.kind === 'pdf') {
      content.push({ type: 'document', title: s.name, source: { type: 'base64', media_type: 'application/pdf', data: s.base64 } })
    } else {
      content.push({ type: 'text', text: `<source name="${s.name.replace(/"/g, "'")}">\n${s.text}\n</source>` })
    }
  }
  content.push({ type: 'text', text: 'Extract the profile from the material above.' })

  const response = await client.beta.messages.parse({
    model: 'claude-opus-5-5',
    max_tokens: 16000,
    // Extraction is routine work; low effort keeps the reply well inside Netlify's 60s function limit.
    output_config: { effort: 'low', format: betaZodOutputFormat(ProfileSchema) },
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    system: SYSTEM,
    messages: [{ role: 'user', content }],
  })

  if (response.stop_reason === 'refusal') throw new Error('Claude declined to read this material.')
  if (!response.parsed_output) throw new Error('Claude did not return a readable profile.')
  return response.parsed_output
}
