from typing import Annotated, Any
import logging

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from ..auth import get_forwarded_authorization
from ..clients.workflow_builder import WorkflowBuilderClient
from ..config import Settings, get_settings

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/workflows", tags=["workflows"])
AuthorizationDependency = Annotated[str | None, Depends(get_forwarded_authorization)]
SettingsDependency = Annotated[Settings, Depends(get_settings)]


def get_client(settings: SettingsDependency, authorization: AuthorizationDependency) -> WorkflowBuilderClient:
    return WorkflowBuilderClient(settings, authorization)


ClientDependency = Annotated[WorkflowBuilderClient, Depends(get_client)]


class RunWorkflowRequest(BaseModel):
    inputs: dict[str, Any] = {}


@router.get("")
async def list_workflows(client: ClientDependency) -> list[dict[str, Any]]:
    """Workflows the signed-in user can bind app components to, proxied from workflow_builder."""
    return await client.list_workflows()


@router.get("/{workflow_id}")
async def get_workflow(workflow_id: str, client: ClientDependency) -> dict[str, Any]:
    return await client.get_workflow(workflow_id)


@router.post("/{workflow_id}/run")
async def run_workflow(workflow_id: str, payload: RunWorkflowRequest, client: ClientDependency) -> dict[str, Any]:
    return await client.run_workflow(workflow_id, payload.inputs)
