# Dockerfile for whisper-cli
FROM ubuntu:22.04

# Install dependencies
RUN apt-get update && \
    apt-get install -y git build-essential wget python3 python3-pip

# Install whisper-cli (adjust if you use a different binary)
RUN pip3 install whisper-cli

# Create directories for models and subtitles
RUN mkdir -p /models /subtitles

WORKDIR /subtitles

# Default command
CMD ["whisper-cli", "--help"]
