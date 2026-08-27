from unstructured.partition.pdf import partition_pdf

def parse_document(file_path: str):
    """Extract elements from PDF using unstructured hi_res strategy."""
    print(f"📄 Partitioning document: {file_path}")
    elements = partition_pdf(
        filename=file_path,
        strategy="hi_res",
        infer_table_structure=True,
        extract_image_block_types=["Image"],
        extract_image_block_to_payload=True
    )
    print(f"✅ Extracted {len(elements)} elements")
    return elements
