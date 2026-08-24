# -*- coding: utf-8 -*-
"""LLM handler for generating SGD and STT requirements using Gemma 3 via LM Studio"""

import requests
import json
import os
import tkinter as tk
from tkinter import filedialog, messagebox
from datetime import datetime
from config import BATCH_SIZE, ENABLE_CHUNKING, CHUNK_SIZE, CHUNK_OVERLAP

# Use PyMuPDF instead of PDFplumber for better extraction
try:
    import fitz  # PyMuPDF
    PYMUPDF_AVAILABLE = True
    print("✅ PyMuPDF available for PDF processing")
except ImportError:
    PYMUPDF_AVAILABLE = False
    print("❌ PyMuPDF not installed - install with: pip install PyMuPDF")

from config import (
    LMSTUDIO_BASE_URL, LMSTUDIO_API_KEY, MODEL_NAME, 
    PASIF_RADAR_CONTEXT
)
from rag_handler import get_rag_enhanced_context, rag_handler

def extract_page_text(page):
    """Try multiple extraction methods for best text result"""
    page_text = page.get_text("text", sort=True)
    if page_text and len(page_text.strip()) >= 50:
        return page_text
    
    # fallback: block-based extraction
    blocks = page.get_text("dict").get("blocks", [])
    block_texts = [
        span["text"]
        for block in blocks
        if "lines" in block
        for line in block["lines"]
        for span in line["spans"]
        if span.get("text", "").strip()
    ]
    return " ".join(block_texts)

def process_document_with_pymupdf(file_path):
    """Process PDF using PyMuPDF, return text content and page stats"""
    if not file_path.lower().endswith('.pdf'):
        print(f"❌ Sadece PDF dosyaları destekleniyor: {file_path}")
        return None
    if not PYMUPDF_AVAILABLE:
        print(f"❌ PyMuPDF yüklü değil: pip install PyMuPDF")
        return None

    try:
        print(f"📄 PDF işleniyor: {os.path.basename(file_path)}")
        text_content = ""
        page_details = []

        with fitz.open(file_path) as doc:
            for page_num, page in enumerate(doc):
                page_text = extract_page_text(page)
                status = "success" if page_text.strip() else "no_text"

                char_count = len(page_text)
                word_count = len(page_text.split())
                if status == "success":
                    text_content += f"\n--- page {page_num + 1} ---\n{page_text}\n"

                page_details.append({
                    'page_num': page_num + 1,
                    'char_count': char_count,
                    'word_count': word_count,
                    'status': status
                })

        total_chars = len(text_content)
        successful_pages = sum(1 for p in page_details if p['status'] == "success")

        print(f"✅ İşlem tamam: {total_chars} karakter, {len(page_details)} sayfa, {successful_pages} başarılı")
        return {
            'text': text_content,
            'pages': len(page_details),
            'successful_pages': successful_pages,
            'page_details': page_details,
            'total_chars': total_chars
        }

    except Exception as e:
        print(f"❌ PDF işleme hatası: {e}")
        return None
    
def manage_context_files():
    """Ensure context folder exists and return its path"""
    project_dir = os.path.dirname(os.path.abspath(__file__))
    context_folder = os.path.join(project_dir, "context_files")
    os.makedirs(context_folder, exist_ok=True)
    print(f"📁 Context klasörü hazır: {context_folder}")
    return context_folder


def get_existing_context_files(context_folder):
    """Return list of .txt context files in the folder"""
    if not os.path.exists(context_folder):
        return []
    return [f for f in os.listdir(context_folder) if f.endswith('.txt')]


def choose_context_option(context_folder):
    """Prompt user to choose: existing context, upload new, or no context"""
    existing_files = get_existing_context_files(context_folder)

    root = tk.Tk()
    root.withdraw()

    if existing_files:
        files_list = "\n".join(f"- {file}" for file in existing_files)
        choice = messagebox.askyesnocancel(
            "Context File Yönetimi",
            f"Mevcut context dosyaları bulundu:\n\n{files_list}\n\n"
            f"Evet: Mevcut dosyalardan birini seç\n"
            f"Hayır: Yeni dosya yükle\n"
            f"İptal: Context olmadan devam et"
        )
        if choice is True:
            return "existing"
        elif choice is False:
            return "new"
        else:
            return "none"
    else:
        choice = messagebox.askyesno(
            "Context File Yönetimi",
            "Henüz hiç context dosyası yok.\n\nYeni bir PDF dosyası yüklemek istiyor musunuz?"
        )
        return "new" if choice else "none"

def select_existing_context_file(context_folder):
    """Prompt user to select one of the existing context files"""
    existing_files = get_existing_context_files(context_folder)
    if not existing_files:
        return None

    root = tk.Tk()
    root.withdraw()
    from tkinter import simpledialog

    files_display = "\n".join(f"{i+1}. {file}" for i, file in enumerate(existing_files))
    selection = simpledialog.askinteger(
        "Context Dosyası Seç",
        f"Hangi context dosyasını kullanmak istiyorsunuz?\n\n{files_display}\n\nNumara girin:",
        minvalue=1,
        maxvalue=len(existing_files)
    )

    if selection:
        return os.path.join(context_folder, existing_files[selection - 1])
    return None


def get_context_selection_once():
    """Get user context selection once for reuse across multiple batches"""
    context_folder = manage_context_files()
    context_option = choose_context_option(context_folder)
    selected_file_path = None

    if context_option == "existing":
        selected_file_path = select_existing_context_file(context_folder)
        if not selected_file_path:
            print("❌ Context dosyası seçilmedi, 'none' moduna geçiliyor")
            context_option = "none"

    elif context_option == "new":
        root = tk.Tk()
        root.withdraw()
        messagebox.showinfo("Yeni Context File", "Yeni PDF dosyasını seçin")
        pdf_file_path = filedialog.askopenfilename(
            title="Yeni Context PDF seç",
            filetypes=[("PDF files", "*.pdf"), ("All Files", "*.*")]
        )

        if pdf_file_path:
            doc_result = process_document_with_pymupdf(pdf_file_path)
            if doc_result:
                extracted_text = doc_result['text']
                timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
                original_name = os.path.splitext(os.path.basename(pdf_file_path))[0]
                txt_filename = f"{original_name}_{timestamp}.txt"
                txt_file_path = os.path.join(context_folder, txt_filename)

                try:
                    with open(txt_file_path, "w", encoding="utf-8") as f:
                        f.write(extracted_text)
                    print(f"✅ Yeni context dosyası kaydedildi: {txt_filename}")
                    selected_file_path = txt_file_path

                    # Add to RAG knowledge base
                    try:
                        rag_handler.add_document_to_knowledge_base(pdf_file_path, "technical_specs")
                        print(f"📚 Döküman RAG bilgi tabanına eklendi")
                    except Exception as e:
                        print(f"⚠️ RAG bilgi tabanına eklenemedi: {e}")

                except Exception as e:
                    print(f"❌ Context dosyası kaydedilemedi: {e}")
                    context_option = "none"
            else:
                print("❌ PDF işlenemedi, 'none' moduna geçiliyor")
                context_option = "none"
        else:
            print("❌ PDF dosyası seçilmedi, 'none' moduna geçiliyor")
            context_option = "none"

    return {
        'option': context_option,
        'file_path': selected_file_path
    }

def configure_LLM(prompt, context_file_path=None, context_selection=None):
    """Call Gemma 3 model via LM Studio API and return context info with RAG enhancement"""
    
    context_folder = manage_context_files()
    
    # Determine context option
    if context_selection is None:
        context_option = choose_context_option(context_folder)
        selected_file_path = None
    else:
        context_option = context_selection.get('option', 'none')
        selected_file_path = context_selection.get('file_path', None)
    
    extracted_text = ""

    # Handle existing context
    if context_option == "existing":
        txt_file_path = selected_file_path or select_existing_context_file(context_folder)
        if txt_file_path and os.path.exists(txt_file_path):
            try:
                with open(txt_file_path, "r", encoding="utf-8") as f:
                    extracted_text = f.read()
                print(f"✅ Mevcut context dosyası kullanılıyor: {os.path.basename(txt_file_path)}")
            except Exception as e:
                print(f"❌ Context dosyası okunamadı: {e}")

    # Handle new PDF
    elif context_option == "new":
        context_file_path = context_file_path or filedialog.askopenfilename(
            title="Yeni Context PDF seç",
            filetypes=[("PDF files", "*.pdf"), ("All Files", "*.*")]
        )
        if context_file_path:
            doc_result = process_document_with_pymupdf(context_file_path)
            if doc_result:
                extracted_text = doc_result['text']
                # Save as unique txt
                from datetime import datetime
                timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
                original_name = os.path.splitext(os.path.basename(context_file_path))[0]
                txt_filename = f"{original_name}_{timestamp}.txt"
                txt_file_path = os.path.join(context_folder, txt_filename)
                try:
                    with open(txt_file_path, "w", encoding="utf-8") as f:
                        f.write(extracted_text)
                    print(f"✅ Yeni context dosyası kaydedildi: {txt_filename}")
                    # Add to RAG knowledge base
                    try:
                        rag_handler.add_document_to_knowledge_base(context_file_path, "technical_specs")
                        print(f"📚 Döküman RAG bilgi tabanına eklendi")
                    except Exception as e:
                        print(f"⚠️ RAG bilgi tabanına eklenemedi: {e}")
                except Exception as e:
                    print(f"❌ Context dosyası kaydedilemedi: {e}")
            else:
                print("❌ PDF işlenemedi")
        else:
            print("❌ PDF dosyası seçilmedi")

    # None option
    elif context_option == "none":
        print("ℹ️ Context dosyası olmadan devam ediliyor")

    # Get RAG-enhanced context
    rag_context = ""
    try:
        rag_context = get_rag_enhanced_context("general system requirements", "context") or ""
        if rag_context:
            print(f"🔧 RAG ile geliştirilmiş context eklendi: {len(rag_context)} karakter")
    except Exception as e:
        print(f"⚠️ RAG context alınamadı: {e}")

    return {
        "system_context": prompt,
        "additional_context": extracted_text or None,
        "rag_context": rag_context or None
    }

def call_gemma3_api(prompt, max_tokens=2000, temperature=0.4, system_message=None, rag_chunks=None):
    url = f"{LMSTUDIO_BASE_URL}/chat/completions"
    headers = {"Authorization": f"Bearer {LMSTUDIO_API_KEY}", "Content-Type": "application/json"}

    # Toplam context uzunluğunu sınırla
    max_total_length = 8000  # config.py'deki MAX_CONTEXT_TOKENS'e göre ayarla
    total_length = 0
    limited_chunks = []
    if rag_chunks:
        for chunk in rag_chunks:
            if total_length + len(chunk) > max_total_length:
                break
            limited_chunks.append(chunk)
            total_length += len(chunk)
    rag_context = "\n\n".join(limited_chunks)
    rag_message = f"RAG BAĞLAM:\n{rag_context}\n" if rag_context else ""

    # Sistem mesajı ve promptu da sınırla
    if system_message and len(system_message) > max_total_length:
        system_message = system_message[:max_total_length]
    if len(prompt) > max_total_length:
        prompt = prompt[:max_total_length]

    # Son olarak, sistem mesajı + rag_message toplamını sınırla
    combined_system_message = f"{rag_message}\n{system_message}" if system_message else rag_message
    if len(combined_system_message) > max_total_length:
        combined_system_message = combined_system_message[:max_total_length]

    messages = []
    if combined_system_message:
        messages.append({"role": "system", "content": combined_system_message})
    messages.append({"role": "user", "content": prompt})

    data = {
        "model": MODEL_NAME,
        "messages": messages,
        "max_tokens": max_tokens,
        "temperature": temperature,
        "stream": False
    }

    try:
        print(f"🤖 {MODEL_NAME} modeline bağlanılıyor: {LMSTUDIO_BASE_URL}")
        response = requests.post(url, headers=headers, json=data)
        response.raise_for_status()
        return response.json()['choices'][0]['message']['content']
    except requests.exceptions.ConnectionError:
        print("❌ LM Studio'ya bağlanılamadı. LM Studio çalışıyor mu?")
    except requests.exceptions.RequestException as e:
        print(f"❌ LM Studio API hatası: {e}")
        if hasattr(e, 'response') and e.response is not None:
            print(f"Response: {e.response.text}")
    except Exception as e:
        print(f"❌ Gemma 3 yanıt işleme hatası: {e}")
    return None

def generate_sgds_with_llm(tid_id, tid_aciklama, context_info=None):
    """Generate SGDs using Gemma 3 for given TID with RAG enhancement"""
    prompt = (
        f"TİD: {tid_aciklama}\n\n"
        "Aşağıdaki kurallara %100 uyarak bu teknik ister için sadece 2 adet sistem gereksinimi (SGD) üret:\n"
        "KURALLAR:\n"
        "1. Her biri sadece 1 cümle olmalı.\n"
        "2. Benzersiz, işlevsel, teknik ifadeler olmalı.\n"
        "3. Noktalama işareti, başlık, açıklama, örnek, giriş veya kapanış cümlesi kullanma.\n"
        "4. Sadece gereksinim cümlelerini alt alta yaz.\n"
        "5. Ekstra açıklama, özet, başlık, selamlama veya kapanış cümlesi ekleme.\n"
    )

    # Build system message from context
    system_message_parts = []
    if context_info:
        for key, label in [("system_context", "SISTEM BAĞLAMI"),
                           ("additional_context", "EK BAĞLAM"),
                           ("rag_context", "BİLGİ TABANI BAĞLAMI")]:
            if context_info.get(key):
                system_message_parts.append(f"{label}: {context_info[key]}\n")
    
    # Add RAG-enhanced context for this TID
    try:
        rag_sgd_context = get_rag_enhanced_context(tid_aciklama, "SGD")
        if rag_sgd_context:
            system_message_parts.append(f"İLGİLİ SGD ÖRNEKLERİ: {rag_sgd_context}\n")
            print(f"🔧 {tid_id} için RAG SGD context eklendi")
    except Exception as e:
        print(f"⚠️ RAG SGD context alınamadı: {e}")
    
    system_message = "\n".join(system_message_parts) if system_message_parts else None

    response_text = call_gemma3_api(prompt, system_message=system_message)
    if not response_text:
        print(f"❌ {MODEL_NAME} yanıt alamadı: {tid_id}")
        return []

    # Parse response lines
    lines = [line.strip("•*-") for line in response_text.strip().split("\n") if line.strip()]
    return [line for line in lines if len(line) > 10]

def generate_stts_with_llm(sgd_id, sgd_aciklama, context_info=None):
    """Generate STTs using Gemma 3 for given SGD with RAG enhancement"""
    prompt = (
        f"SGD: {sgd_aciklama}\n"
        "Bu gereksinimi karşılamak için sadece 2 adet sistem tasarım tanımı (STT) üret:\n"
        "- Her biri yalnızca 1 cümle olmalı.\n"
        "- Teknik çözüm, mimari yapı, uygulama yöntemi içermeli.\n"
        "- Numara, açıklama veya madde işareti yazma.\n"
        "- Sadece STT açıklaması yaz.\n"
        "- Asla ek cümle yazma, sadece STT'leri ver.\n"
        "- Cümleleri çok uzun tutma, net ol."
    )

    # Build system message from context
    system_message_parts = []
    if context_info:
        for key, label in [("system_context", "SISTEM BAĞLAMI"),
                           ("additional_context", "EK BAĞLAM"),
                           ("rag_context", "BİLGİ TABANI BAĞLAMI")]:
            if context_info.get(key):
                system_message_parts.append(f"{label}: {context_info[key]}\n")

    # Add RAG-enhanced context for this SGD
    try:
        rag_stt_context = get_rag_enhanced_context(sgd_aciklama, "STT")
        if rag_stt_context:
            system_message_parts.append(f"İLGİLİ STT ÖRNEKLERİ: {rag_stt_context}\n")
            print(f"🔧 {sgd_id} için RAG STT context eklendi")
    except Exception as e:
        print(f"⚠️ RAG STT context alınamadı: {e}")

    system_message = "\n".join(system_message_parts) if system_message_parts else None

    response_text = call_gemma3_api(prompt, system_message=system_message)
    if not response_text:
        print(f"❌ {MODEL_NAME} yanıt alamadı: {sgd_id}")
        return []

    # Parse response lines
    lines = [line.strip("•*- ") for line in response_text.strip().split("\n") if line.strip()]
    return [line for line in lines if len(line) > 10]

def generate_setets_with_llm(stt_id, stt_aciklama, context_info=None):
    """Generate SETETs (Test Documents) using Gemma 3 for given STT"""
    prompt = (
        f"STT: {stt_aciklama}\n"
        "Bu sistem tasarım tanımı için sadece 1 sistem entegrasyon test evrakı (SETET) üret:\n"
        "- Yalnızca 1 cümle olmalı.\n"
        "- Test senaryosu, doğrulama yöntemi, kabul kriterleri içermeli.\n"
        "- Numara, açıklama veya madde işareti yazma.\n"
        "- Sadece SETET açıklaması yaz.\n"
        "- Asla ek cümle yazma, sadece SETET'leri ver.\n"
        "- Cümleleri çok uzun tutma, net ol.\n"
        "- Test edilebilir, ölçülebilir kriterler belirt."
    )

    # Build system message from context
    system_message_parts = []
    if context_info:
        for key, label in [("system_context", "SISTEM BAĞLAMI"),
                           ("additional_context", "EK BAĞLAM")]:
            if context_info.get(key):
                system_message_parts.append(f"{label}: {context_info[key]}\n")

    system_message = "\n".join(system_message_parts) if system_message_parts else None

    response_text = call_gemma3_api(prompt, system_message=system_message)
    if not response_text:
        print(f"❌ {MODEL_NAME} yanıt alamadı: {stt_id}")
        return []

    # Parse response lines
    lines = [line.strip("•*- ") for line in response_text.strip().split("\n") if line.strip()]
    return [line for line in lines if len(line) > 10]

def generate_sitets_with_llm(sgd_id, sgd_aciklama, context_info=None):
    """Generate SITETs (System Integration Test Documents) using Gemma 3 for given SGD"""
    prompt = (
        f"SGD: {sgd_aciklama}\n"
        "Bu sistem gereksinimi için sadece 1 sistem integrasyon test evrakı (SITET) üret:\n"
        "- Yalnızca 1 cümle olmalı.\n"
        "- Sistem seviyesinde entegrasyon testi, doğrulama prosedürü, kabul kriterleri içermeli.\n"
        "- Numara, açıklama veya madde işareti yazma.\n"
        "- Sadece SITET açıklaması yaz.\n"
        "- Asla ek cümle yazma, sadece SITET'leri ver.\n"
        "- Cümleleri çok uzun tutma, net ol."
    )

    system_message_parts = []
    if context_info:
        for key, label in [("system_context", "SISTEM BAĞLAMI"),
                           ("additional_context", "EK BAĞLAM")]:
            if context_info.get(key):
                system_message_parts.append(f"{label}: {context_info[key]}\n")

    system_message = "\n".join(system_message_parts) if system_message_parts else None

    response_text = call_gemma3_api(prompt, system_message=system_message)
    if not response_text:
        print(f"❌ {MODEL_NAME} yanıt alamadı: {sgd_id}")
        return []

    lines = [line.strip("•*- ") for line in response_text.strip().split("\n") if line.strip()]
    return [line for line in lines if len(line) > 10]


def generate_kabul_muayene_with_llm(tid_id, tid_aciklama, context_info=None):
    """Generate KABUL MUAYENE (Acceptance Inspection) using Gemma 3 for given TID"""
    prompt = (
        f"TİD: {tid_aciklama}\n"
        "Bu teknik ister için sadece 1 kabul muayene evrakı üret:\n"
        "- Yalnızca 1 cümle olmalı.\n"
        "- Son kullanıcı kabul testleri, operasyonel doğrulama, nihai onay kriterleri içermeli.\n"
        "- Numara, açıklama veya madde işareti yazma.\n"
        "- Sadece kabul muayene açıklaması yaz.\n"
        "- Asla ek cümle yazma, sadece kabul muayeneleri ver.\n"
        "- Cümleleri çok uzun tutma, net ol."
    )

    system_message_parts = []
    if context_info:
        for key, label in [("system_context", "SISTEM BAĞLAMI"),
                           ("additional_context", "EK BAĞLAM")]:
            if context_info.get(key):
                system_message_parts.append(f"{label}: {context_info[key]}\n")

    system_message = "\n".join(system_message_parts) if system_message_parts else None

    response_text = call_gemma3_api(prompt, system_message=system_message)
    if not response_text:
        print(f"❌ {MODEL_NAME} yanıt alamadı: {tid_id}")
        return []

    lines = [line.strip("•*- ") for line in response_text.strip().split("\n") if line.strip()]
    return [line for line in lines if len(line) > 10]

def generate_all_requirements_batch(tid_list, system_context=None, context_selection=None):
    """
    Generate all requirements for multiple TIDs with chunking and batch-safe context handling.
    """
    additional_context = ""
    context_folder = manage_context_files()
    selected_file_path = None

    if context_selection is None:
        context_option = choose_context_option(context_folder)
    else:
        context_option = context_selection.get('option', 'none')
        selected_file_path = context_selection.get('file_path', None)

    if context_option != "none":
        if context_option == "existing":
            txt_file_path = selected_file_path or select_existing_context_file(context_folder)
            if txt_file_path and os.path.exists(txt_file_path):
                try:
                    with open(txt_file_path, "r", encoding="utf-8") as f:
                        additional_context = f.read()
                    print(f"✅ Mevcut context dosyası kullanılıyor: {os.path.basename(txt_file_path)}")
                except Exception as e:
                    print(f"❌ Context dosyası okunamadı: {e}")
        elif context_option == "new":
            context_file_path = selected_file_path
            if not context_file_path:
                root = tk.Tk()
                root.withdraw()
                messagebox.showinfo("Yeni Context File", "Yeni PDF dosyasını seçin")
                context_file_path = filedialog.askopenfilename(title="Yeni PDF seç", filetypes=[("PDF files","*.pdf")])
            if context_file_path:
                doc_result = process_document_with_pymupdf(context_file_path)
                if doc_result:
                    additional_context = doc_result['text']
                    txt_filename = f"{os.path.splitext(os.path.basename(context_file_path))[0]}_{datetime.now().strftime('%Y%m%d_%H%M%S')}.txt"
                    try:
                        with open(os.path.join(context_folder, txt_filename), "w", encoding="utf-8") as f:
                            f.write(additional_context)
                        print(f"✅ Yeni context dosyası kaydedildi: {txt_filename}")
                    except Exception as e:
                        print(f"❌ Context dosyası kaydedilemedi: {e}")
    else:
        print("ℹ️ Context dosyası olmadan devam ediliyor")

    context_info = {"system_context": system_context, "additional_context": additional_context}

    # Prepare batches
    batch_size = min(BATCH_SIZE if BATCH_SIZE else 2, 2)
    all_responses = {}

    for i in range(0, len(tid_list), batch_size):
        batch = tid_list[i:i+batch_size]
        print(f"🚀 LLM çağrısı için batch hazırlanıyor: {len(batch)} TID")

        # Build system message
        max_context_length = 8192
        system_parts = []
        if system_context:
            system_parts.append(f"SISTEM BAĞLAMI:\n{system_context[:max_context_length]}")

        if additional_context:
            if ENABLE_CHUNKING:
                chunks = []
                start_idx = 0
                while start_idx < len(additional_context):
                    chunks.append(additional_context[start_idx:start_idx+CHUNK_SIZE])
                    start_idx += CHUNK_SIZE - CHUNK_OVERLAP
                chunked_context = "\n---\n".join(chunks)[:max_context_length]
                system_parts.append(f"EK BAĞLAM (chunked):\n{chunked_context}")
            else:
                system_parts.append(f"EK BAĞLAM DOSYASI:\n{additional_context[:max_context_length]}")

        # Add RAG context
        general_rag_context = ""
        for tid_id, tid_desc in batch:
            general_rag_context += get_rag_enhanced_context(tid_desc, "general")
        if general_rag_context:
            system_parts.append(f"RAG BİLGİ TABANI BAĞLAMI:\n{general_rag_context[:max_context_length]}")

        system_message = "\n\n".join(system_parts) if system_parts else None

        # User prompt
        tid_section = "\n".join([f"{tid_id}: {tid_desc}" for tid_id, tid_desc in batch])
        user_prompt = f"""Aşağıdaki TİD'ler için tüm gereksinimleri üret (SGD, STT, SETET, SITET, KABUL MUAYENE). JSON formatında yanıt ver.

{tid_section}

Kurallar:
1. Her TID: 2 SGD, 4 STT, 2 SITET, 4 SETET, 1 KABUL MUAYENE
2. Tüm açıklamalar 1 cümle olmalı
3. Sadece gereksinim metinleri, ekstra açıklama yok
4. JSON formatı:
   {{ "TID1": {{ "tid_id": "...", "sgds":[...], "stts":[...], "setets":[...], "sitets":[...], "kabul_muayene":"..." }} ... }}
"""

        max_tokens = 50000 + len(batch) * 15000
        response_text = call_gemma3_api(user_prompt, max_tokens=max_tokens, temperature=0.4, system_message=system_message)

        if not response_text:
            print(f"❌ {MODEL_NAME} yanıt alamadı")
            continue

        # Clean JSON
        response_text = response_text.strip()
        for marker in ('```json', '```'):
            if response_text.startswith(marker):
                response_text = response_text[len(marker):].strip()
            if response_text.endswith(marker):
                response_text = response_text[:-len(marker)].strip()
        try:
            parsed_response = json.loads(response_text)
            all_responses.update(parsed_response)
        except json.JSONDecodeError as e:
            print(f"❌ JSON ayrıştırma hatası batch {i//batch_size+1}: {e}")
            continue

    print(f"✅ Tüm batchler işlendi, toplam {len(all_responses)} TID yanıtı alındı")
    return all_responses, context_info


# ------------------------------
# 2️⃣ Process Batch Response
# ------------------------------


def process_batch_response(batch_response, tid_list, context_info=None, global_counters=None):
    """Process the batch LLM response and convert to structured data with detailed logs"""
    all_data = []
    
    if global_counters is None:
        global_counters = {
            'sgd_counter': 1,
            'stt_counter': 1,
            'setet_counter': 1,
            'sitet_counter': 1,
            'kabul_muayene_counter': 1
        }
    
    if not batch_response:
        print("❌ Toplu yanıt boş, fallback moduna geçiliyor...")
        return None
    
    try:
        flexible_tid_mapping = {}
        for tid_id, tid_aciklama in tid_list:
            flexible_tid_mapping[tid_id] = (tid_id, tid_aciklama)
            flexible_tid_mapping[tid_id.replace('-', '')] = (tid_id, tid_aciklama)
            flexible_tid_mapping[tid_id.replace('-', '').replace('00', '')] = (tid_id, tid_aciklama)

        kabul_muayene_entries = {}
        expected_tid_ids = [tid_id for tid_id, _ in tid_list]
        
        for tid_key, tid_data in batch_response.items():
            if not isinstance(tid_data, dict):
                print(f"⚠️ Uyarı: {tid_key} için dict bekleniyordu, tip {type(tid_data)} geldi.")
                continue
            
            tid_id_from_response = tid_data.get('tid_id', tid_key)
            tid_match = None
            for candidate in [tid_id_from_response, tid_key]:
                if candidate in flexible_tid_mapping:
                    tid_match = flexible_tid_mapping[candidate]
                    break
            if not tid_match:
                print(f"⚠️ TID eşleşmesi bulunamadı: {tid_key}")
                continue
            tid_id, tid_aciklama = tid_match
            print(f"✅ İşleniyor: {tid_id} -> {tid_aciklama[:50]}...")
            
            # KABUL MUAYENE sakla
            kabul_muayene = tid_data.get('kabul_muayene', '').strip()
            if kabul_muayene:
                kabul_muayene_entries[tid_id] = {
                    'tid_id': tid_id,
                    'tid_aciklama': tid_aciklama,
                    'kabul_muayene_text': kabul_muayene
                }
                print(f"📋 KABUL MUAYENE bulundu: {tid_id} -> {kabul_muayene[:50]}...")

            # SGDs
            sgds = tid_data.get('sgds', [])
            expected_sgd_count = 2
            
            if len(sgds) < expected_sgd_count:
                missing_count = expected_sgd_count - len(sgds)
                for i in range(missing_count):
                    print(f"🔄 {tid_id} için eksik SGD {i+1}/{missing_count} LLM tarafından üretiliyor...")
                    generated_sgd = generate_sgds_with_llm(tid_id, tid_aciklama, context_info)
                    if generated_sgd:
                        sgds.append({"sgd_text": generated_sgd, "stts": []})
                        print(f"✅ {tid_id} eksik SGD başarıyla üretildi: {generated_sgd[:50]}...")
                    else:
                        print(f"❌ {tid_id} eksik SGD üretimi başarısız")

            # STTs, SETETs, SITETs
            stts = tid_data.get('stts', [])
            setets = tid_data.get('setets', [])
            sitets = tid_data.get('sitets', [])
            
            for sgd_index, sgd_data in enumerate(sgds):
                sgd_id = f"SGD-{global_counters['sgd_counter']:03d}"
                global_counters['sgd_counter'] += 1
                
                sgd_text = sgd_data.get('sgd_text', '') if isinstance(sgd_data, dict) else str(sgd_data)
                sgd_stts = sgd_data.get('stts', []) if isinstance(sgd_data, dict) else []

                if not sgd_stts and stts:
                    stts_per_sgd = 2
                    start_idx = sgd_index * stts_per_sgd
                    end_idx = start_idx + stts_per_sgd
                    sgd_stts = stts[start_idx:end_idx]
                    print(f"🔍 {sgd_id} için {len(sgd_stts)} STT atandı (top-level STT kullanıldı)")

                    if len(sgd_stts) < stts_per_sgd:
                        missing_stt_count = stts_per_sgd - len(sgd_stts)
                        for i in range(missing_stt_count):
                            print(f"🔄 {sgd_id} için eksik STT {i+1}/{missing_stt_count} LLM tarafından üretiliyor...")
                            generated_stts = generate_stts_with_llm(f"{sgd_id}_missing_{i+1}", sgd_text, context_info)
                            if generated_stts:
                                sgd_stts.append(generated_stts[0])
                                print(f"✅ {sgd_id} STT başarıyla üretildi: {generated_stts[0][:50]}...")
                            else:
                                sgd_stts.append(f"STT üretimi başarısız ({i+1})")
                                print(f"❌ {sgd_id} STT üretimi başarısız ({i+1})")
                
                sitet_text = ""
                if sitets and sgd_index < len(sitets):
                    sitet_text = sitets[sgd_index] if isinstance(sitets[sgd_index], str) else sitets[sgd_index].get('sitet_text', '')
                if not sitet_text:
                    print(f"🔄 {sgd_id} için SITET LLM tarafından üretiliyor...")
                    generated_sitets = generate_sitets_with_llm(sgd_id, sgd_text, context_info)
                    sitet_text = generated_sitets[0] if generated_sitets else "SITET üretimi başarısız"
                    print(f"✅ {sgd_id} SITET: {sitet_text[:50]}...")

                # STT ve SETET işleme
                for stt_index, stt_data in enumerate(sgd_stts[:2]):
                    stt_id = f"STT-{global_counters['stt_counter']:03d}"
                    global_counters['stt_counter'] += 1
                    
                    stt_text = stt_data.get('stt_text', '') if isinstance(stt_data, dict) else str(stt_data)
                    setet_text = ""
                    setet_index = sgd_index * 2 + stt_index
                    if setets and setet_index < len(setets):
                        setet_text = setets[setet_index] if isinstance(setets[setet_index], str) else setets[setet_index].get('setet_text', '')
                    if not setet_text:
                        print(f"🔄 {stt_id} için SETET LLM tarafından üretiliyor...")
                        generated_setets = generate_setets_with_llm(stt_id, stt_text, context_info)
                        setet_text = generated_setets[0] if generated_setets else "SETET üretimi başarısız"
                        print(f"✅ {stt_id} SETET: {setet_text[:50]}...")

                    setet_id = f"SETET-{global_counters['setet_counter']:03d}"
                    sitet_id = f"SITET-{global_counters['sitet_counter']:03d}"
                    global_counters['setet_counter'] += 1
                    
                    all_data.append({
                        "TID_ID": tid_id,
                        "TID_Aciklama": tid_aciklama,
                        "SGD_ID": sgd_id,
                        "SGD_Aciklama": sgd_text,
                        "STT_ID": stt_id,
                        "STT_Aciklama": stt_text,
                        "SETET_ID": setet_id,
                        "SETET_Aciklama": setet_text,
                        "SITET_ID": sitet_id,
                        "SITET_Aciklama": sitet_text
                    })
                
                global_counters['sitet_counter'] += 1
        
        # Eksik KABUL MUAYENE üret
        for tid_id, tid_aciklama in tid_list:
            if tid_id not in kabul_muayene_entries:
                print(f"🔄 {tid_id} için KABUL MUAYENE LLM tarafından üretiliyor...")
                generated_kabul = generate_kabul_muayene_with_llm(tid_id, tid_aciklama, context_info)
                kabul_text = generated_kabul[0] if generated_kabul else f"KABUL MUAYENE üretimi başarısız - {tid_id}"
                kabul_muayene_entries[tid_id] = {
                    'tid_id': tid_id,
                    'tid_aciklama': tid_aciklama,
                    'kabul_muayene_text': kabul_text
                }
                print(f"✅ {tid_id} KABUL MUAYENE: {kabul_text[:50]}...")
        
        # KABUL MUAYENE ekle
        for tid_id, kabul_data in kabul_muayene_entries.items():
            kabul_muayene_id = f"KABUL-{global_counters['kabul_muayene_counter']:03d}"
            global_counters['kabul_muayene_counter'] += 1
            all_data.append({
                "TID_ID": kabul_data['tid_id'],
                "TID_Aciklama": kabul_data['tid_aciklama'],
                "SGD_ID": "",
                "SGD_Aciklama": "",
                "STT_ID": "",
                "STT_Aciklama": "",
                "SETET_ID": "",
                "SETET_Aciklama": "",
                "SITET_ID": "",
                "SITET_Aciklama": "",
                "KABUL_MUAYENE_ID": kabul_muayene_id,
                "KABUL_MUAYENE_Aciklama": kabul_data['kabul_muayene_text']
            })
            print(f"✅ KABUL MUAYENE eklendi: {kabul_muayene_id} -> {tid_id}")
        
        print(f"✅ Toplu yanıt işlendi: {len(all_data)} kayıt oluşturuldu")
        return all_data
        
    except Exception as e:
        print(f"❌ Toplu yanıt işleme hatası: {e}")
        return None

# ------------------------------
# 3️⃣ Gemma 3 Connection Test
# ------------------------------

def test_gemma3_connection():
    """Test connection to Gemma 3 model via LM Studio"""
    print("🔍 Gemma 3 bağlantısı test ediliyor...")
    test_prompt = "Merhaba, Gemma 3! Kısa bir test cümlesi yaz."
    response = call_gemma3_api(test_prompt, max_tokens=100)
    if response:
        print(f"✅ Gemma 3 bağlantısı başarılı!")
        print(f"📝 Test yanıtı: {response}")
        return True
    else:
        print("❌ Gemma 3 bağlantısı başarısız!")
        detected_port = detect_lmstudio_port()
        if detected_port:
            update_choice = input("Config dosyasını güncellemek istiyor musunuz? (y/n): ").lower()
            if update_choice == 'y':
                update_config_port(detected_port)
                print("🔄 Lütfen programı yeniden çalıştırın.")
            return False
        else:
            print("🔧 Kontrol edilecekler:")
            print("   - LM Studio çalışıyor mu?")
            print("   - Local Server sekmesinde 'Start Server' butonuna bastınız mı?")
            print("   - Gemma 3 modeli yüklü mü?")
            print("   - Firewall LM Studio'yu engelliyor mu?")
            return False

def detect_lmstudio_port():
    """Try to detect which port LM Studio is running on"""
    common_ports = [1234, 8080, 3000, 5000, 8000, 11434]
    print("🔍 LM Studio portunu tespit ediliyor...")
    for port in common_ports:
        try:
            test_url = f"http://localhost:{port}/v1/models"
            response = requests.get(test_url, timeout=5)
            if response.status_code == 200:
                print(f"✅ LM Studio {port} portunda çalışıyor!")
                return port
        except requests.RequestException:
            continue
    print("❌ LM Studio hiçbir standart portta bulunamadı.")
    return None

def update_config_port(new_port):
    """Update the config file with the detected port"""
    try:
        with open('config.py', 'r', encoding='utf-8') as f:
            content = f.read()
        updated_content = content.replace(
            'LMSTUDIO_BASE_URL = "http://localhost:1234/v1"',
            f'LMSTUDIO_BASE_URL = "http://localhost:{new_port}/v1"'
        )
        with open('config.py', 'w', encoding='utf-8') as f:
            f.write(updated_content)
        print(f"✅ Config dosyası güncellendi: http://localhost:{new_port}/v1")
    except Exception as e:
        print(f"❌ Config dosyası güncellenirken hata oluştu: {e}")

if __name__ == "__main__":
    test_gemma3_connection()