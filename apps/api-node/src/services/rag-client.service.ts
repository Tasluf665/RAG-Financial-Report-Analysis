/**
 * RAG Client Service
 *
 * Centralizes all HTTP calls from the Node API to the Python RAG service.
 * Every request includes the internal service token and a request ID.
 *
 * Security:
 *   - clerkUserId and documentIds are always derived from the verified Clerk
 *     session and authorized MongoDB queries — never from client input directly.
 *   - Arbitrary paths or client-controlled filters are never forwarded.
 */

const RAG_BASE_URL = (): string => {
  const host = process.env.RAG_HOST ?? '127.0.0.1';
  const port = process.env.RAG_PORT ?? '8000';
  return `http://${host}:${port}`;
};

const RAG_TOKEN = (): string => process.env.INTERNAL_SERVICE_TOKEN ?? 'default_secret';

const REQUEST_TIMEOUT_MS = 90_000; // 90 s — matches Python CHAT_TIMEOUT_SECONDS

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface RagIngestionConfig {
  chunkSize: number;
  chunkOverlap: number;
  summarizeImages: boolean;
  summarizeTables: boolean;
  embeddingModel: string;
}

export interface RagIngestRequest {
  documentId: string;
  clerkUserId: string;
  filePath: string;
  processingVersion: number;
  config: RagIngestionConfig;
}

export interface RagQueryRequest {
  requestId: string;
  clerkUserId: string;
  documentIds: string[];
  question: string;
  answerStyle: 'concise' | 'balanced' | 'detailed';
  topK: number;
}

export interface RagSourceCitation {
  citationNumber: number;
  documentId: string;
  chunkId: string;
  pageNumber: number;
  type: 'text' | 'image' | 'table';
  excerpt: string;
  retrievalSummary: string | null;
  score: number;
}

export interface RagRetrievalStats {
  retrievedCount: number;
  usedCount: number;
  model: string;
}

export interface RagQueryResponse {
  answer: string;
  sources: RagSourceCitation[];
  retrieval: RagRetrievalStats;
}

// ---------------------------------------------------------------------------
// Error types
// ---------------------------------------------------------------------------

export class RagClientError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
    public readonly code: string,
  ) {
    super(message);
    this.name = 'RagClientError';
  }
}

// ---------------------------------------------------------------------------
// Shared fetch helper
// ---------------------------------------------------------------------------

async function ragFetch<T>(
  path: string,
  options: RequestInit & { requestId?: string },
): Promise<T> {
  const { requestId, ...fetchOptions } = options;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-Internal-Service-Token': RAG_TOKEN(),
    ...(requestId ? { 'X-Request-Id': requestId } : {}),
    ...(fetchOptions.headers as Record<string, string> | undefined),
  };

  try {
    const response = await fetch(`${RAG_BASE_URL()}${path}`, {
      ...fetchOptions,
      headers,
      signal: controller.signal,
    });

    if (response.status === 204) {
      return undefined as unknown as T;
    }

    const body = await response.json().catch(() => ({}));

    if (!response.ok) {
      const code = body?.code ?? 'RAG_SERVICE_ERROR';
      const message = body?.message ?? `RAG service returned ${response.status}`;
      throw new RagClientError(message, response.status, code);
    }

    return body as T;
  } catch (err) {
    if (err instanceof RagClientError) throw err;

    if ((err as Error).name === 'AbortError') {
      throw new RagClientError(
        `RAG service request timed out after ${REQUEST_TIMEOUT_MS / 1000}s`,
        504,
        'RAG_TIMEOUT',
      );
    }

    throw new RagClientError(
      `RAG service connection failed: ${(err as Error).message}`,
      503,
      'RAG_UNAVAILABLE',
    );
  } finally {
    clearTimeout(timer);
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Queue a document for ingestion in the Python RAG service.
 * Returns immediately with status "queued" — processing is asynchronous.
 */
export async function ingestDocument(
  request: RagIngestRequest,
  requestId?: string,
): Promise<{ status: string; documentId: string }> {
  return ragFetch('/internal/ingest', {
    method: 'POST',
    body: JSON.stringify(request),
    requestId,
  });
}

/**
 * Submit a query to the RAG service and receive a cited answer.
 *
 * @param request  Must include only authorized clerkUserId and documentIds.
 * @param requestId  Propagate from the incoming request for traceability.
 */
export async function queryDocuments(
  request: RagQueryRequest,
  requestId?: string,
): Promise<RagQueryResponse> {
  return ragFetch<RagQueryResponse>('/internal/query', {
    method: 'POST',
    body: JSON.stringify(request),
    requestId,
  });
}

/**
 * Delete all Pinecone vectors for a document.
 * Idempotent — safe to call even if vectors don't exist.
 * Should be called before removing MongoDB metadata and local files.
 */
export async function deleteDocumentVectors(
  documentId: string,
  requestId?: string,
): Promise<void> {
  await ragFetch<void>(`/internal/documents/${encodeURIComponent(documentId)}/vectors`, {
    method: 'DELETE',
    requestId,
  });
}

/**
 * Check whether the Python RAG service is reachable and healthy.
 */
export async function checkRagHealth(): Promise<boolean> {
  try {
    const resp = await fetch(`${RAG_BASE_URL()}/internal/health`, {
      signal: AbortSignal.timeout(5_000),
    });
    return resp.ok;
  } catch {
    return false;
  }
}
