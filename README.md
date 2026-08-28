# Multi-Modal RAG for Financial Report Analysis

A custom Retrieval-Augmented Generation (RAG) system designed specifically to analyze and compare dense financial reports (e.g., 10-K, 10-Q forms).

## Why This System?

Financial documents are typically 100-300 pages long. When users need to compare reports across 10-15 different companies, directly uploading all documents to a Large Language Model (LLM) will quickly exceed the context window and lead to information loss or context degradation.

This project solves this by using a tailored RAG approach to selectively retrieve only the most relevant information needed to answer the user's questions, drastically reducing context load while maintaining high accuracy.

## Key Features & Methodology

### 1. Advanced Document Partitioning

We use the popular **`unstructured`** library to partition PDFs and other document types. Financial reports rely heavily on non-text elements. The `unstructured` library is critical here because it seamlessly extracts **images and tables** in addition to raw text, ensuring no valuable data is left behind.

### 2. Context-Aware Chunking

For chunking the parsed data, this project uses **`chunk_by_title`**. After analysis of various financial reports, chunking by title proved to be the most effective approach. It respects the natural document hierarchy and section boundaries, providing much better context during retrieval than standard fixed-size chunking.

### 3. Multi-Modal Summarization (Images & Tables)

Before embedding the data, all extracted tables and images are passed through an LLM to generate descriptive summaries. By embedding these summaries alongside the text, the RAG system gains full semantic understanding of visual and tabular data, allowing it to accurately answer questions based on charts and complex data tables.

### 4. Vector Storage and Retrieval

The text chunks and image/table summaries are converted into embeddings (using OpenAI Embeddings) and stored in a local **Chroma** vector database. During querying, the system retrieves the most relevant multi-modal chunks to synthesize a complete and accurate answer.

## Technologies Used

- **LangChain**: For orchestrating the RAG pipeline.
- **Unstructured**: For document parsing (`partition_pdf`) and intelligent chunking (`chunk_by_title`).
- **OpenAI**: For multi-modal summarization and generating embeddings.
- **ChromaDB**: For vector storage and similarity search.

## Getting Started

Explore the pipeline in the `multi_modal_rag.ipynb` notebook to see the data extraction, summarization, and retrieval in action.

## Docker

Create the three application `.env` files from their `.env.example` files, then start the complete stack from the repository root:

```bash
docker compose up --build
```

The web app is available at `http://localhost:5173`. The Node API and Python RAG service are exposed on ports `4000` and `8000` respectively.
