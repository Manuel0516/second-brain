"""Agent-visible tools defined as declarative specs (method + path + args), executed by a
generic runner — never arbitrary code. Every spec is validated at create time against the
app's own registered routes, so a spec can only ever call an endpoint that already exists.
"""

import re
from typing import Any, cast
from urllib.parse import urlencode

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import AITool
from app.modules.ai import tools

JSON = dict[str, Any]

_PATH_PARAM = re.compile(r"\{([^}/]+)\}")
_VALID_METHODS = {"GET", "POST", "PUT", "PATCH", "DELETE"}
_TYPE_MAP = {"string": tools.S, "number": tools.N, "object": tools.OBJECT}

# Seed specs: source="system", re-declaring useful endpoints the hardcoded v1 registry
# doesn't cover. All paths verified against real routes in routes/fitness.py and
# routes/food.py — do not add food_summary here, it duplicates the hardcoded
# get_food_summary tool.
SEED_SPECS: list[JSON] = [
    {
        "name": "workout_session_detail",
        "description": "Full workout session detail including comments and feeling.",
        "kind": "read",
        "spec": {
            "method": "GET",
            "path": "/api/fitness/sessions/{session_id}",
            "args": {"session_id": "string"},
        },
    },
    {
        "name": "workout_session_sets",
        "description": "All logged sets for one workout session.",
        "kind": "read",
        "spec": {
            "method": "GET",
            "path": "/api/fitness/sessions/{session_id}/sets",
            "args": {"session_id": "string"},
        },
    },
    {
        "name": "recent_workouts",
        "description": "List recent workout sessions.",
        "kind": "read",
        "spec": {"method": "GET", "path": "/api/fitness/sessions", "args": {}},
    },
    {
        "name": "exercise_stats",
        "description": "Stats (PRs, volume trend) for one exercise.",
        "kind": "read",
        "spec": {
            "method": "GET",
            "path": "/api/fitness/stats/exercise/{exercise_id}",
            "args": {"exercise_id": "string"},
        },
    },
    {
        "name": "body_weight_stats",
        "description": "Body weight trend statistics.",
        "kind": "read",
        "spec": {"method": "GET", "path": "/api/fitness/stats/body-weight", "args": {}},
    },
    {
        "name": "body_metrics",
        "description": "Logged body metric entries (weight, measurements).",
        "kind": "read",
        "spec": {"method": "GET", "path": "/api/fitness/body-metrics", "args": {}},
    },
    {
        "name": "meal_logs",
        "description": "Meal logs in a date range (includes photos). Omit dates for full history.",
        "kind": "read",
        "spec": {
            "method": "GET",
            "path": "/api/food/logs",
            "args": {"from_date": "string", "to_date": "string"},
        },
    },
    {
        "name": "get_fitness_goals",
        "description": "List the user's fitness goals.",
        "kind": "read",
        "spec": {"method": "GET", "path": "/api/fitness/goals", "args": {}},
    },
    {
        "name": "set_meal_log_status",
        "description": "Update a meal log's status ('logged' or 'planned').",
        "kind": "write",
        "spec": {
            "method": "PATCH",
            "path": "/api/food/logs/{log_id}",
            "args": {"log_id": "string", "status": "string"},
            # Undo is a fixed revert (best-effort — no prior-state capture for spec tools).
            "undo": {
                "method": "PATCH",
                "path": "/api/food/logs/{id}",
                "body": {"status": "planned"},
            },
        },
    },
]


def _normalize(path: str) -> str:
    """Collapse any `{param}` segment so shape can be compared without caring about names."""
    return _PATH_PARAM.sub("{}", path)


def validate_spec(spec: JSON) -> str | None:
    """Returns an error message, or None if the spec is valid and safe to store."""
    method = spec.get("method")
    path = spec.get("path")
    if method not in _VALID_METHODS:
        return f"method must be one of {sorted(_VALID_METHODS)}"
    if not isinstance(path, str) or not path.startswith("/api/"):
        return "path must start with /api/"
    if not isinstance(spec.get("args", {}), dict):
        return "args must be an object"

    from app.main import app  # lazy: main.py imports routes -> tools -> (not this module)

    target = _normalize(path)
    for route in app.routes:
        route_methods = getattr(route, "methods", None) or set()
        route_path = getattr(route, "path", None)
        if route_path and method in route_methods and _normalize(route_path) == target:
            return None
    return f"no registered route matches {method} {path}"


def to_tool(row: AITool) -> tools.Tool:
    if row.source == "openapi":
        from app.modules.ai import capabilities

        generated = capabilities.tool_schema(str(cast(JSON, row.spec)["capability_id"]))
        return tools.Tool(
            generated["name"],
            generated["description"],
            generated["parameters"]["properties"],
            tuple(generated["parameters"]["required"]),
            generated["risk"] != "read",
        )
    spec = cast(JSON, row.spec)
    args: dict[str, str] = spec.get("args", {})
    properties = {name: _TYPE_MAP.get(kind, tools.S) for name, kind in args.items()}
    required = tuple(_PATH_PARAM.findall(spec["path"]))
    description = row.description
    if row.source == "agent":
        description = f"{description} (agent-created)"
    return tools.Tool(row.name, description, properties, required, row.kind == "write")


def _bind_path(path: str, args: JSON) -> tuple[str, JSON]:
    names = set(_PATH_PARAM.findall(path))
    missing = names - args.keys()
    if missing:
        raise KeyError(f"missing argument(s): {', '.join(sorted(missing))}")
    bound = path.format(**{name: args[name] for name in names})
    remaining = {key: value for key, value in args.items() if key not in names}
    return bound, remaining


async def execute(row: AITool, args: JSON, user_id: str) -> tuple[bool, Any, str]:
    if row.source == "openapi":
        from app.modules.ai import capabilities

        return await capabilities.execute(str(cast(JSON, row.spec)["capability_id"]), args, user_id)
    spec = cast(JSON, row.spec)
    method = spec["method"]
    try:
        path, remaining = _bind_path(spec["path"], args)
    except KeyError as error:
        return False, None, str(error)
    body = None
    if method in ("GET", "DELETE"):
        if remaining:
            path += ("&" if "?" in path else "?") + urlencode(remaining)
    else:
        body = remaining
    response = await tools._api(method, path, body, user_id)
    if response.status_code >= 400:
        return False, None, f"API returned {response.status_code}: {response.text[:300]}"
    data = None if response.status_code == 204 else response.json()
    return True, data, tools._summarize(data)


async def undo(row: AITool, payload: JSON, user_id: str) -> tuple[bool, Any, str]:
    spec = cast(JSON, row.spec)
    undo_spec = spec.get("undo")
    result = payload.get("result")
    if not isinstance(undo_spec, dict) or not isinstance(result, dict) or "id" not in result:
        return False, None, "Undo is not supported for this tool"
    path = undo_spec["path"].format(id=result["id"])
    response = await tools._api(undo_spec["method"], path, undo_spec.get("body"), user_id)
    if response.status_code >= 400:
        return False, None, f"API returned {response.status_code}: {response.text[:300]}"
    data = None if response.status_code == 204 else response.json()
    return True, data, tools._summarize(data)


async def ensure_seeded(session: AsyncSession, user_id: str) -> None:
    existing = (
        await session.execute(select(AITool.id).where(AITool.user_id == user_id).limit(1))
    ).first()
    if existing:
        return
    for item in SEED_SPECS:
        session.add(
            AITool(
                user_id=user_id,
                name=item["name"],
                description=item["description"],
                kind=item["kind"],
                spec=item["spec"],
                enabled=True,
                source="system",
            )
        )
    await session.commit()
