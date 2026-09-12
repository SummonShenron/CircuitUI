from datetime import datetime, timezone
from enum import StrEnum
from typing import Literal
from uuid import uuid4

from pydantic import BaseModel, Field


class ComponentKind(StrEnum):
    LABEL = "label"
    BUTTON = "button"
    TEXT_INPUT = "text_input"
    IMAGE = "image"
    TABLE = "table"
    CONTAINER = "container"
    CHAT = "chat"


class Position(BaseModel):
    x: float
    y: float


class Size(BaseModel):
    width: float
    height: float


class ComponentBinding(BaseModel):
    """Wires a component to a Circuit workflow served by the workflow_builder API."""

    workflow_id: str
    workflow_name: str = ""
    trigger: Literal["on_click", "on_load"] = "on_click"
    input_mapping: dict[str, str] = Field(default_factory=dict)
    output_key: str | None = None


class Component(BaseModel):
    id: str = Field(default_factory=lambda: uuid4().hex)
    type: ComponentKind
    name: str
    position: Position
    size: Size
    props: dict[str, object] = Field(default_factory=dict)
    binding: ComponentBinding | None = None


class Screen(BaseModel):
    id: str = Field(default_factory=lambda: uuid4().hex)
    name: str = "Screen 1"
    components: list[Component] = Field(default_factory=list)


class CircuitAppBase(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    description: str = ""


class CircuitAppCreate(CircuitAppBase):
    pass


class CircuitAppUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=120)
    description: str | None = None
    screens: list[Screen] | None = None


class CircuitApp(CircuitAppBase):
    id: str = Field(default_factory=lambda: uuid4().hex)
    owner_id: str
    screens: list[Screen] = Field(default_factory=lambda: [Screen()])
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class CircuitAppSummary(BaseModel):
    id: str
    name: str
    description: str
    screen_count: int
    updated_at: datetime
