FROM python:3.9-slim

WORKDIR /app

COPY whisper_service.py .

RUN pip install faster-whisper flask flask-cors numpy gunicorn && mkdir -p uploads

EXPOSE 8771

CMD ["gunicorn", "--bind", "0.0.0.0:8771", "whisper_service:app"]