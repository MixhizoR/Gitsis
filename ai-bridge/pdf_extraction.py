# -*- coding: utf-8 -*-
"""
PDF to TXT Extractor with PyMuPDF + SymSpell correction
Saves extracted text directly into the specified context_files folder
"""

import os
import time
import tkinter as tk
from tkinter import filedialog
from datetime import datetime

# PyMuPDF import
try:
    import fitz
    PYMUPDF_AVAILABLE = True
except ImportError:
    PYMUPDF_AVAILABLE = False
    print("⚠️ PyMuPDF not installed - install with: pip install PyMuPDF")

# SymSpell import
try:
    from symspellpy.symspellpy import SymSpell, Verbosity
    SYMSPELL_AVAILABLE = True
except ImportError:
    SYMSPELL_AVAILABLE = False
    print("⚠️ SymSpell not available")

# TXT files save directory
CONTEXT_FOLDER = os.path.join(os.path.dirname(os.path.abspath(__file__)), "context_files")
os.makedirs(CONTEXT_FOLDER, exist_ok=True)

def select_pdf_file():
    """Open file dialog to select a PDF file"""
    root = tk.Tk()
    root.withdraw()
    file_path = filedialog.askopenfilename(
        title="Select PDF file",
        filetypes=[("PDF files", "*.pdf"), ("All files", "*.*")]
    )
    root.destroy()
    return file_path

def extract_pdf_to_txt(pdf_path):
    """Extract text from PDF using PyMuPDF (layout-preserving)"""
    if not PYMUPDF_AVAILABLE:
        print("❌ PyMuPDF not available")
        return None
    try:
        start_time = time.time()
        with fitz.open(pdf_path) as doc:
            text_content = "\n".join(
                f"--- Page {i+1} ---\n" +
                " ".join(b[4] for b in sorted(page.get_text("blocks"), key=lambda x: (x[1], x[0])))
                for i, page in enumerate(doc)
                if page.get_text("blocks")
            )
        print(f"✅ Extraction completed in {time.time() - start_time:.2f}s, {len(text_content)} characters")
        return text_content
    except Exception as e:
        print(f"❌ Extraction failed: {e}")
        return None

def setup_symspell():
    """Initialize SymSpell with dictionary if available"""
    if not SYMSPELL_AVAILABLE:
        return None
    try:
        sym_spell = SymSpell(max_dictionary_edit_distance=2, prefix_length=7)
        dict_path = "frequency_dictionary_en_82_765.txt"
        if os.path.exists(dict_path):
            sym_spell.load_dictionary(dict_path, term_index=0, count_index=1)
            print(f"✅ SymSpell dictionary loaded: {dict_path}")
            return sym_spell
        print(f"⚠️ Dictionary file not found: {dict_path}")
    except Exception as e:
        print(f"❌ Failed to setup SymSpell: {e}")
    return None

def correct_text_with_symspell(text, sym_spell):
    """Correct words using SymSpell"""
    if not (sym_spell and text):
        return text
    corrected = [
        sym_spell.lookup(word, Verbosity.CLOSEST, max_edit_distance=2)[0].term
        if sym_spell.lookup(word, Verbosity.CLOSEST, max_edit_distance=2)
        else word
        for word in text.split()
    ]
    return " ".join(corrected)

def save_txt(content, pdf_path):
    """Save text into context_files folder"""
    if not content:
        return None
    base_name = os.path.splitext(os.path.basename(pdf_path))[0]
    txt_filename = f"{base_name}_{datetime.now().strftime('%Y%m%d_%H%M%S')}.txt"
    txt_path = os.path.join(CONTEXT_FOLDER, txt_filename)
    try:
        with open(txt_path, "w", encoding="utf-8") as f:
            f.write(content)
        print(f"💾 TXT saved: {txt_path}")
        return txt_path
    except Exception as e:
        print(f"❌ Failed to save TXT: {e}")
        return None

def main():
    """Main menu loop"""
    print("🔧 PDF to TXT Extractor Tool (with optional SymSpell correction)")
    print("=" * 50)

    sym_spell = setup_symspell()

    while True:
        print("\nSelect an option:")
        print("  [1] Extract PDF to TXT")
        print("  [2] Exit")
        try:
            choice = input("\nEnter choice (1-2): ").strip()
            if choice == '1':
                pdf_file = select_pdf_file()
                if not pdf_file:
                    print("❌ No PDF selected")
                    continue
                txt_content = extract_pdf_to_txt(pdf_file)
                if txt_content and sym_spell:
                    txt_content = correct_text_with_symspell(txt_content, sym_spell)
                if txt_content:
                    save_txt(txt_content, pdf_file)
            elif choice == '2':
                print("👋 Exiting...")
                break
            else:
                print("❌ Invalid choice. Please enter 1 or 2.")
        except (KeyboardInterrupt, EOFError):
            print("\n👋 Exiting...")
            break
        except Exception as e:
            print(f"❌ Error: {e}")

if __name__ == "__main__":
    main()