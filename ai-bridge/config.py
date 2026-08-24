# -*- coding: utf-8 -*-
"""Configuration file for IEEE 15288 LLM system"""
import os

# --- LLM API Configuration ---
# LM Studio Configuration
# Adres environment'dan okunur (LMSTUDIO_URL), yoksa varsayilan kullanilir.
LMSTUDIO_BASE_URL = os.getenv("LMSTUDIO_URL", "http://localhost:1234/v1")  # LM Studio API URL
LMSTUDIO_API_KEY = "lm-studio"                   # LM Studio API key
MODEL_NAME = "google/gemma-3-4b"                 # Your LM Studio model (API Model Identifier)

# --- Model Processing Constraints ---
# Maksimum context token uzunluğunu 4096/8192 civarında tutuyoruz
# (yüksek ayarlarsan model VRAM/RAM yüzünden yüklenmez).
MAX_CONTEXT_TOKENS = 8192  

# --- Chunking Settings ---
# Büyük belgeler için parçalama (RAG uyumlu)
CHUNK_SIZE = 4000    # her parçanın token boyutu (ortalama 1500 token)
CHUNK_OVERLAP = 50   # parçalar arasında biraz örtüşme
ENABLE_CHUNKING = True     # Chunking aktif/pasif kontrolü

# --- Pasif Radar Context ---
PASIF_RADAR_CONTEXT = """PASİF RADAR KAPSAMI:

 Pasif radar sistemleri, kendi sinyalini yaymadan, mevcut elektromanyetik yayınları (FM radyo, DVB-T, analog TV vb.) kullanarak hedeflerin konumunu, hızını ve hareket yönünü belirler. Yayıncı sinyali referans olarak kullanılırken, hedeften yansıyan sinyal surveillance kanalı tarafından alınır. Pasif radar sistemleri genellikle aşağıdaki alt bileşenlerden oluşur:
 - Referans ve surveillance kanalları
 - TDOA ve FDOA hesaplamaları
 - Dijital beamforming
 - Doppler analiz (hız tespiti)
 - Çoklu frekans ve bant desteği (FM, DVB-T2, DAB)
 - Multistatik (çok istasyonlu) yapı
 - Stealth hedef tespiti
 - Gerçek zamanlı işleme (saniyelik güncelleme)
 - Yüksek dinamik aralık, düşük gürültü seviyesi
 - Elektronik karıştırmaya (jamming) dayanıklı çalışma
 - Sinyal sınıflandırma (özellikle PRISM gibi sistemlerde)

 IEEE 15288 STANDART KAPSAMI:
 - Stakeholder Needs and Requirements Definition
 - System Requirements Definition (işlevsel, performans, güvenlik, arayüz vb.)
 - Architectural Design (mimari yapı, bağlantılar)
 - Detailed Design (modül detayları, algoritmalar)
 """

# --- File Settings ---
OUTPUT_HTML_FILE = "IEEE15288LLMVAR.html"
SLEEP_DURATION = 0  # seconds between LLM calls

# --- Processing Settings ---
USE_BATCH_PROCESSING = True   # Set to False to use individual processing
BATCH_SIZE = 10               # Maximum number of TIDs to process in one batch call