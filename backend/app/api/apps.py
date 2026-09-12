from typing import Annotated
import logging

from fastapi import APIRouter, Depends, HTTPException, status

from ..auth import get_current_user_id
from ..database import Database
from ..main_dependencies import get_database
from ..models.app import CircuitApp, CircuitAppCreate, CircuitAppSummary, CircuitAppUpdate
from ..repositories.apps import CircuitAppRepository

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/apps", tags=["apps"])
DatabaseDependency = Annotated[Database, Depends(get_database)]
UserDependency = Annotated[str, Depends(get_current_user_id)]


def get_repository(database: DatabaseDependency) -> CircuitAppRepository:
    if not database.configured:
        logger.warning("app persistence requested while MongoDB is unconfigured")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="MongoDB is not configured. Set MONGO_URI to enable app persistence.",
        )
    return CircuitAppRepository(database)


RepositoryDependency = Annotated[CircuitAppRepository, Depends(get_repository)]


async def get_app_or_404(repository: RepositoryDependency, app_id: str, user_id: UserDependency) -> CircuitApp:
    app = await repository.get(app_id, user_id)
    if not app:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="App not found")
    return app


AppDependency = Annotated[CircuitApp, Depends(get_app_or_404)]


@router.get("", response_model=list[CircuitAppSummary])
async def list_apps(repository: RepositoryDependency, user_id: UserDependency) -> list[CircuitAppSummary]:
    return await repository.list_summaries(user_id)


@router.post("", response_model=CircuitApp, status_code=status.HTTP_201_CREATED)
async def create_app(payload: CircuitAppCreate, repository: RepositoryDependency, user_id: UserDependency) -> CircuitApp:
    return await repository.create(payload, user_id)


@router.get("/{app_id}", response_model=CircuitApp)
async def get_app(app: AppDependency) -> CircuitApp:
    return app


@router.put("/{app_id}", response_model=CircuitApp)
async def update_app(payload: CircuitAppUpdate, app: AppDependency, repository: RepositoryDependency) -> CircuitApp:
    return await repository.update(app, payload)


@router.delete("/{app_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_app(app_id: str, repository: RepositoryDependency, user_id: UserDependency) -> None:
    deleted = await repository.delete(app_id, user_id)
    if not deleted:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="App not found")
