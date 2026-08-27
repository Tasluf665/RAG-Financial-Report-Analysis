from unstructured.chunking.title import chunk_by_title

def create_chunks(elements, max_chars=3000, new_after=2400, combine_under=500):
    """Create intelligent chunks using title-based strategy"""
    print("🔨 Creating smart chunks...")
    chunks = chunk_by_title(
        elements,
        max_characters=max_chars,
        new_after_n_chars=new_after,
        combine_text_under_n_chars=combine_under
    )
    print(f"✅ Created {len(chunks)} chunks")
    return chunks

def analyze_chunk_content(chunk):
    """Analyze what types of content are in a chunk"""
    content_data = {
        'text': chunk.text,
        'tables': [],
        'images': [],
        'types': ['text'],
        'page_number': 1
    }
    
    if hasattr(chunk, 'metadata'):
        if hasattr(chunk.metadata, 'page_number') and chunk.metadata.page_number:
            content_data['page_number'] = chunk.metadata.page_number
            
        if hasattr(chunk.metadata, 'orig_elements'):
            for element in chunk.metadata.orig_elements:
                element_type = type(element).__name__
                
                if element_type == 'Table':
                    content_data['types'].append('table')
                    table_html = getattr(element.metadata, 'text_as_html', element.text)
                    content_data['tables'].append(table_html)
                
                elif element_type == 'Image':
                    if hasattr(element, 'metadata') and hasattr(element.metadata, 'image_base64'):
                        content_data['types'].append('image')
                        content_data['images'].append(element.metadata.image_base64)
                        
    content_data['types'] = list(set(content_data['types']))
    
    if not content_data['text'].strip() and len(content_data['types']) > 1:
        content_data['types'].remove('text')
        
    return content_data
