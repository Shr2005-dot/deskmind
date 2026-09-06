"""Document endpoint tests."""

from __future__ import annotations

import io

import pytest
from fastapi import status

from app.models import Document


class TestDocuments:
    def test_upload_valid_pdf(self, client, test_user: User, test_bot: Bot, db):
        from app.utils.security import create_access_token

        token = create_access_token(data={"sub": str(test_user.id)})
        file_content = b"%PDF-1.4 fake pdf content"
        response = client.post(
            f"/bots/{test_bot.id}/documents",
            files={"file": ("test.pdf", io.BytesIO(file_content), "application/pdf")},
            headers={"Authorization": f"Bearer {token}"},
        )
        assert response.status_code == status.HTTP_201_CREATED
        data = response.json()
        assert data["filename"] == "test.pdf"
        assert data["status"] == "processing"
        assert data["source_type"] == "pdf"

    def test_upload_invalid_mime_type(self, client, test_user: User, test_bot: Bot):
        from app.utils.security import create_access_token

        token = create_access_token(data={"sub": str(test_user.id)})
        response = client.post(
            f"/bots/{test_bot.id}/documents",
            files={"file": ("test.exe", io.BytesIO(b"binary data"), "application/x-msdownload")},
            headers={"Authorization": f"Bearer {token}"},
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert "Unsupported file type" in response.json()["detail"]

    def test_upload_invalid_extension(self, client, test_user: User, test_bot: Bot):
        from app.utils.security import create_access_token

        token = create_access_token(data={"sub": str(test_user.id)})
        response = client.post(
            f"/bots/{test_bot.id}/documents",
            files={"file": ("test.exe", io.BytesIO(b"binary data"), "text/plain")},
            headers={"Authorization": f"Bearer {token}"},
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert "Unsupported file extension" in response.json()["detail"]

    def test_upload_oversized_file(self, client, test_user: User, test_bot: Bot):
        from app.utils.security import create_access_token

        token = create_access_token(data={"sub": str(test_user.id)})
        big_content = b"x" * (11 * 1024 * 1024)  # 11 MB
        response = client.post(
            f"/bots/{test_bot.id}/documents",
            files={"file": ("big.pdf", io.BytesIO(big_content), "application/pdf")},
            headers={"Authorization": f"Bearer {token}"},
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert "File too large" in response.json()["detail"]

    def test_list_documents(self, client, test_user: User, test_bot: Bot, db):
        from app.utils.security import create_access_token

        token = create_access_token(data={"sub": str(test_user.id)})

        doc = Document(
            id=__import__("uuid").uuid4(),
            bot_id=test_bot.id,
            filename="doc.pdf",
            status="ready",
            source_type="pdf",
            uploaded_at=__import__("datetime").datetime.now(__import__("datetime").timezone.utc),
        )
        db.add(doc)
        db.commit()
        db.refresh(doc)

        response = client.get(
            f"/bots/{test_bot.id}/documents",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert len(data) == 1
        assert data[0]["filename"] == "doc.pdf"

    def test_delete_document(self, client, test_user: User, test_bot: Bot, db):
        from app.utils.security import create_access_token

        token = create_access_token(data={"sub": str(test_user.id)})
        doc = Document(
            id=__import__("uuid").uuid4(),
            bot_id=test_bot.id,
            filename="todelete.pdf",
            status="ready",
            source_type="pdf",
            uploaded_at=__import__("datetime").datetime.now(__import__("datetime").timezone.utc),
        )
        db.add(doc)
        db.commit()
        db.refresh(doc)

        response = client.delete(
            f"/bots/{test_bot.id}/documents/{doc.id}",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert response.status_code == status.HTTP_204_NO_CONTENT
        assert db.get(Document, str(doc.id)) is None

    def test_ingest_url_rejects_invalid_scheme(self, client, test_user: User, test_bot: Bot):
        from app.utils.security import create_access_token

        token = create_access_token(data={"sub": str(test_user.id)})
        response = client.post(
            f"/bots/{test_bot.id}/documents/url",
            json={"url": "file:///etc/passwd"},
            headers={"Authorization": f"Bearer {token}"},
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert "http" in response.json()["detail"].lower()

    def test_ingest_url_rejects_localhost(self, client, test_user: User, test_bot: Bot):
        from app.utils.security import create_access_token

        token = create_access_token(data={"sub": str(test_user.id)})
        response = client.post(
            f"/bots/{test_bot.id}/documents/url",
            json={"url": "http://localhost/admin"},
            headers={"Authorization": f"Bearer {token}"},
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert "internal or private" in response.json()["detail"]

    def test_ingest_url_duplicate_detection(self, client, test_user: User, test_bot: Bot, db):
        from app.utils.security import create_access_token

        token = create_access_token(data={"sub": str(test_user.id)})
        url = "https://example.com/page"

        # First ingest should succeed (mocked later in real tests; here we just check duplicate logic)
        existing = Document(
            id=__import__("uuid").uuid4(),
            bot_id=test_bot.id,
            filename=url,
            status="ready",
            source_type="url",
            source_url=url,
            uploaded_at=__import__("datetime").datetime.now(__import__("datetime").timezone.utc),
        )
        db.add(existing)
        db.commit()
        db.refresh(existing)

        response = client.post(
            f"/bots/{test_bot.id}/documents/url",
            json={"url": url},
            headers={"Authorization": f"Bearer {token}"},
        )
        assert response.status_code == status.HTTP_409_CONFLICT
        assert "already in your knowledge base" in response.json()["detail"]

    def test_user_cannot_access_other_users_document(self, client, test_user: User, test_user2: User, test_bot_user2: Bot, db):
        from app.utils.security import create_access_token

        token = create_access_token(data={"sub": str(test_user.id)})
        doc = Document(
            id=__import__("uuid").uuid4(),
            bot_id=test_bot_user2.id,
            filename="secret.pdf",
            status="ready",
            source_type="pdf",
            uploaded_at=__import__("datetime").datetime.now(__import__("datetime").timezone.utc),
        )
        db.add(doc)
        db.commit()
        db.refresh(doc)

        response = client.delete(
            f"/bots/{test_bot_user2.id}/documents/{doc.id}",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert response.status_code == status.HTTP_404_NOT_FOUND

    def test_list_documents_returns_source_url(self, client, test_user: User, test_bot: Bot, db):
        from app.utils.security import create_access_token

        token = create_access_token(data={"sub": str(test_user.id)})
        doc = Document(
            id=__import__("uuid").uuid4(),
            bot_id=test_bot.id,
            filename="https://example.com/page",
            status="ready",
            source_type="url",
            source_url="https://example.com/page",
            uploaded_at=__import__("datetime").datetime.now(__import__("datetime").timezone.utc),
        )
        db.add(doc)
        db.commit()
        db.refresh(doc)

        response = client.get(
            f"/bots/{test_bot.id}/documents",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert data[0]["source_url"] == "https://example.com/page"
        assert data[0]["source_type"] == "url"
