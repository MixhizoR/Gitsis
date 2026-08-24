# -*- coding: utf-8 -*-
"""Configuration for the EHSIM AI bridge (api_server.py)"""
import os

# LM Studio Configuration
# Adres environment'dan okunur (LMSTUDIO_URL), yoksa varsayilan kullanilir.
LMSTUDIO_BASE_URL = os.getenv("LMSTUDIO_URL", "http://localhost:1234/v1")  # LM Studio API URL
LMSTUDIO_API_KEY = "lm-studio"                   # LM Studio API key
MODEL_NAME = "google/gemma-3-4b"                 # Your LM Studio model (API Model Identifier)
