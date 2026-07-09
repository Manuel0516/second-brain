"""In-process WebSocket fan-out for note collaboration."""

from collections import defaultdict

from fastapi import WebSocket


class NoteConnectionManager:
    # ponytail: one API process is the current deployment; use Redis only when
    # WebSockets are served by more than one worker.
    def __init__(self) -> None:
        self.connections: dict[str, dict[WebSocket, str]] = defaultdict(dict)

    async def join(self, page_id: str, websocket: WebSocket, user_id: str) -> None:
        await websocket.accept()
        self.connections[page_id][websocket] = user_id
        await self.presence(page_id)

    async def leave(self, page_id: str, websocket: WebSocket) -> None:
        self.connections[page_id].pop(websocket, None)
        if not self.connections[page_id]:
            self.connections.pop(page_id, None)
        else:
            await self.presence(page_id)

    async def send_others(
        self, page_id: str, websocket: WebSocket | None, message: dict[str, object]
    ) -> None:
        for connection in tuple(self.connections.get(page_id, ())):
            if connection is not websocket:
                await connection.send_json(message)

    async def presence(self, page_id: str) -> None:
        message = {"type": "presence", "count": len(self.connections.get(page_id, ()))}
        for connection in tuple(self.connections.get(page_id, ())):
            await connection.send_json(message)

    async def close_page_user(self, page_id: str, user_id: str) -> None:
        for websocket, connected_user_id in tuple(self.connections.get(page_id, {}).items()):
            if connected_user_id == user_id:
                await websocket.close(code=1008)


note_connections = NoteConnectionManager()


class CalendarConnectionManager:
    """Fan out calendar refresh signals to every connected account."""

    def __init__(self) -> None:
        self.connections: dict[str, set[WebSocket]] = defaultdict(set)

    async def join(self, user_id: str, websocket: WebSocket) -> None:
        await websocket.accept()
        self.connections[user_id].add(websocket)

    async def leave(self, user_id: str, websocket: WebSocket) -> None:
        self.connections[user_id].discard(websocket)
        if not self.connections[user_id]:
            self.connections.pop(user_id, None)

    async def notify(self, user_ids: list[str]) -> None:
        for user_id in set(user_ids):
            for websocket in tuple(self.connections.get(user_id, ())):
                await websocket.send_json({"type": "calendar"})


calendar_connections = CalendarConnectionManager()
