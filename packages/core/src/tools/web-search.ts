import { registerTool } from '../tool-registry.js'
import type { ToolCallResult, ExecutionContext } from '../types.js'

interface WebSearchResult {
  title: string
  url: string
  snippet: string
  source: string
}

interface WebSearchResponse {
  provider: string
  query: string
  results: WebSearchResult[]
}

export function stringifyError(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

async function fetchJson<T>(
  url: string,
  init: RequestInit,
  provider: string
): Promise<T> {
  const response = await fetch(url, init)

  if (!response.ok) {
    const body = await response.text()
    throw new Error(
      `${provider} search failed with ${response.status}: ${body.slice(0, 300)}`
    )
  }

  return response.json() as Promise<T>
}

function normalizeResults(
  provider: string,
  query: string,
  results: WebSearchResult[]
): WebSearchResponse {
  return {
    provider,
    query,
    results: results
      .filter((result) => result.title && result.url)
      .slice(0, 5),
  }
}

async function searchWithTavily(query: string): Promise<WebSearchResponse> {
  const apiKey = process.env.TAVILY_API_KEY
  if (!apiKey) {
    throw new Error('Missing TAVILY_API_KEY')
  }

  const data = await fetchJson<{
    results?: Array<{
      title?: string
      url?: string
      content?: string
    }>
  }>(
    'https://api.tavily.com/search',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        api_key: apiKey,
        query,
        search_depth: 'advanced',
        max_results: 5,
      }),
    },
    'Tavily'
  )

  return normalizeResults(
    'tavily',
    query,
    (data.results ?? []).map((result) => ({
      title: result.title ?? 'Untitled result',
      url: result.url ?? '',
      snippet: result.content ?? '',
      source: 'tavily',
    }))
  )
}

async function searchWithSerpApi(query: string): Promise<WebSearchResponse> {
  const apiKey = process.env.SERPAPI_API_KEY
  if (!apiKey) {
    throw new Error('Missing SERPAPI_API_KEY')
  }

  const searchParams = new URLSearchParams({
    engine: 'google',
    q: query,
    num: '5',
    api_key: apiKey,
  })

  const data = await fetchJson<{
    organic_results?: Array<{
      title?: string
      link?: string
      snippet?: string
    }>
  }>(
    `https://serpapi.com/search.json?${searchParams.toString()}`,
    {
      method: 'GET',
    },
    'SerpAPI'
  )

  return normalizeResults(
    'serpapi',
    query,
    (data.organic_results ?? []).map((result) => ({
      title: result.title ?? 'Untitled result',
      url: result.link ?? '',
      snippet: result.snippet ?? '',
      source: 'serpapi',
    }))
  )
}

async function searchWithExa(query: string): Promise<WebSearchResponse> {
  const apiKey = process.env.EXA_API_KEY
  if (!apiKey) {
    throw new Error('Missing EXA_API_KEY')
  }

  const data = await fetchJson<{
    results?: Array<{
      title?: string
      url?: string
      text?: string
      publishedDate?: string
    }>
  }>(
    'https://api.exa.ai/search',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
      },
      body: JSON.stringify({
        query,
        type: 'auto',
        numResults: 5,
        useAutoprompt: true,
      }),
    },
    'Exa'
  )

  return normalizeResults(
    'exa',
    query,
    (data.results ?? []).map((result) => ({
      title: result.title ?? 'Untitled result',
      url: result.url ?? '',
      snippet: result.text?.slice(0, 280) ?? '',
      source: result.publishedDate
        ? `exa (${result.publishedDate})`
        : 'exa',
    }))
  )
}

async function performWebSearch(query: string): Promise<WebSearchResponse> {
  const providers = [
    searchWithTavily,
    searchWithSerpApi,
    searchWithExa,
  ]

  const errors: string[] = []

  for (const provider of providers) {
    try {
      const result = await provider(query)
      if (result.results.length > 0) {
        return result
      }
      errors.push(`${result.provider}: no results`)
    } catch (error) {
      errors.push(stringifyError(error))
    }
  }

  throw new Error(
    `No web search provider is configured or available. Set one of TAVILY_API_KEY, SERPAPI_API_KEY, or EXA_API_KEY. Details: ${errors.join(' | ')}`
  )
}

function formatWebSearchDisplay(result: WebSearchResponse): string {
  if (result.results.length === 0) {
    return `No results found for "${result.query}" via ${result.provider}.`
  }

  return [
    `Found ${result.results.length} results via ${result.provider}:`,
    ...result.results.map(
      (item, index) =>
        `${index + 1}. ${item.title}\n   ${item.url}\n   ${item.snippet}`.trimEnd()
    ),
  ].join('\n')
}

// ============================================================
// WEB SEARCH (placeholder — will be wired to real search later)
// ============================================================

registerTool(
  {
    name: 'web_search',
    description: 'Search the web for current information. Use when you need up-to-date data that may not be in your training data.',
    input_schema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'The search query',
        },
      },
      required: ['query'],
    },
    category: 'web',
  },
  async (input: Record<string, unknown>, _context: ExecutionContext): Promise<ToolCallResult> => {
    const query = input.query as string

    try {
      const result = await performWebSearch(query)

      return {
        toolUseId: '',
        toolName: 'web_search',
        input,
        success: true,
        data: result,
        display: formatWebSearchDisplay(result),
        durationMs: 0,
        timestamp: new Date().toISOString(),
      }
    } catch (error) {
      return {
        toolUseId: '',
        toolName: 'web_search',
        input,
        success: false,
        data: null,
        display: stringifyError(error),
        durationMs: 0,
        timestamp: new Date().toISOString(),
      }
    }
  }
)
