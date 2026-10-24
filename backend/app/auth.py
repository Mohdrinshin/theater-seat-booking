"""Small stdlib-only password and signed token helpers for owner APIs."""
import base64
import hashlib
import hmac
import json
import os
import time

from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from .db import get_db
from .models import User

bearer = HTTPBearer(auto_error=False)
SECRET = os.getenv("JWT_SECRET", "development-only-change-me").encode()


def hash_password(password: str) -> str:
    salt = os.urandom(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode(), salt, 180_000)
    return f"{salt.hex()}:{digest.hex()}"


def verify_password(password: str, encoded: str) -> bool:
    try:
        salt, expected = encoded.split(":", 1)
        digest = hashlib.pbkdf2_hmac("sha256", password.encode(), bytes.fromhex(salt), 180_000)
        return hmac.compare_digest(digest.hex(), expected)
    except (ValueError, TypeError):
        return False


def _b64(value: bytes) -> str:
    return base64.urlsafe_b64encode(value).rstrip(b"=").decode()


def issue_token(user: User) -> str:
    header = _b64(b'{"alg":"HS256","typ":"JWT"}')
    payload = _b64(json.dumps({"sub": user.id, "role": user.role, "exp": int(time.time()) + 86400}).encode())
    body = f"{header}.{payload}"
    signature = _b64(hmac.new(SECRET, body.encode(), hashlib.sha256).digest())
    return f"{body}.{signature}"


def current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer),
    db: Session = Depends(get_db),
) -> User:
    unauthorized = HTTPException(401, "Valid bearer token required", headers={"WWW-Authenticate": "Bearer"})
    if not credentials:
        raise unauthorized
    try:
        header, payload, signature = credentials.credentials.split(".")
        body = f"{header}.{payload}"
        expected = _b64(hmac.new(SECRET, body.encode(), hashlib.sha256).digest())
        if not hmac.compare_digest(signature, expected):
            raise ValueError("signature")
        claims = json.loads(base64.urlsafe_b64decode(payload + "=" * (-len(payload) % 4)))
        if claims["exp"] < time.time():
            raise ValueError("expired")
        user = db.get(User, int(claims["sub"]))
        if not user:
            raise ValueError("missing user")
        return user
    except (ValueError, KeyError, TypeError, json.JSONDecodeError):
        raise unauthorized


def owner_user(user: User = Depends(current_user)) -> User:
    if user.role != "owner":
        raise HTTPException(403, "Owner access required")
    return user
