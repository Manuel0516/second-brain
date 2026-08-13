"""Real API smoke for the embedded agent on port 8001.

Run: uv run python scripts/ai_smoke.py
The API must be running with AI_INTERNAL_API_URL=http://127.0.0.1:8001.
"""

import asyncio
import json
import os

import httpx

BASE = "http://127.0.0.1:8001"


def events(response: httpx.Response) -> list[dict[str, object]]:
    return [
        json.loads(line[6:]) for line in response.text.splitlines() if line.startswith("data: ")
    ]


async def run_smoke() -> None:
    email = os.environ["INITIAL_USER_EMAIL"]
    password = os.environ["INITIAL_USER_PASSWORD"]
    async with httpx.AsyncClient(base_url=BASE, timeout=180) as client:
        login = await client.post("/api/auth/login", json={"email": email, "password": password})
        login.raise_for_status()

        conversation = (
            await client.post("/api/ai/conversations", json={"title": "Smoke read"})
        ).json()
        read = await client.post(
            f"/api/ai/conversations/{conversation['id']}/messages",
            json={"content": "Use get_today and tell me today's date."},
        )
        read.raise_for_status()
        print("read:", [item["type"] for item in events(read)])

        memory_conversation = (
            await client.post("/api/ai/conversations", json={"title": "Smoke memory"})
        ).json()
        remembered = await client.post(
            f"/api/ai/conversations/{memory_conversation['id']}/messages",
            json={"content": "Remember this durable fact: my smoke-test color is ultramarine."},
        )
        remembered.raise_for_status()
        recalled_conversation = (
            await client.post("/api/ai/conversations", json={"title": "Smoke recall"})
        ).json()
        recalled = await client.post(
            f"/api/ai/conversations/{recalled_conversation['id']}/messages",
            json={"content": "What is my smoke-test color? Use recall."},
        )
        recalled.raise_for_status()
        print("durable-memory:", [item["type"] for item in events(recalled)])

        write_conversation = (
            await client.post("/api/ai/conversations", json={"title": "Smoke write"})
        ).json()
        proposed = await client.post(
            f"/api/ai/conversations/{write_conversation['id']}/messages",
            json={"content": "Create a page titled Embedded Agent Smoke."},
        )
        confirmation = next(item for item in events(proposed) if item["type"] == "confirm_required")
        confirmed = await client.post(
            f"/api/ai/conversations/{write_conversation['id']}/confirm",
            json={"action_id": confirmation["action_id"]},
        )
        confirmed.raise_for_status()
        undone = await client.post(f"/api/ai/actions/{confirmation['action_id']}/undo")
        undone.raise_for_status()
        print("write-confirm-undo:", confirmation["action_id"], undone.json()["status"])


if __name__ == "__main__":
    asyncio.run(run_smoke())
