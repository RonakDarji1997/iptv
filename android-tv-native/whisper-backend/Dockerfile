# Dockerfile for whisper-cli
FROM python:3.10-slim

RUN apt-get update && apt-get install -y git build-essential wget && rm -rf /var/lib/apt/lists/*
RUN pip install whisper-cli
RUN mkdir -p /models /subtitles

WORKDIR /subtitles

# Entrypoint and default command
ENTRYPOINT ["whisper-cli"]
CMD ["--help"]
