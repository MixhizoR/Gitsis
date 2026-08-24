# -*- coding: utf-8 -*-
"""File handling operations for TID document processing"""

import os
import pandas as pd
import tkinter as tk
from tkinter import filedialog, messagebox
import webbrowser

def read_tid_document():
    """Read TID document from file using GUI dialog"""
    
    root = tk.Tk()
    root.withdraw()
    messagebox.showinfo("TİD Dosyası Seç", "Lütfen TİD dosyasını seçin (örnek format: TİD-001 | Açıklama)")

    file_path = filedialog.askopenfilename(
        title="TİD Dosyası Seç",
        filetypes=[("Text or CSV Files", "*.txt;*.csv"), ("All Files", "*.*")]
    )

    if not file_path:
        return None

    try:
        with open(file_path, "r", encoding="utf-8") as f:
            lines = f.read().strip().split("\n")

        # Skip header line if it contains 'ID'
        if lines and '|' in lines[0] and 'ID' in lines[0]:
            lines = lines[1:]

        tid_data = [
            {"TID_ID": line.split('|', 1)[0].strip(), "TID_Aciklama": line.split('|', 1)[1].strip()}
            for line in lines if '|' in line
        ]

        return pd.DataFrame(tid_data) if tid_data else None

    except Exception as e:
        print(f"❌ Error reading TID file: {e}")
        return None

def save_html_file(html_content, filename):
    """Save HTML content to file"""
    try:
        with open(filename, "w", encoding="utf-8") as f:
            f.write(html_content)
        print(f"💾 HTML dosyası kaydedildi: {os.path.abspath(filename)}")
        return True
    except Exception as e:
        print(f"❌ Error saving HTML file: {e}")
        return False

def open_html_file(filename):
    """Open HTML file in default browser"""
    try:
        webbrowser.open(os.path.abspath(filename))
        return True
    except Exception as e:
        print(f"❌ Error opening HTML file: {e}")
        return False