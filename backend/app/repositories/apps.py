from datetime import datetime, timezone
import logging

from ..database import Database
from ..models.app import CircuitApp, CircuitAppCreate, CircuitAppSummary, CircuitAppUpdate

logger = logging.getLogger(__name__)


class CircuitAppRepository:
    def __init__(self, database: Database) -> None:
        self._database = database

    @property
    def _collection(self):
        return self._database.database.apps

    async def list_summaries(self, owner_id: str) -> list[CircuitAppSummary]:
        documents = await self._collection.find({"owner_id": owner_id}, {"_id": 0}).sort("updated_at", -1).to_list(None)
        logger.info("listed apps count=%s", len(documents))
        return [
            CircuitAppSummary(
                id=document["id"],
                name=document["name"],
                description=document.get("description", ""),
                screen_count=len(document.get("screens", [])),
                updated_at=document["updated_at"],
            )
            for document in documents
        ]

    async def get(self, app_id: str, owner_id: str) -> CircuitApp | None:
        document = await self._collection.find_one({"id": app_id, "owner_id": owner_id}, {"_id": 0})
        logger.debug("fetched app app_id=%s found=%s", app_id, document is not None)
        return CircuitApp.model_validate(document) if document else None

    async def create(self, payload: CircuitAppCreate, owner_id: str) -> CircuitApp:
        app = CircuitApp(**payload.model_dump(), owner_id=owner_id)
        await self._collection.insert_one(app.model_dump(mode="json"))
        logger.info("created app app_id=%s", app.id)
        return app

    async def update(self, app: CircuitApp, payload: CircuitAppUpdate) -> CircuitApp:
        changes = payload.model_dump(exclude_unset=True)
        updated = CircuitApp.model_validate(
            {**app.model_dump(), **changes, "updated_at": datetime.now(timezone.utc)}
        )
        await self._collection.replace_one({"id": app.id}, updated.model_dump(mode="json"), upsert=False)
        logger.info("updated app app_id=%s", app.id)
        return updated

    async def delete(self, app_id: str, owner_id: str) -> bool:
        result = await self._collection.delete_one({"id": app_id, "owner_id": owner_id})
        logger.info("deleted app app_id=%s deleted=%s", app_id, result.deleted_count == 1)
        return result.deleted_count == 1
