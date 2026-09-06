"""Authentication routes.

The flow is account-creation-gated:

* ``POST /auth/google/signup`` — the only way to create an account. Exchanges
  a verified Google ID token plus a DeskMind password (chosen at signup) for
  a DeskMind JWT.
* ``POST /auth/google`` — signs in an EXISTING account with Google. It never
  creates accounts: an unknown Google identity is rejected with
  "Account not created. Please sign up first."
* ``POST /auth/login`` — signs in an existing account with its email (the
  Google address) and the DeskMind password chosen at signup.
"""

from __future__ import annotations

import base64
import json
import logging
import time
from datetime import timedelta
from pathlib import Path
from typing import Any

import requests as http_requests
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from tenacity import (
    retry,
    retry_if_exception_type,
    stop_after_attempt,
    wait_exponential,
)

from google.auth import jwt as google_auth_jwt
from google.auth.exceptions import GoogleAuthError, TransportError

from app.config import GOOGLE_CLIENT_ID
from app.deps import (
    DbSession,
    LoginResponse,
    SignupResponse,
    UserResponse,
    get_current_user,
)
from app.models import User
from app.utils.security import (
    ACCESS_TOKEN_EXPIRE_MINUTES,
    create_access_token,
    hash_password,
    verify_password,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/auth", tags=["auth"])

# Shown whenever someone tries to sign in (via Google or email/password)
# without having created an account first.
ACCOUNT_NOT_CREATED = "Account not created. Please sign up first."
ACCOUNT_EXISTS = "Account already exists. Please log in instead."


class GoogleAuthRequest(BaseModel):
    credential: str  # ID token from Google Sign-In


class GoogleSignupRequest(BaseModel):
    credential: str  # ID token from Google Sign-In
    password: str = Field(min_length=8, max_length=128)


class PasswordLoginRequest(BaseModel):
    email: EmailStr
    password: str


class GuestSignupRequest(BaseModel):
    name: str = Field(min_length=1, max_length=128)
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)


class GuestLoginRequest(BaseModel):
    email: EmailStr
    password: str


# ---------------------------------------------------------------------------
# Google ID-token verification
#
# Verifying an ID token means checking its RSA signature against Google's
# public signing certificates. google-auth downloads those certificates from
# www.googleapis.com on EVERY verification, so any hiccup reaching Google
# (flaky Wi-Fi, firewalled networks, captive portals) turns every "Continue
# with Google" click into a failed login — while password login keeps working.
#
# The certificates are public keys that rotate rarely, so they are cached in
# memory (one hour) and on disk (indefinitely) and refreshed over the network
# only when needed. Nothing about the security posture changes: the signature,
# audience, issuer and expiry of every token are still fully verified locally.
# ---------------------------------------------------------------------------

GOOGLE_CERTS_URL = "https://www.googleapis.com/oauth2/v1/certs"
_GOOGLE_ISSUERS = ("accounts.google.com", "https://accounts.google.com")

# Google ID tokens are valid for one hour. Tolerating +/- two minutes of
# clock skew keeps sign-in working on machines whose clock drifts slightly
# without meaningfully widening the acceptance window.
CLOCK_SKEW_IN_SECONDS = 120

# In-memory cache lifetime and the minimum interval between network refresh
# attempts (so a Google outage does not turn into a per-request retry storm).
_CERTS_MEMORY_TTL_SECONDS = 3600.0
_NETWORK_RETRY_BACKOFF_SECONDS = 30.0

# Persisted next to the backend package so the cache survives restarts.
_CERTS_DISK_PATH = Path(__file__).resolve().parents[2] / ".google_certs_cache.json"

_cert_cache: dict[str, Any] = {"certs": None, "fetched_at": 0.0}
_last_network_attempt = 0.0


@retry(
    retry=retry_if_exception_type(http_requests.RequestException),
    stop=stop_after_attempt(3),
    wait=wait_exponential(multiplier=0.5, min=0.5, max=4),
    reraise=True,
)
def _fetch_google_certs_over_network() -> dict[str, str]:
    """Download Google's current signing certificates (kid -> PEM)."""
    response = http_requests.get(GOOGLE_CERTS_URL, timeout=10)
    response.raise_for_status()
    try:
        certs = response.json()
    except ValueError as exc:
        raise TransportError(
            f"Unexpected payload from Google certs endpoint: {exc}"
        ) from exc
    if not isinstance(certs, dict) or not certs:
        raise TransportError("Unexpected payload from Google certs endpoint")
    return certs


def _load_certs_from_disk() -> dict[str, str] | None:
    try:
        data = json.loads(_CERTS_DISK_PATH.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return None
    return data if isinstance(data, dict) and data else None


def _save_certs_to_disk(certs: dict[str, str]) -> None:
    try:
        _CERTS_DISK_PATH.write_text(json.dumps(certs), encoding="utf-8")
    except OSError:
        logger.warning(
            "Could not persist Google certs cache to %s", _CERTS_DISK_PATH, exc_info=True
        )


def _unverified_kid(token: str) -> str | None:
    """Best-effort extraction of the token's unverified ``kid`` header claim.

    Only used to decide whether our cached certificates cover the key the
    token was signed with; the header itself is never trusted for anything
    else (signature and claims are verified afterwards).
    """
    try:
        segment = token.split(".", 1)[0]
        segment += "=" * (-len(segment) % 4)
        header = json.loads(base64.urlsafe_b64decode(segment.encode("utf-8")))
    except Exception:
        return None
    if isinstance(header, dict) and isinstance(header.get("kid"), str):
        return header["kid"]
    return None


def _get_google_certs(token_kid: str | None) -> dict[str, str]:
    """Return Google's signing certs, preferring caches over the network.

    Raises TransportError only when no usable certificate set exists — i.e.
    Google is unreachable AND neither the memory nor the disk cache covers
    the token's key.
    """
    global _last_network_attempt

    now = time.monotonic()
    cached: dict[str, str] | None = _cert_cache["certs"]
    cache_fresh = (
        cached is not None
        and now - _cert_cache["fetched_at"] < _CERTS_MEMORY_TTL_SECONDS
    )
    kid_known = cached is not None and (token_kid is None or token_kid in cached)

    if cached is not None and cache_fresh and kid_known:
        return cached

    # The cache is stale, or the token references a key we have not seen yet:
    # try to refresh from the network (rate-limited).
    if now - _last_network_attempt >= _NETWORK_RETRY_BACKOFF_SECONDS:
        _last_network_attempt = now
        try:
            certs = _fetch_google_certs_over_network()
        except (http_requests.RequestException, TransportError) as exc:
            logger.warning("Could not refresh Google signing certs: %s", exc)
        else:
            _cert_cache["certs"] = certs
            _cert_cache["fetched_at"] = time.monotonic()
            _save_certs_to_disk(certs)
            return certs

    # Network unavailable: fall back to cached certs that cover the token's key.
    if kid_known:
        logger.warning(
            "Google unreachable; verifying with cached signing certs "
            "(%d key(s), cached %.0fs ago)",
            len(cached),
            now - _cert_cache["fetched_at"],
        )
        return cached

    disk = _load_certs_from_disk()
    if disk is not None and (token_kid is None or token_kid in disk):
        logger.warning(
            "Google unreachable; verifying with disk-cached signing certs (%d key(s))",
            len(disk),
        )
        _cert_cache["certs"] = disk
        _cert_cache["fetched_at"] = time.monotonic()
        return disk

    raise TransportError(
        "Google signing certificates are unavailable and no cached "
        "certificate matches the token"
    )


def _verify_google_id_token(credential: str) -> dict[str, Any]:
    """Verify a Google ID token and return its decoded claims.

    Performs the same checks as ``google.oauth2.id_token.verify_oauth2_token``
    (signature against Google's certs, audience, issuer, ``iat``/``exp``) but
    is resilient in the field:

    * signing certs are cached in memory and on disk, so verification usually
      needs no network at all and keeps working when Google is unreachable;
    * ``iat``/``exp`` validation tolerates +/- ``CLOCK_SKEW_IN_SECONDS``.
    """
    token_kid = _unverified_kid(credential)
    certs = _get_google_certs(token_kid)

    idinfo = google_auth_jwt.decode(
        credential,
        certs=certs,
        audience=GOOGLE_CLIENT_ID,
        clock_skew_in_seconds=CLOCK_SKEW_IN_SECONDS,
    )

    if idinfo.get("iss") not in _GOOGLE_ISSUERS:
        raise GoogleAuthError(
            "Wrong issuer. 'iss' should be one of the following: {}".format(
                _GOOGLE_ISSUERS
            )
        )

    return idinfo


def _verify_credential(credential: str) -> tuple[str, str, str | None, str | None]:
    """Verify a Google ID token and return (google_sub, email, name, picture).

    Raises an HTTPException for every failure mode: server not configured,
    Google unreachable, forged/expired token, or unverified email.
    """
    if not GOOGLE_CLIENT_ID:
        logger.error("GOOGLE_CLIENT_ID is not configured; Google auth unavailable")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Google sign-in is not configured on the server",
        )

    token_kid = _unverified_kid(credential)
    logger.debug("Verifying Google token (kid=%s)", token_kid)

    try:
        idinfo = _verify_google_id_token(credential)
    except TransportError as exc:
        # google.auth.exceptions.TransportError is NOT a ValueError, so it must
        # be handled explicitly (it used to bubble up as a raw 500).
        logger.error("Could not reach Google to verify the sign-in token: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Could not verify your Google sign-in. Please try again in a moment.",
        )
    except (ValueError, GoogleAuthError) as exc:
        # Covers malformed/expired tokens, wrong audience (ValueError family)
        # and wrong issuer (plain GoogleAuthError).
        #
        # The most common cause is a GOOGLE_CLIENT_ID mismatch: the token
        # was issued for a different Google OAuth client than the one
        # configured on the backend. Log the underlying exception and
        # token details to aid diagnosis — the user-facing detail stays
        # generic so attackers can't probe valid client IDs.
        logger.warning(
            "Google token verification failed: %s (token_kid=%s, configured_client_id=%s)",
            exc,
            token_kid,
            GOOGLE_CLIENT_ID,
            exc_info=True,
        )
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid Google token",
        )

    google_sub = idinfo.get("sub")
    email = (idinfo.get("email") or "").strip().lower()
    if not google_sub or not email:
        logger.warning("Google token is missing sub/email claims")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid Google token",
        )

    if not idinfo.get("email_verified", False):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Google email not verified",
        )

    return google_sub, email, idinfo.get("name"), idinfo.get("picture")


def _issue_login_response(user: User) -> LoginResponse:
    """Build a bearer-token LoginResponse for the given user."""
    access_token = create_access_token(
        data={"sub": str(user.id)},
        expires_delta=timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES),
    )
    return LoginResponse(
        access_token=access_token,
        token_type="bearer",
        user=UserResponse(id=str(user.id), email=user.email, google_id=user.google_id),
    )


@router.post(
    "/google/signup",
    response_model=LoginResponse,
    status_code=status.HTTP_201_CREATED,
)
def google_signup(db: DbSession, payload: GoogleSignupRequest):
    """Create a DeskMind account from a verified Google identity.

    This is the only endpoint that creates accounts. The DeskMind password
    chosen here is what the user can later use to sign in with their email
    address. The new account is signed in immediately (JWT returned).
    """
    google_sub, email, name, picture_url = _verify_credential(payload.credential)

    existing = db.scalar(select(User).where(User.google_id == google_sub))
    if existing is None:
        existing = db.scalar(select(User).where(User.email == email))
    if existing is not None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=ACCOUNT_EXISTS)

    user = User(
        email=email,
        google_id=google_sub,
        name=name,
        picture_url=picture_url,
        hashed_password=hash_password(payload.password),
    )
    db.add(user)
    try:
        db.commit()
    except IntegrityError:
        # Lost a race with a concurrent signup for the same identity/email.
        db.rollback()
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=ACCOUNT_EXISTS)
    db.refresh(user)

    return _issue_login_response(user)


@router.post("/google", response_model=LoginResponse)
def google_auth(db: DbSession, payload: GoogleAuthRequest):
    """Sign in an EXISTING account with Google. Accounts are never created here."""
    google_sub, email, name, picture_url = _verify_credential(payload.credential)

    user = db.scalar(select(User).where(User.google_id == google_sub))
    if user is None:
        # Fall back to the (verified) email claim. This can link a
        # pre-existing account that has no google_id yet, but it never
        # invents a new account.
        user = db.scalar(select(User).where(User.email == email))
        if user is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=ACCOUNT_NOT_CREATED,
            )
        if user.google_id and user.google_id != google_sub:
            # The email belongs to a different Google identity; never
            # silently re-point the account at a new google_id.
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=(
                    "This email is registered with a different Google account. "
                    "Sign in with your usual Google account, or with your email "
                    "and DeskMind password."
                ),
            )
        # First sign-in with this Google identity: remember it and refresh
        # the profile fields Google provides.
        user.google_id = google_sub
        if name:
            user.name = name
        if picture_url:
            user.picture_url = picture_url
        try:
            db.commit()
        except IntegrityError:
            db.rollback()
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to link Google account",
            )
        db.refresh(user)

    return _issue_login_response(user)


@router.post("/login", response_model=LoginResponse)
def password_login(db: DbSession, payload: PasswordLoginRequest):
    """Sign in with the Google email address and the DeskMind password."""
    user = db.scalar(
        select(User).where(User.email == payload.email.strip().lower())
    )
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=ACCOUNT_NOT_CREATED,
        )

    if not user.hashed_password:
        # Legacy account created before passwords existed.
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This account has no password set. Please continue with Google.",
        )

    if not verify_password(payload.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password.",
        )

    return _issue_login_response(user)


@router.get("/me", response_model=SignupResponse)
def get_me(current_user: User = Depends(get_current_user)):
    return SignupResponse(id=str(current_user.id), email=current_user.email)


@router.post(
    "/guest/signup",
    response_model=LoginResponse,
    status_code=status.HTTP_201_CREATED,
)
def guest_signup(db: DbSession, payload: GuestSignupRequest):
    """Create a guest DeskMind account with name, email, and password.

    Guest accounts do not have a Google identity and are limited to
    ``MAX_GUEST_BOTS`` bots.
    """
    email = payload.email.strip().lower()

    existing = db.scalar(select(User).where(User.email == email))
    if existing is not None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=ACCOUNT_EXISTS)

    user = User(
        email=email,
        name=payload.name.strip(),
        hashed_password=hash_password(payload.password),
    )
    db.add(user)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=ACCOUNT_EXISTS)
    db.refresh(user)

    return _issue_login_response(user)


@router.post("/guest/login", response_model=LoginResponse)
def guest_login(db: DbSession, payload: GuestLoginRequest):
    """Sign in an existing guest account with email and password."""
    user = db.scalar(
        select(User).where(User.email == payload.email.strip().lower())
    )
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=ACCOUNT_NOT_CREATED,
        )

    if user.google_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This account was created with Google. Please continue with Google.",
        )

    if not user.hashed_password:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This account has no password set.",
        )

    if not verify_password(payload.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password.",
        )

    return _issue_login_response(user)