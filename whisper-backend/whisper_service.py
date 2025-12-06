#!/usr/bin/env python3
"""
Whisper Subtitle Generation Service
Uses faster-whisper for optimized real-time transcription
"""

import os
import sys
import json
import logging
from flask import Flask, request, jsonify
from flask_cors import CORS
from faster_whisper import WhisperModel
import numpy as np
from datetime import datetime
import wave
import io

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Initialize Flask app
app = Flask(__name__)
CORS(app)

# Global Whisper model (loaded once)
whisper_model = None
model_size = os.getenv('WHISPER_MODEL', 'tiny')  # tiny is 4x faster than base
# Use auto for Apple Silicon to enable CoreML acceleration (10-20x faster)
device = "auto"  # auto detects best device (CoreML on Apple Silicon, CUDA on NVIDIA)
compute_type = "auto"  # auto selects optimal precision

def load_model():
    """Load Whisper model (cached in memory)"""
    global whisper_model
    
    if whisper_model is not None:
        logger.info("Using cached Whisper model ⚡")
        return whisper_model
    
    logger.info(f"Loading Whisper model: {model_size}...")
    logger.info("First run will download model (~150MB), please wait...")
    
    try:
        whisper_model = WhisperModel(
            model_size, 
            device=device, 
            compute_type=compute_type
        )
        logger.info(f"✅ Whisper model '{model_size}' loaded successfully!")
        return whisper_model
    except Exception as e:
        logger.error(f"❌ Failed to load Whisper model: {e}")
        raise

def convert_audio_to_wav(audio_data, sample_rate=16000):
    """Convert audio bytes to WAV format"""
    try:
        # Create WAV file in memory
        wav_buffer = io.BytesIO()
        with wave.open(wav_buffer, 'wb') as wav_file:
            wav_file.setnchannels(1)  # Mono
            wav_file.setsampwidth(2)  # 16-bit
            wav_file.setframerate(sample_rate)
            wav_file.writeframes(audio_data)
        
        wav_buffer.seek(0)
        return wav_buffer
    except Exception as e:
        logger.error(f"Audio conversion error: {e}")
        raise

@app.route('/health', methods=['GET'])
def health_check():
    """Health check endpoint"""
    return jsonify({
        'status': 'healthy',
        'model': model_size,
        'device': device,
        'timestamp': datetime.utcnow().isoformat()
    })

@app.route('/transcribe', methods=['POST'])
def transcribe_audio():
    """
    Transcribe audio chunk to text
    
    Expected request:
    - Content-Type: audio/wav or application/octet-stream
    - Body: Audio data (WAV format, 16kHz, mono)
    - Query params: language (optional, default: auto-detect)
    """
    start_time = datetime.now()
    
    try:
        # Get audio data
        if 'file' in request.files:
            audio_file = request.files['file']
            audio_data = audio_file.read()
        else:
            audio_data = request.data
        
        if not audio_data:
            return jsonify({'error': 'No audio data provided'}), 400
        
        # Get language parameter
        language = request.args.get('language', 'auto')
        if language == 'auto':
            language = None  # Let Whisper auto-detect
        
        # Save audio temporarily
        temp_path = f"uploads/temp_{datetime.now().timestamp()}.wav"
        with open(temp_path, 'wb') as f:
            f.write(audio_data)
        
        # Transcribe
        logger.info(f"Transcribing audio ({len(audio_data)} bytes)...")
        model = load_model()
        
        segments, info = model.transcribe(
            temp_path,
            language=language,
            beam_size=5,
            vad_filter=True,  # Voice activity detection (filters silence)
            vad_parameters=dict(min_silence_duration_ms=500)
        )
        
        # Collect all segments
        transcription = ""
        all_segments = []
        
        for segment in segments:
            transcription += segment.text + " "
            all_segments.append({
                'start': segment.start,
                'end': segment.end,
                'text': segment.text.strip()
            })
        
        # Clean up
        try:
            os.remove(temp_path)
        except:
            pass
        
        # Calculate processing time
        processing_time = (datetime.now() - start_time).total_seconds()
        
        logger.info(f"✅ Transcription complete ({processing_time:.2f}s): {transcription.strip()[:100]}...")
        
        return jsonify({
            'success': True,
            'text': transcription.strip(),
            'segments': all_segments,
            'language': info.language,
            'language_probability': info.language_probability,
            'duration': info.duration,
            'processing_time': processing_time
        })
        
    except Exception as e:
        logger.error(f"Transcription error: {e}", exc_info=True)
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@app.route('/languages', methods=['GET'])
def get_supported_languages():
    """Get list of supported languages"""
    languages = {
        'en': 'English',
        'es': 'Spanish',
        'fr': 'French',
        'de': 'German',
        'it': 'Italian',
        'pt': 'Portuguese',
        'ru': 'Russian',
        'zh': 'Chinese',
        'ja': 'Japanese',
        'ko': 'Korean',
        'ar': 'Arabic',
        'hi': 'Hindi',
        'auto': 'Auto-detect'
    }
    
    return jsonify({
        'languages': languages,
        'default': 'auto'
    })

if __name__ == '__main__':
    port = int(os.getenv('PORT', 8765))
    
    logger.info('=' * 60)
    logger.info('🎙️  Whisper Subtitle Service Starting...')
    logger.info('=' * 60)
    logger.info(f'Model: {model_size}')
    logger.info(f'Device: {device}')
    logger.info(f'Port: {port}')
    logger.info('=' * 60)
    
    # Pre-load model on startup
    try:
        load_model()
    except Exception as e:
        logger.error(f"Failed to pre-load model: {e}")
        sys.exit(1)
    
    # Run Flask app
    app.run(host='0.0.0.0', port=port, debug=False, threaded=True)
