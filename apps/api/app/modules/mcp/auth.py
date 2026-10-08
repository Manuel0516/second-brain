"""OAuth resource server: only issuer-signed, audience-bound tokens are accepted."""

import asyncio
from uuid import UUID

import jwt

from app.config import Settings
from mcp.server.auth.provider import AccessToken

SCOPES = ["brain:read", "brain:write", "fitness:read", "fitness:write"]


class OAuthVerifier:
    def __init__(self, settings: Settings) -> None:
        self.settings = settings
        self.keys = jwt.PyJWKClient(settings.mcp_jwks_url, timeout=5, lifespan=300)

    async def verify_token(self, token: str) -> AccessToken | None:
        try:
            if len(token) > 16_384:
                return None
            key = await asyncio.to_thread(self.keys.get_signing_key_from_jwt, token)
            claims = jwt.decode(
                token,
                key.key,
                algorithms=["RS256", "ES256"],
                issuer=self.settings.mcp_issuer_url,
                audience=self.settings.mcp_resource_url,
                options={"require": ["exp", "iat", "sub", "iss", "aud"]},
            )
            subject = claims["sub"]
            user_id = str(UUID(self.settings.mcp_subject_users[subject]))
            scope = claims.get("scope", "")
            if not isinstance(scope, str):
                return None
            scopes = [item for item in scope.split() if item in SCOPES]
            return AccessToken(
                token=token,
                client_id=str(claims.get("client_id") or claims.get("azp") or subject),
                subject=user_id,
                scopes=scopes,
                expires_at=int(claims["exp"]),
                resource=self.settings.mcp_resource_url,
            )
        except (jwt.PyJWTError, KeyError, TypeError, ValueError):
            return None
