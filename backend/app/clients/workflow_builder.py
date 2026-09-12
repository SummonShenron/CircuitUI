from typing import Any
import logging

import httpx
from fastapi import HTTPException, status

from ..config import Settings

logger = logging.getLogger(__name__)


class WorkflowBuilderClient:
    """Thin proxy to the Circuit workflow_builder API.

    Forwards the caller's own Clerk bearer token so workflow_builder scopes
    results to the same signed-in user, instead of CircUIt holding a separate
    service credential.
    """

    def __init__(self, settings: Settings, authorization: str | None) -> None:
        self._base_url = settings.workflow_builder_api_url.rstrip("/")
        self._headers = {"Authorization": authorization} if authorization else {}

    async def _request(self, method: str, path: str, **kwargs: Any) -> Any:
        url = f"{self._base_url}{path}"
        async with httpx.AsyncClient(timeout=30.0) as client:
            try:
                response = await client.request(method, url, headers=self._headers, **kwargs)
            except httpx.RequestError as error:
                logger.warning("workflow_builder request failed method=%s path=%s error=%s", method, path, error)
                raise HTTPException(
                    status_code=status.HTTP_502_BAD_GATEWAY,
                    detail="Could not reach the Circuit workflow_builder API",
                ) from error
        if response.status_code == status.HTTP_401_UNAUTHORIZED:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated with workflow_builder")
        if response.is_error:
            logger.warning("workflow_builder returned an error method=%s path=%s status=%s", method, path, response.status_code)
            raise HTTPException(status_code=response.status_code, detail=response.text)
        return response.json()

    async def list_workflows(self) -> list[dict[str, Any]]:
        return await self._request("GET", "/workflows")

    async def get_workflow(self, workflow_id: str) -> dict[str, Any]:
        return await self._request("GET", f"/workflows/{workflow_id}")

    async def run_workflow(self, workflow_id: str, inputs: dict[str, Any]) -> dict[str, Any]:
        return await self._request("POST", f"/workflows/{workflow_id}/run", json={"inputs": inputs})

    async def run_console(
        self, workflow_id: str, event_name: str, conversation_id: str, message: str, history: list[dict[str, str]]
    ) -> Any:
        """Calls workflow_builder's chat-console endpoint for an event-triggered workflow."""
        return await self._request(
            "POST",
            f"/workflows/{workflow_id}/console",
            json={"event_name": event_name, "conversation_id": conversation_id, "message": message, "history": history},
        )
