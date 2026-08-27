from langchain_core.messages import HumanMessage, SystemMessage
from ..dependencies import get_chat_model
from typing import List, Dict, Any

def generate_answer(question: str, context_chunks: List[Dict[str, Any]], answer_style: str = "balanced") -> str:
    """Generate answer grounded in retrieved chunks"""
    llm = get_chat_model()
    
    system_prompt = """Answer only from the supplied sources. Do not use outside knowledge.
For each material factual claim, cite one or more source IDs in square brackets (e.g. [1]).
If the sources do not contain the answer, say so clearly.
Do not fabricate quotations, page numbers, citations, or values."""

    if answer_style == "concise":
        system_prompt += "\nKeep your answer very brief and to the point."
    elif answer_style == "detailed":
        system_prompt += "\nProvide a highly detailed and comprehensive answer."
        
    context_text = "SOURCES:\n\n"
    for idx, chunk in enumerate(context_chunks):
        citation_num = idx + 1
        context_text += f"--- Source [{citation_num}] ---\n"
        context_text += f"Type: {chunk.get('type', 'text')}\n"
        context_text += f"Page: {chunk.get('pageNumber', '?')}\n"
        context_text += f"Content: {chunk.get('text', '')}\n\n"
        
    user_prompt = f"Context:\n{context_text}\n\nQuestion: {question}"
    
    messages = [
        SystemMessage(content=system_prompt),
        HumanMessage(content=user_prompt)
    ]
    
    response = llm.invoke(messages)
    return response.content
