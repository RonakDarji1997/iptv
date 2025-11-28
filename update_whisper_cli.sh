#!/bin/bash

# whisper-cli script for NAS - calls Python transcription API

# Parse arguments like C++ whisper-cli
MODEL=""
AUDIO_FILE=""
LANGUAGE="en"
OUTPUT_TXT=""
OUTPUT_VTT=""
OUTPUT_SRT=""
NO_TIMESTAMPS=false
NO_PRINTS=false

while [[ $# -gt 0 ]]; do
  case $1 in
    -m|--model)
      MODEL="$2"
      shift 2
      ;;
    -f|--file)
      AUDIO_FILE="$2"
      shift 2
      ;;
    -l|--language)
      LANGUAGE="$2"
      shift 2
      ;;
    -otxt|--output-txt)
      OUTPUT_TXT="$2"
      shift 2
      ;;
    -ovtt|--output-vtt)
      OUTPUT_VTT="$2"
      shift 2
      ;;
    -osrt|--output-srt)
      OUTPUT_SRT="$2"
      shift 2
      ;;
    -nt|--no-timestamps)
      NO_TIMESTAMPS=true
      shift
      ;;
    -np|--no-prints)
      NO_PRINTS=true
      shift
      ;;
    *)
      # Assume it is the audio file if not a flag
      if [[ -z "$AUDIO_FILE" ]]; then
        AUDIO_FILE="$1"
      fi
      shift
      ;;
  esac
done

# Check if audio file is provided
if [[ -z "$AUDIO_FILE" ]]; then
  echo "Error: No audio file provided"
  exit 1
fi

# Call the Python transcription API with file upload
RESPONSE=$(curl -s -X POST http://localhost:8771/transcribe \
  -F "audio=@$AUDIO_FILE" \
  -F "language=$LANGUAGE")

# Check if curl succeeded
if [[ $? -ne 0 ]]; then
  echo "Error: Failed to call transcription API"
  exit 1
fi

# Parse the response
TEXT=$(echo "$RESPONSE" | jq -r '.text // empty')

if [[ -z "$TEXT" ]]; then
  echo "Error: No transcription text received"
  exit 1
fi

# Output the text (mimicking whisper-cli behavior)
echo "$TEXT"

exit 0