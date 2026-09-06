"""Bot endpoint tests."""

from __future__ import annotations

import pytest
from fastapi import status

from app.models import Bot


class TestBots:
    def test_create_bot(self, client, test_user: User, db):
        from app.utils.security import create_access_token

        token = create_access_token(data={"sub": str(test_user.id)})
        response = client.post(
            "/bots",
            json={"name": "My Bot"},
            headers={"Authorization": f"Bearer {token}"},
        )
        assert response.status_code == status.HTTP_201_CREATED
        data = response.json()
        assert data["name"] == "My Bot"
        assert data["user_id"] == str(test_user.id)
        assert data["document_count"] == 0

    def test_list_bots(self, client, test_user: User, test_bot: Bot, db):
        from app.utils.security import create_access_token

        token = create_access_token(data={"sub": str(test_user.id)})
        response = client.get(
            "/bots",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert len(data) == 1
        assert data[0]["id"] == str(test_bot.id)
        assert data[0]["document_count"] == 0

    def test_get_bot(self, client, test_user: User, test_bot: Bot):
        from app.utils.security import create_access_token

        token = create_access_token(data={"sub": str(test_user.id)})
        response = client.get(
            f"/bots/{test_bot.id}",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert data["id"] == str(test_bot.id)
        assert data["name"] == "Test Bot"

    def test_get_bot_not_found(self, client, test_user: User):
        from app.utils.security import create_access_token

        token = create_access_token(data={"sub": str(test_user.id)})
        response = client.get(
            f"/bots/{__import__('uuid').uuid4()}",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert response.status_code == status.HTTP_404_NOT_FOUND

    def test_update_bot(self, client, test_user: User, test_bot: Bot):
        from app.utils.security import create_access_token

        token = create_access_token(data={"sub": str(test_user.id)})
        response = client.patch(
            f"/bots/{test_bot.id}",
            json={"name": "Updated Bot", "widget_color": "#ff0000"},
            headers={"Authorization": f"Bearer {token}"},
        )
        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert data["name"] == "Updated Bot"
        assert data["widget_color"] == "#ff0000"

    def test_delete_bot(self, client, test_user: User, test_bot: Bot, db):
        from app.utils.security import create_access_token

        token = create_access_token(data={"sub": str(test_user.id)})
        response = client.delete(
            f"/bots/{test_bot.id}",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert response.status_code == status.HTTP_204_NO_CONTENT
        assert db.get(Bot, str(test_bot.id)) is None

    def test_user_cannot_access_other_users_bot(
        self, client, test_user: User, test_user2: User, test_bot_user2: Bot
    ):
        from app.utils.security import create_access_token

        token = create_access_token(data={"sub": str(test_user.id)})
        response = client.get(
            f"/bots/{test_bot_user2.id}",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert response.status_code == status.HTTP_404_NOT_FOUND
