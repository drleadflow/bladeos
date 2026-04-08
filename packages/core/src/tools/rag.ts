import { registerTool } from '../tool-registry.js'
import { ingestDocument, searchDocuments } from '../rag/document-store.js'
import type { ToolCallResult, ExecutionContext } from '../types.js'

registerTool(
  {
    name: 'search_documents',
    description: 'Search your uploaded documents and knowledge base for relevant information.',
    input_schema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'The search query to find relevant document chunks.',
        },
        limit: {
          type: 'number',
          description: 'Maximum number of results to return. Defaults to 5.',
          default: 5,
        },
      },
      required: ['query'],
    },
    category: 'memory',
  },
  async (input: Record<string, unknown>, context: ExecutionContext): Promise<ToolCallResult> => {
    const query = input.query as string
    const limit = (input.limit as number) ?? 5
    const start = performance.now()

    try {
      const results = searchDocuments(query, limit)

      return {
        toolUseId: '',
        toolName: 'search_documents',
        input,
        success: true,
        data: results,
        display: results.length > 0
          ? results.map(r => `[Chunk ${r.index}] ${r.content.slice(0, 200)}...`).join('\n\n')
          : 'No matching documents found.',
        durationMs: Math.round(performance.now() - start),
        timestamp: new Date().toISOString(),
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      return {
        toolUseId: '',
        toolName: 'search_documents',
        input,
        success: false,
        data: null,
        display: `Search failed: ${message}`,
        durationMs: Math.round(performance.now() - start),
        timestamp: new Date().toISOString(),
      }
    }
  }
)

registerTool(
  {
    name: 'ingest_document',
    description: 'Add a document to your knowledge base from text content. Splits into searchable chunks.',
    input_schema: {
      type: 'object',
      properties: {
        title: {
          type: 'string',
          description: 'Title or name of the document.',
        },
        content: {
          type: 'string',
          description: 'The full text content of the document to ingest.',
        },
        source: {
          type: 'string',
          description: 'Source of the document (file path, URL, or description).',
        },
      },
      required: ['title', 'content', 'source'],
    },
    category: 'memory',
  },
  async (input: Record<string, unknown>, context: ExecutionContext): Promise<ToolCallResult> => {
    const title = input.title as string
    const content = input.content as string
    const source = input.source as string
    const start = performance.now()

    try {
      const doc = ingestDocument(title, content, source)

      return {
        toolUseId: '',
        toolName: 'ingest_document',
        input: { title, source, contentLength: content.length },
        success: true,
        data: { id: doc.id, title: doc.title, chunkCount: doc.chunks.length },
        display: `Ingested "${title}" (${doc.chunks.length} chunks) from ${source}`,
        durationMs: Math.round(performance.now() - start),
        timestamp: new Date().toISOString(),
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      return {
        toolUseId: '',
        toolName: 'ingest_document',
        input: { title, source },
        success: false,
        data: null,
        display: `Ingestion failed: ${message}`,
        durationMs: Math.round(performance.now() - start),
        timestamp: new Date().toISOString(),
      }
    }
  }
)
