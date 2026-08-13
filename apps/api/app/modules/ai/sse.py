import json
from typing import Any


def event(event_type: str, **payload: Any) -> str:
    return f"data: {json.dumps({'type': event_type, **payload}, default=str)}\n\n"
