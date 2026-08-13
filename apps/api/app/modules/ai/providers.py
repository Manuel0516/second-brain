import asyncio
import json
from collections.abc import AsyncIterator
from typing import Any, Protocol

import httpx


class ProviderProtocol(Protocol):
    async def complete(
        self, messages: list[dict[str, Any]], tools: list[dict[str, Any]]
    ) -> dict[str, Any]: ...
    def stream(
        self, messages: list[dict[str, Any]], tools: list[dict[str, Any]]
    ) -> AsyncIterator[str]: ...


class OpenRouterProvider:
    def __init__(self, api_key: str, model: str) -> None:
        self.api_key, self.model = api_key, model

    async def _post(self, payload: dict[str, Any], stream: bool = False) -> httpx.Response:
        for attempt in range(2):
            async with httpx.AsyncClient(timeout=90) as client:
                response = await client.post(
                    "https://openrouter.ai/api/v1/chat/completions",
                    headers={"Authorization": f"Bearer {self.api_key}"},
                    json={"model": self.model, **payload, "stream": stream},
                )
            if response.status_code != 429 and response.status_code < 500:
                response.raise_for_status()
                return response
            if attempt == 0:
                await asyncio.sleep(0.5)
        response.raise_for_status()
        return response

    async def complete(
        self, messages: list[dict[str, Any]], tools: list[dict[str, Any]]
    ) -> dict[str, Any]:
        response = await self._post({"messages": messages, "tools": tools})
        return dict(response.json()["choices"][0]["message"])

    async def stream(
        self, messages: list[dict[str, Any]], tools: list[dict[str, Any]]
    ) -> AsyncIterator[str]:
        payload = {"model": self.model, "messages": messages, "tools": tools, "stream": True}
        for attempt in range(2):
            async with httpx.AsyncClient(timeout=90) as client:
                async with client.stream(
                    "POST",
                    "https://openrouter.ai/api/v1/chat/completions",
                    headers={"Authorization": f"Bearer {self.api_key}"},
                    json=payload,
                ) as response:
                    if response.status_code == 429 or response.status_code >= 500:
                        if attempt == 0:
                            await response.aread()
                            await asyncio.sleep(0.5)
                            continue
                    response.raise_for_status()
                    async for line in response.aiter_lines():
                        if not line.startswith("data: ") or line == "data: [DONE]":
                            continue
                        content = json.loads(line.removeprefix("data: "))["choices"][0][
                            "delta"
                        ].get("content")
                        if content:
                            yield str(content)
                    return
