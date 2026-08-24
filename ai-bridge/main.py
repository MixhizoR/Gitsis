# -*- coding: utf-8 -*-
"""Main program for IEEE 15288 LLM traceability system"""

import sys
import time

# Windows konsolu emoji/Unicode basamadığından çıktıyı UTF-8'e zorla.
for _stream in (sys.stdout, sys.stderr):
    try:
        _stream.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

from file_handler import read_tid_document, save_html_file, open_html_file
from data_processor import (process_tid_data_batch, process_tid_data, create_tree_structure, create_flat_test_data)
from html_generation import generate_advanced_html
from config import OUTPUT_HTML_FILE, USE_BATCH_PROCESSING
from rag_handler import RAGHandler

def main():
    """Main program function"""
    print("🚀 IEEE 15288 LLM İzlenebilirlik Sistemi Başlatılıyor...")

    rag = RAGHandler()
    rag._load_existing_database()

    print("\n📖 TİD dosyası okunuyor...")
    tid_df = read_tid_document()

    if tid_df is None or tid_df.empty:
        print("❌ TİD dosyası okunamadı veya boş.")
        return

    print(f"✅ {len(tid_df)} TİD kaydı başarıyla okundu")

    start_time = time.time()

    # Step 2: Process TID data with LLM
    if USE_BATCH_PROCESSING:
        print("🚀 Toplu işleme modu kullanılıyor...")
        trace_df = process_tid_data_batch(tid_df)
    else:
        print("🔄 Tek tek işleme modu kullanılıyor...")
        trace_df = process_tid_data(tid_df)

    if trace_df is None:
        print("❌ Veri işleme başarısız oldu.")
        return

    print(f"✅ {len(trace_df)} toplam kayıt oluşturuldu")

    # Step 3: Create tree structure and flat test data
    tree = create_tree_structure(trace_df)
    flat_test_data = create_flat_test_data(trace_df)

    # Step 4: Generate HTML
    print("📄 HTML raporu oluşturuluyor...")
    html_content = generate_advanced_html(tree, flat_test_data)

    # Step 5: Save and open HTML file
    if save_html_file(html_content, OUTPUT_HTML_FILE):
        print("✅ HTML dosyası kaydedildi")
        open_html_file(OUTPUT_HTML_FILE)
        print("🎉 Program başarıyla tamamlandı!")
    else:
        print("❌ HTML dosyası kaydedilemedi")

    duration = time.time() - start_time
    print(f"⏱️ Toplam süre: {duration:.2f} saniye")

if __name__ == "__main__":
    main()
