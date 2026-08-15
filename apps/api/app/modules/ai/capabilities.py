"""Discover and execute app routes from FastAPI's live OpenAPI document."""

import hashlib
import json
import re
from typing import Any
from urllib.parse import urlencode

from app.modules.ai import tools

JSON = dict[str, Any]
_METHODS = {"get", "post", "put", "patch", "delete"}
_PATH_PARAM = re.compile(r"\{([^}/]+)\}")
_SENSITIVE = re.compile(r"password|secret|token|authorization|cookie|totp", re.I)
_HIGH_RISK = (
    "/api/auth",
    "/api/admin",
    "/api/integrations",
)
_FORBIDDEN = (
    "/api/ai/conversations/",
    "/api/ai/actions/",
)


def _document() -> JSON:
    from app.main import app

    return app.openapi()


def _resolve(schema: Any, document: JSON) -> Any:
    if isinstance(schema, list):
        return [_resolve(item, document) for item in schema]
    if not isinstance(schema, dict):
        return schema
    if ref := schema.get("$ref"):
        value: Any = document
        for part in str(ref).removeprefix("#/").split("/"):
            value = value[part]
        return _resolve(value, document)
    return {key: _resolve(value, document) for key, value in schema.items() if key != "title"}


def capability_id(method: str, path: str) -> str:
    return hashlib.sha256(f"{method.upper()} {path}".encode()).hexdigest()[:16]


def _risk(method: str, path: str, operation: JSON) -> str:
    if path.startswith(_FORBIDDEN):
        return "forbidden"
    content = operation.get("requestBody", {}).get("content", {})
    if content and "application/json" not in content:
        return "unsupported"
    if method == "get":
        return "read"
    if path.startswith(_HIGH_RISK) or "permanent" in path:
        return "high_risk"
    return "write"


def catalog() -> list[JSON]:
    document = _document()
    result: list[JSON] = []
    for path, path_item in document.get("paths", {}).items():
        for method, operation in path_item.items():
            if method not in _METHODS or not isinstance(operation, dict):
                continue
            result.append(
                {
                    "id": capability_id(method, path),
                    "method": method.upper(),
                    "path": path,
                    "name": operation.get("operationId") or f"{method}_{path}",
                    "description": operation.get("summary") or operation.get("description") or "",
                    "tags": operation.get("tags") or [],
                    "risk": _risk(method, path, operation),
                }
            )
    return result


def find(cap_id: str) -> JSON | None:
    return next((item for item in catalog() if item["id"] == cap_id), None)


def search(query: str = "", tag: str = "") -> list[JSON]:
    words = query.casefold().split()
    matches = []
    for item in catalog():
        haystack = " ".join(
            [item["name"], item["path"], item["description"], *item["tags"]]
        ).casefold()
        if words and not all(word in haystack for word in words):
            continue
        if tag and tag.casefold() not in {value.casefold() for value in item["tags"]}:
            continue
        matches.append(item)
    return matches[:12]


def tool_schema(cap_id: str) -> JSON:
    document = _document()
    item = find(cap_id)
    if item is None:
        raise KeyError("Capability no longer exists")
    operation = document["paths"][item["path"]][item["method"].lower()]
    properties: JSON = {}
    required: list[str] = []
    for parameter in operation.get("parameters", []):
        parameter = _resolve(parameter, document)
        name = parameter["name"]
        schema = _resolve(parameter.get("schema", {"type": "string"}), document)
        properties[name] = schema
        if parameter.get("required"):
            required.append(name)
    body = operation.get("requestBody", {}).get("content", {}).get("application/json", {})
    body_schema = _resolve(body.get("schema", {}), document)
    properties.update(body_schema.get("properties", {}))
    required.extend(body_schema.get("required", []))
    safe_properties = {
        key: value for key, value in properties.items() if not _SENSITIVE.search(key)
    }
    return {
        "name": re.sub(r"[^a-zA-Z0-9_-]", "_", item["name"])[:64],
        "description": f"{item['method']} {item['path']}. {item['description']}",
        "parameters": {
            "type": "object",
            "properties": safe_properties,
            "required": [name for name in required if name in safe_properties],
            "additionalProperties": False,
        },
        "risk": item["risk"],
        "secure_fields": [key for key in properties if _SENSITIVE.search(key)],
    }


async def execute(cap_id: str, args: JSON, user_id: str) -> tuple[bool, Any, str]:
    item = find(cap_id)
    if item is None:
        return False, None, "Capability no longer exists"
    if item["risk"] in {"forbidden", "unsupported"}:
        return False, None, f"Capability is {item['risk']}"
    path_names = set(_PATH_PARAM.findall(item["path"]))
    missing = path_names - args.keys()
    if missing:
        return False, None, f"Missing path argument(s): {', '.join(sorted(missing))}"
    path = item["path"].format(**{name: args[name] for name in path_names})
    remaining = {key: value for key, value in args.items() if key not in path_names}
    if item["method"] in {"GET", "DELETE"} and remaining:
        path += "?" + urlencode(remaining, doseq=True)
    response = await tools._api(
        item["method"], path, None if item["method"] in {"GET", "DELETE"} else remaining, user_id
    )
    if response.status_code >= 400:
        return False, None, f"API returned {response.status_code}: {response.text[:300]}"
    data = None if response.status_code == 204 else response.json()
    safe = _redact(data)
    return True, safe, json.dumps(safe, default=str)[:8000]


def _redact(value: Any) -> Any:
    if isinstance(value, list):
        return [_redact(item) for item in value[:25]]
    if isinstance(value, dict):
        return {
            key: "[redacted]" if _SENSITIVE.search(key) else _redact(item)
            for key, item in value.items()
        }
    return value
