# -*- coding: utf-8 -*-
"""Data processing functions for TID, SGD, and STT handling"""

import pandas as pd
from llm_handler import (
    generate_all_requirements_batch, process_batch_response
)
from config import BATCH_SIZE, CHUNK_SIZE, CHUNK_OVERLAP, ENABLE_CHUNKING

def chunk_document(document):
    if ENABLE_CHUNKING:
        # chunk işlemi
        chunks = []
        for i in range(0, len(document), CHUNK_SIZE - CHUNK_OVERLAP):
            chunk = document[i:i+CHUNK_SIZE]
            chunks.append(chunk)
        return chunks
    else:
        return [document]

def _normalize_tid_dataframe(tid_df):
    """Normalize and validate TID DataFrame columns"""
    if tid_df is None or tid_df.empty:
        print("❌ TID DataFrame boş")
        return None

    tid_df = tid_df.rename(columns=lambda x: x.strip())

    if 'ID' not in tid_df.columns or 'Açıklama' not in tid_df.columns:
        possible_id_cols = [col for col in tid_df.columns if 'id' in col.lower()]
        possible_desc_cols = [col for col in tid_df.columns if 'aciklama' in col.lower() or 'description' in col.lower()]

        if possible_id_cols and possible_desc_cols:
            tid_df = tid_df.rename(columns={possible_id_cols[0]: 'ID', possible_desc_cols[0]: 'Açıklama'})
            print(f"ℹ️ Sütun isimleri otomatik olarak yeniden adlandırıldı: ID='{possible_id_cols[0]}', Açıklama='{possible_desc_cols[0]}'")
        else:
            print("❌ ID veya Açıklama sütunları bulunamadı.")
            print(f"Mevcut sütunlar: {tid_df.columns.tolist()}")
            return None

    return tid_df

def _update_global_counters(last_counter_vals, global_counters):
    if global_counters is None:
        return {
            'sgd_counter': int(last_counter_vals.get('SGD_ID', 'SGD-0').split('-')[1]) + 1 if last_counter_vals.get('SGD_ID') else 1,
            'stt_counter': int(last_counter_vals.get('STT_ID', 'STT-0').split('-')[1]) + 1 if last_counter_vals.get('STT_ID') else 1,
            'setet_counter': int(last_counter_vals.get('SETET_ID', 'SETET-0').split('-')[1]) + 1 if last_counter_vals.get('SETET_ID') else 1,
            'sitet_counter': int(last_counter_vals.get('SITET_ID', 'SITET-0').split('-')[1]) + 1 if last_counter_vals.get('SITET_ID') else 1,
            'kabul_muayene_counter': int(last_counter_vals.get('KABUL_MUAYENE_ID', 'KABUL-0').split('-')[1]) + 1 if last_counter_vals.get('KABUL_MUAYENE_ID') else 1
        }
    return global_counters

def process_tid_data_batch(tid_df):
    """Process multiple TIDs in batch mode using LLM"""
    tid_df = _normalize_tid_dataframe(tid_df)
    if tid_df is None:
        return None

    tid_list = [(row['ID'], row['Açıklama']) for _, row in tid_df.iterrows()]

    all_results, global_counters = [], None

    for i in range(0, len(tid_list), BATCH_SIZE):
        batch = tid_list[i:i+BATCH_SIZE]
        print(f"🚀 Batch işleniyor: {i+1}-{i+len(batch)} / {len(tid_list)}")
        batch_response, context_info = generate_all_requirements_batch(batch)
        if batch_response:
            batch_data = process_batch_response(batch_response, batch, context_info, global_counters)
            if batch_data:
                all_results.extend(batch_data)
                last_counter_vals = batch_data[-1]
                global_counters = _update_global_counters(last_counter_vals, global_counters)

    if all_results:
        return pd.DataFrame(all_results)
    else:
        print("❌ Batch işleme sonucu boş")
        return None

def process_tid_data_fallback(tid_df, context_info=None, global_counters=None):
    """Fallback to individual processing if batch processing fails"""
    print("🔄 Fallback: TİD verilerini tek tek işleniyor...")
    return process_tid_data(tid_df)

def process_tid_data(tid_df):
    """Process TIDs one by one using LLM"""
    tid_df = _normalize_tid_dataframe(tid_df)
    if tid_df is None:
        return None

    tid_list = [(row['ID'], row['Açıklama']) for _, row in tid_df.iterrows()]
    all_results, global_counters = [], None

    for idx, tid in enumerate(tid_list):
        print(f"🚀 İşleniyor: {tid[0]} ({idx+1}/{len(tid_list)})")
        batch_response, context_info = generate_all_requirements_batch([tid])
        if batch_response:
            batch_data = process_batch_response(batch_response, [tid], context_info, global_counters)
            if batch_data:
                all_results.extend(batch_data)
                last_counter_vals = batch_data[-1]
                global_counters = _update_global_counters(last_counter_vals, global_counters)

    if all_results:
        return pd.DataFrame(all_results)
    else:
        print("❌ Tek tek işleme sonucu boş")
        return None

def create_tree_structure(trace_df):
    """Create hierarchical tree structure from DataFrame"""
    print("🌳 Ağaç yapısı oluşturuluyor...")
    
    tree = {}
    for _, row in trace_df.iterrows():
        tid_id = row["TID_ID"]
        tid_content = row.get("TID_Aciklama", "")
        
        if tid_id not in tree:
            tree[tid_id] = {
                "content": tid_content,
                "sgds": {}
            }
        
        sgd_id = row.get("SGD_ID")
        if sgd_id and sgd_id not in tree[tid_id]["sgds"]:
            tree[tid_id]["sgds"][sgd_id] = {
                "content": row.get("SGD_Aciklama", ""),
                "stts": {}
            }
        
        stt_id = row.get("STT_ID")
        if stt_id and sgd_id and stt_id not in tree[tid_id]["sgds"][sgd_id]["stts"]:
            tree[tid_id]["sgds"][sgd_id]["stts"][stt_id] = {
                "content": row.get("STT_Aciklama", ""),
                "setets": []
            }
        
        setet_id = row.get("SETET_ID")
        if setet_id and sgd_id and stt_id:
            tree[tid_id]["sgds"][sgd_id]["stts"][stt_id]["setets"].append({
                "id": setet_id,
                "content": row.get("SETET_Aciklama", "")
            })
    
    print("✅ Ağaç yapısı oluşturuldu")
    return tree

def create_flat_test_data(trace_df):
    """Create flat data structure for all test documents with their bindings"""
    print("📋 Test verisi yapısı oluşturuluyor...")
    
    flat_data = {}
    
    for _, row in trace_df.iterrows():
        # Add SETET (bound to STT) - only if not empty
        setet_id = row.get("SETET_ID")
        if setet_id and pd.notna(setet_id) and setet_id.strip():
            flat_data[setet_id] = {
                "type": "SETET",
                "content": row.get("SETET_Aciklama", ""),
                "bound_to": f"STT: {row.get('STT_ID', '')}",
                "parent_hierarchy": f"TID: {row.get('TID_ID', '')} → SGD: {row.get('SGD_ID', '')} → STT: {row.get('STT_ID', '')}"
            }
        
        # Add SITET (bound to SGD) - only if not empty
        sitet_id = row.get("SITET_ID")
        if sitet_id and pd.notna(sitet_id) and sitet_id.strip():
            flat_data[sitet_id] = {
                "type": "SITET",
                "content": row.get("SITET_Aciklama", ""),
                "bound_to": f"SGD: {row.get('SGD_ID', '')}",
                "parent_hierarchy": f"TID: {row.get('TID_ID', '')} → SGD: {row.get('SGD_ID', '')}"
            }
        
        # Add KABUL MUAYENE (bound to TID) - only if not empty
        kabul_id = row.get("KABUL_MUAYENE_ID")
        kabul_content = row.get("KABUL_MUAYENE_Aciklama", "")
        if (kabul_id and pd.notna(kabul_id) and kabul_id.strip() and 
            kabul_content and kabul_content.strip() and kabul_content != "KABUL MUAYENE bilgisi eksik"):
            flat_data[kabul_id] = {
                "type": "KABUL MUAYENE",
                "content": kabul_content,
                "bound_to": f"TID: {row.get('TID_ID', '')}",
                "parent_hierarchy": f"TID: {row.get('TID_ID', '')}"
            }
    
    print(f"✅ {len(flat_data)} test belgesi yapısı oluşturuldu")
    
    # Debug: Print KABUL MUAYENE entries found
    kabul_entries = {k: v for k, v in flat_data.items() if v.get('type') == 'KABUL MUAYENE'}
    if kabul_entries:
        print(f"🔍 {len(kabul_entries)} KABUL MUAYENE girişi bulundu:")
        for k, v in kabul_entries.items():
            print(f"  - {k}: {v['content'][:100]}...")
    else:
        print("⚠️ Hiç KABUL MUAYENE girişi bulunamadı!")
    
    return flat_data