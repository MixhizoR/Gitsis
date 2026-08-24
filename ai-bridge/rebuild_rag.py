#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Script to properly rebuild RAG knowledge base with debugging
"""

from rag_handler import rag_handler, build_rag_knowledge_base, get_rag_info
import os

# ✅ libmagic / python-magic-bin güvenli import

try:
    import magic
except ImportError:
    magic = None
    print("⚠️ 'magic' modülü bulunamadı. Dosya türü algılama devre dışı kalacak.")

def main():
    print("🔧 RAG Knowledge Base Rebuild Script")
    print("=" * 50)
    
    # Step 1: Check current status
    print("\n📊 Current Status:")
    info = get_rag_info()
    for key, value in info.items():
        print(f"  {key}: {value}")
    
    # Step 2: Check if documents exist
    print(f"\n📁 Checking documents in: {rag_handler.data_path}")
    if os.path.exists(rag_handler.data_path):
        for root, dirs, files in os.walk(rag_handler.data_path):
            for file in files:
                if file.endswith(('.pdf', '.txt', '.md', '.docx')):
                    rel_path = os.path.relpath(os.path.join(root, file), rag_handler.data_path)
                    print(f"  📄 Found: {rel_path}")
                    
                    # ✅ Dosya tipi kontrolü magic varsa
                    if magic:
                        try:
                            ms = magic.Magic(mime=True)
                            file_type = ms.from_file(os.path.join(root, file))
                            print(f"     └─ Detected type: {file_type}")
                        except Exception as e:
                            print(f"     └─ ⚠️ Filetype detection failed: {e}")
    
    # Step 3: Check embeddings
    print(f"\n🔧 Embeddings Status:")
    print(f"  Embeddings initialized: {rag_handler.embeddings is not None}")
    if rag_handler.embeddings:
        print(f"  Embeddings type: {type(rag_handler.embeddings).__name__}")
        if hasattr(rag_handler.embeddings, 'base_url'):
            print(f"  LM Studio URL: {rag_handler.embeddings.base_url}")
    
    # Step 4: Test embeddings
    if rag_handler.embeddings:
        print(f"\n🧪 Testing embeddings...")
        try:
            test_embedding = rag_handler.embeddings.embed_query("test")
            if test_embedding:
                print(f"  ✅ Embeddings working, dimension: {len(test_embedding)}")
            else:
                print(f"  ❌ Embeddings test failed")
        except Exception as e:
            print(f"  ❌ Embeddings test error: {e}")
    
    # Step 5: Close existing database
    print(f"\n🔒 Closing existing database...")
    if rag_handler.db:
        rag_handler.close_database()
    
    # Step 6: Force rebuild
    print(f"\n🔄 Force rebuilding knowledge base...")
    print(f"Database path: {rag_handler.chroma_path}")
    
    try:
        success = build_rag_knowledge_base(force_rebuild=True)
        if success:
            print("✅ Knowledge base rebuild completed!")
        else:
            print("❌ Knowledge base rebuild failed!")
            return False
    except Exception as e:
        print(f"❌ Rebuild error: {e}")
        return False
    
    # Step 7: Test the rebuilt database
    print(f"\n🧪 Testing rebuilt database...")
    try:
        # Load the database
        rag_handler._load_existing_database()
        
        if rag_handler.db:
            print("✅ Database loaded successfully!")
            
            # Test query
            test_results = rag_handler.query_knowledge_base("system requirements", k=3)
            print(f"🔍 Test query returned {len(test_results)} results")
            
            if test_results:
                print("📄 Sample result:")
                doc, score = test_results[0]
                print(f"  Score: {score:.3f}")
                print(f"  Content preview: {doc.page_content[:100]}...")
            
            return True
        else:
            print("❌ Database failed to load after rebuild")
            return False
            
    except Exception as e:
        print(f"❌ Database test error: {e}")
        return False

if __name__ == "__main__":
    success = main()
    if success:
        print("\n🎉 RAG system is now working!")
    else:
        print("\n❌ RAG rebuild failed. Check the errors above.")