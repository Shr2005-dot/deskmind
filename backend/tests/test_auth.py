"""Authentication endpoint tests.

The auth flow is account-creation-gated:

* ``POST /auth/google/signup`` — the ONLY way to create an account. Exchanges
  a Google ID token (issued by @react-oauth/google) plus a DeskMind password
  for a DeskMind JWT.
* ``POST /auth/google`` — signs in an EXISTING account with Google. It never
  creates accounts; an unknown Google identity is a 404.
* ``POST /auth/login`` — signs in an existing account with its email (the
  Google address) and DeskMind password.

Every test uses a unique Google identity so tests stay independent of any
leftover rows in the shared test schema (its teardown is skipped when a
previous session crashes). Token verification is mocked so the suite never
talks to Google.
"""

from __future__ import annotations

import uuid

from fastapi import status
from google.auth.exceptions import TransportError
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import User
from app.utils.security import create_access_token, hash_password, verify_password

ACCOUNT_NOT_CREATED = "Account not created. Please sign up first."


def _mock_verify(mocker, sub: str, email: str, **overrides):
    """Patch google token verification to return a predictable claim set."""
    idinfo = {
        "sub": sub,
        "email": email,
        "email_verified": True,
        "name": "Google User",
        "picture": "https://lh3.googleusercontent.com/avatar.jpg",
        "iss": "accounts.google.com",
        **overrides,
    }
    return mocker.patch(
        "app.routes.auth._verify_google_id_token",
        return_value=idinfo,
    )


def _unique_google_identity() -> tuple[str, str]:
    """A Google (sub, email) pair unique to a single test."""
    sub = f"google-sub-{uuid.uuid4().hex[:12]}"
    email = f"google-{uuid.uuid4().hex[:8]}@example.com"
    return sub, email


def _signup(
    client,
    mocker,
    sub: str | None = None,
    email: str | None = None,
    password: str = "s3curepass",
):
    """Create an account through the public signup endpoint (as the UI does)."""
    gen_sub, gen_email = _unique_google_identity()
    sub = gen_sub if sub is None else sub
    email = gen_email if email is None else email
    _mock_verify(mocker, sub, email)
    response = client.post(
        "/auth/google/signup",
        json={"credential": "token", "password": password},
    )
    assert response.status_code == status.HTTP_201_CREATED
    return {"sub": sub, "email": email, "response": response}


class TestGoogleSignup:
    def test_google_signup_creates_account_with_password(self, client, db: Session, mocker):
        identity = _signup(client, mocker)
        data = identity["response"].json()
        assert data["user"]["email"] == identity["email"]

        # The returned token must authenticate the new account immediately.
        me = client.get(
            "/auth/me",
            headers={"Authorization": f"Bearer {data['access_token']}"},
        )
        assert me.status_code == status.HTTP_200_OK
        assert me.json()["email"] == identity["email"]

        user = db.scalar(select(User).where(User.email == identity["email"]))
        assert user is not None
        assert user.google_id == identity["sub"]
        assert user.hashed_password is not None
        assert verify_password("s3curepass", user.hashed_password)

    def test_google_signup_rejects_duplicate_account(self, client, db: Session, mocker):
        identity = _signup(client, mocker)

        # Signing up again with the same Google identity must not create a
        # second account.
        _mock_verify(mocker, identity["sub"], identity["email"])
        second = client.post(
            "/auth/google/signup",
            json={"credential": "token", "password": "anotherpass1"},
        )
        assert second.status_code == status.HTTP_409_CONFLICT
        assert "already exists" in second.json()["detail"]

        users = db.scalars(
            select(User).where(User.email == identity["email"])
        ).all()
        assert len(users) == 1

    def test_google_signup_short_password_rejected(self, client, mocker):
        _mock_verify(mocker, *_unique_google_identity())
        response = client.post(
            "/auth/google/signup",
            json={"credential": "token", "password": "short"},
        )
        assert response.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY

    def test_google_signup_missing_password_rejected(self, client, mocker):
        _mock_verify(mocker, *_unique_google_identity())
        response = client.post("/auth/google/signup", json={"credential": "token"})
        assert response.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY

    def test_google_signup_invalid_token(self, client, mocker):
        mocker.patch(
            "app.routes.auth._verify_google_id_token",
            side_effect=ValueError("Token signature verification failed"),
        )
        response = client.post(
            "/auth/google/signup",
            json={"credential": "forged-token", "password": "s3curepass"},
        )
        assert response.status_code == status.HTTP_401_UNAUTHORIZED
        assert response.json()["detail"] == "Invalid Google token"


class TestGoogleAuth:
    """POST /auth/google must only sign in accounts that already exist."""

    def test_google_auth_missing_credential(self, client):
        response = client.post("/auth/google", json={})
        assert response.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY

    def test_google_auth_invalid_token(self, client, mocker):
        mocker.patch(
            "app.routes.auth._verify_google_id_token",
            side_effect=ValueError("Token signature verification failed"),
        )
        response = client.post("/auth/google", json={"credential": "not-a-real-token"})
        assert response.status_code == status.HTTP_401_UNAUTHORIZED
        assert response.json()["detail"] == "Invalid Google token"

    def test_google_auth_wrong_issuer(self, client, mocker):
        # The verifier raises a plain GoogleAuthError (not ValueError) when
        # the issuer is wrong; the route must still return 401.
        from google.auth.exceptions import GoogleAuthError

        mocker.patch(
            "app.routes.auth._verify_google_id_token",
            side_effect=GoogleAuthError("Wrong issuer"),
        )
        response = client.post("/auth/google", json={"credential": "forged-token"})
        assert response.status_code == status.HTTP_401_UNAUTHORIZED
        assert response.json()["detail"] == "Invalid Google token"

    def test_google_auth_unverified_email(self, client, mocker):
        sub, email = _unique_google_identity()
        _mock_verify(mocker, sub, email, email_verified=False)
        response = client.post("/auth/google", json={"credential": "token"})
        assert response.status_code == status.HTTP_401_UNAUTHORIZED
        assert response.json()["detail"] == "Google email not verified"

    def test_google_auth_transport_error(self, client, mocker):
        # Network failures while fetching Google's certs must surface as 503,
        # not an unhandled 500 (after the route's own retry attempts).
        mocker.patch(
            "app.routes.auth._verify_google_id_token",
            side_effect=TransportError("Could not fetch certificates"),
        )
        response = client.post("/auth/google", json={"credential": "token"})
        assert response.status_code == status.HTTP_503_SERVICE_UNAVAILABLE

    def test_google_login_without_account_rejected(self, client, db: Session, mocker):
        """Signing in with a Google identity that never signed up is a 404."""
        sub, email = _unique_google_identity()
        _mock_verify(mocker, sub, email)
        response = client.post("/auth/google", json={"credential": "token"})
        assert response.status_code == status.HTTP_404_NOT_FOUND
        assert response.json()["detail"] == ACCOUNT_NOT_CREATED
        # Crucially, no account was silently created.
        assert db.scalars(select(User).where(User.google_id == sub)).all() == []
        assert db.scalars(select(User).where(User.email == email)).all() == []

    def test_google_login_after_signup_returns_token(self, client, db: Session, mocker):
        identity = _signup(client, mocker)
        _mock_verify(mocker, identity["sub"], identity["email"])
        login = client.post("/auth/google", json={"credential": "token"})
        assert login.status_code == status.HTTP_200_OK
        assert login.json()["user"]["id"] == identity["response"].json()["user"]["id"]

        users = db.scalars(
            select(User).where(User.email == identity["email"])
        ).all()
        assert len(users) == 1

    def test_google_login_links_existing_email_account(self, client, db: Session, mocker):
        # A pre-existing account with the same email (and no google_id yet) is
        # claimed by the Google identity instead of being rejected.
        sub, email = _unique_google_identity()
        user = User(
            email=email,
            hashed_password=hash_password("password123"),
            name="Existing User",
        )
        db.add(user)
        db.commit()
        db.refresh(user)

        _mock_verify(mocker, sub, email)
        response = client.post("/auth/google", json={"credential": "token"})
        assert response.status_code == status.HTTP_200_OK
        assert response.json()["user"]["id"] == str(user.id)

        db.expire(user)
        assert user.google_id == sub

    def test_google_login_rejects_mismatched_google_id(self, client, db: Session, mocker):
        # The email matches but belongs to a different Google identity; the
        # stored google_id must not be silently overwritten.
        sub, email = _unique_google_identity()
        stored_sub = f"other-sub-{uuid.uuid4().hex[:8]}"
        user = User(
            email=email,
            google_id=stored_sub,
            hashed_password=hash_password("password123"),
        )
        db.add(user)
        db.commit()

        _mock_verify(mocker, sub, email)
        response = client.post("/auth/google", json={"credential": "token"})
        assert response.status_code == status.HTTP_403_FORBIDDEN

        db.expire(user)
        assert user.google_id == stored_sub


class TestPasswordLogin:
    def test_password_login_success(self, client, db: Session, mocker):
        identity = _signup(client, mocker)
        response = client.post(
            "/auth/login",
            json={"email": identity["email"], "password": "s3curepass"},
        )
        assert response.status_code == status.HTTP_200_OK
        me = client.get(
            "/auth/me",
            headers={"Authorization": f"Bearer {response.json()['access_token']}"},
        )
        assert me.status_code == status.HTTP_200_OK
        assert me.json()["email"] == identity["email"]

    def test_password_login_without_account(self, client, db: Session):
        email = f"ghost-{uuid.uuid4().hex[:8]}@example.com"
        response = client.post(
            "/auth/login",
            json={"email": email, "password": "whatever1"},
        )
        assert response.status_code == status.HTTP_404_NOT_FOUND
        assert response.json()["detail"] == ACCOUNT_NOT_CREATED

    def test_password_login_wrong_password(self, client, db: Session, mocker):
        identity = _signup(client, mocker)
        response = client.post(
            "/auth/login",
            json={"email": identity["email"], "password": "wrongpass1"},
        )
        assert response.status_code == status.HTTP_401_UNAUTHORIZED
        assert response.json()["detail"] == "Incorrect email or password."

    def test_password_login_is_case_insensitive_on_email(self, client, db: Session, mocker):
        identity = _signup(client, mocker)
        response = client.post(
            "/auth/login",
            json={"email": identity["email"].upper(), "password": "s3curepass"},
        )
        assert response.status_code == status.HTTP_200_OK

    def test_password_login_google_only_account(self, client, db: Session):
        # Legacy account created before passwords existed: direct the user to
        # Google sign-in with a clean 400, never a 500 from bcrypt on None.
        email = f"legacy-{uuid.uuid4().hex[:8]}@example.com"
        user = User(
            email=email,
            google_id=f"legacy-sub-{uuid.uuid4().hex[:8]}",
            hashed_password=None,
        )
        db.add(user)
        db.commit()

        response = client.post(
            "/auth/login",
            json={"email": email, "password": "whatever1"},
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert "Google" in response.json()["detail"]


class TestMe:
    def test_auth_me_without_token(self, client):
        response = client.get("/auth/me")
        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_auth_me_with_token(self, client, test_user: User):
        token = create_access_token(data={"sub": str(test_user.id)})
        response = client.get(
            "/auth/me",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert data["email"] == test_user.email
        assert data["id"] == str(test_user.id)


class TestProtectedEndpoints:
    def test_protected_endpoint_without_token(self, client):
        response = client.get("/bots")
        assert response.status_code == status.HTTP_401_UNAUTHORIZED