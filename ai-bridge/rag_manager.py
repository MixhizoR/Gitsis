#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""RAG Knowledge Base Management Script for IEEE 15288 Traceability System"""

import os
from rag_handler import initialize_rag_system, build_rag_knowledge_base, get_rag_info, rag_handler

def display_rag_status():
    """Display current RAG system status"""
    print("=" * 60)
    print("🔍 RAG SİSTEMİ DURUMU")
    print("=" * 60)
    
    info = get_rag_info()
    
    print(f"📁 Döküman klasörü: {info['data_path']}")
    print(f"🗄️ Vector veritabanı: {info['chroma_path']}")
    print(f"📚 Döküman klasörü mevcut: {'✅' if info['documents_folder_exists'] else '❌'}")
    print(f"🗄️ Veritabanı mevcut: {'✅' if info['database_exists'] else '❌'}")
    print(f"🧠 Embeddings hazır: {'✅' if info['embeddings_initialized'] else '❌'}")
    print(f"🔗 Veritabanı bağlı: {'✅' if info['database_loaded'] else '❌'}")
    print(f"📊 Toplam chunk sayısı: {info['total_chunks']}")
    
    print("\n" + "=" * 60)

def setup_rag_system():
    """Setup RAG system"""
    print("🚀 RAG sistemini kuruyor...")
    
    rag_system = initialize_rag_system()
    
    print("\n✅ RAG sistemi kuruldu!")
    print(f"📁 Dökümanlarınızı şu klasörlere ekleyin:")
    print(f"   - IEEE standartları: {rag_system.data_path}/ieee_standards/")
    print(f"   - Radar dökümanları: {rag_system.data_path}/radar_docs/")
    print(f"   - Teknik spesifikasyonlar: {rag_system.data_path}/technical_specs/")
    print(f"   - Mevcut gereksinimler: {rag_system.data_path}/existing_requirements/")
    
    return rag_system

def build_knowledge_base():
    """Build the RAG knowledge base"""
    print("🏗️ Bilgi tabanını oluşturuyor...")
    
    success = build_rag_knowledge_base(force_rebuild=True)
    
    if success:
        print("✅ Bilgi tabanı başarıyla oluşturuldu!")
    else:
        print("❌ Bilgi tabanı oluşturulamadı.")
    
    return success

def test_rag_query():
    """Test RAG query functionality"""
    print("🧪 RAG sorgu testini yapıyor...")
    
    test_queries = [
        "sistem gereksinimleri",
        "IEEE 15288 standartları",
        "pasif radar sistemi",
        "test gereksinimleri"
    ]
    
    for query in test_queries:
        print(f"\n🔍 Test sorgusu: '{query}'")
        try:
            results = rag_handler.query_knowledge_base(query, k=2)
            if results:
                print(f"   ✅ {len(results)} sonuç bulundu")
                for i, (doc, score) in enumerate(results, 1):
                    print(f"   {i}. Skor: {score:.3f}, İçerik: {doc.page_content[:100]}...")
            else:
                print("   ❌ Sonuç bulunamadı")
        except Exception as e:
            print(f"   ❌ Hata: {e}")

def add_sample_documents():
    """Add sample documents to knowledge base"""
    print("📄 Örnek dökümanlar ekleniyor...")
    
    # Create sample documents
    sample_docs = {
        "ieee_15288_sample.txt": """
IEEE 15288 Sistem ve Yazılım Mühendisliği Standartları

Sistem Gereksinimleri:
- Sistem fonksiyonel gereksinimleri tanımlanmalıdır
- Performans gereksinimleri belirtilmelidir
- Güvenlik gereksinimleri dokümante edilmelidir
- Arayüz gereksinimleri detaylandırılmalıdır

Sistem Tasarım Tanımları:
- Mimari tasarım spesifikasyonları hazırlanmalıdır
- Bileşen tasarım dokümantasyonu oluşturulmalıdır
- Arayüz tasarım spesifikasyonları tanımlanmalıdır
- Veri tasarım dokümantasyonu hazırlanmalıdır

Test Gereksinimleri:
- Birim test prosedürleri tanımlanmalıdır
- Entegrasyon test senaryoları hazırlanmalıdır
- Sistem test planları oluşturulmalıdır
- Kabul test kriterleri belirlenmelidir
        """,
        
        "radar_systems_sample.txt": """
Pasif Radar Sistemi Gereksinimleri

Sistem Özellikleri:
- FM/DAB/DVB-T sinyal kaynaklarını kullanmalıdır
- Çok kanallı sinyal işleme yapabilmelidir
- Gerçek zamanlı hedef tespiti sağlamalıdır
- 100km menzilde hedef tespit edebilmelidir

Tasarım Gereksinimleri:
- Uyarlamalı beam forming algoritması uygulanmalıdır
- Doppler işleme modülü entegre edilmelidir
- Clutter bastırma teknikleri kullanılmalıdır
- Machine learning tabanlı sınıflandırma yapılmalıdır

Test Gereksinimleri:
- Sinyal kalitesi %95 doğrulukla test edilmelidir
- Hedef tespit performansı ölçülmelidir
- Yanlış alarm oranı %1'in altında olmalıdır
- Sistem 24/7 kesintisiz çalışabilmelidir
        """,
        
        "technical_specs_sample.txt": """
Teknik Sistem Spesifikasyonları

Donanım Gereksinimleri:
- İşlemci: Intel Xeon E5-2690 veya üstü
- RAM: Minimum 32GB DDR4
- Depolama: 1TB SSD RAID yapılandırması
- Ağ: Gigabit Ethernet bağlantısı

Yazılım Gereksinimleri:
- İşletim sistemi: Linux Ubuntu 20.04 LTS
- Programlama dili: Python 3.8+, C++17
- Veritabanı: PostgreSQL 12+
- Real-time framework: ROS2 Foxy

Performans Gereksinimleri:
- Latency: <100ms
- Throughput: >1000 TPS
- Availability: %99.9
- Recovery time: <30 saniye
        """
    }
    
    # Create sample files
    for filename, content in sample_docs.items():
        if "ieee" in filename:
            category = "ieee_standards"
        elif "radar" in filename:
            category = "radar_docs"
        else:
            category = "technical_specs"
        
        category_path = os.path.join(rag_handler.data_path, category)
        if not os.path.exists(category_path):
            os.makedirs(category_path)
        
        file_path = os.path.join(category_path, filename)
        with open(file_path, "w", encoding="utf-8") as f:
            f.write(content.strip())
        
        print(f"✅ Oluşturuldu: {filename}")
    
    print("\n📚 Örnek dökümanlar eklendi. Şimdi bilgi tabanını yeniden oluşturun.")

def main_menu():
    """Main menu for RAG management"""
    while True:
        print("\n" + "=" * 60)
        print("🤖 IEEE 15288 RAG SİSTEMİ YÖNETİMİ")
        print("=" * 60)
        print("1. 🔍 RAG sistem durumunu göster")
        print("2. 🚀 RAG sistemini kur")
        print("3. 📄 Örnek dökümanlar ekle")
        print("4. 🏗️ Bilgi tabanını oluştur")
        print("5. 🧪 RAG sorgu testi yap")
        print("6. 📁 RAG klasörünü aç")
        print("0. 🚪 Çıkış")
        print("=" * 60)
        
        choice = input("Seçiminizi yapın (0-6): ").strip()
        
        if choice == "1":
            display_rag_status()
        elif choice == "2":
            setup_rag_system()
        elif choice == "3":
            add_sample_documents()
        elif choice == "4":
            build_knowledge_base()
        elif choice == "5":
            test_rag_query()
        elif choice == "6":
            import subprocess
            try:
                # Windows için
                subprocess.run(['explorer', rag_handler.data_path])
            except:
                print(f"📁 Klasör yolu: {rag_handler.data_path}")
        elif choice == "0":
            print("👋 RAG yönetimi kapatılıyor...")
            break
        else:
            print("❌ Geçersiz seçim. Lütfen 0-6 arası bir sayı girin.")

if __name__ == "__main__":
    print("🤖 IEEE 15288 RAG Sistem Yönetimi")
    main_menu()
