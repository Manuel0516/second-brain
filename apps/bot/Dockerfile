FROM python:3.13-slim

WORKDIR /app

# Zero-dependency bridge: stdlib urllib only — no pip install needed.
COPY apps/bot/bot.py /app/bot.py

ENV PYTHONUNBUFFERED=1
CMD ["python", "/app/bot.py"]
