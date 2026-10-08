from datetime import datetime, timezone
from enum import StrEnum
from typing import Annotated, Literal, Union
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
    LIST = "list"
    MESSAGE = "message"


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


class ComponentStyle(BaseModel):
    """Preset keys (see frontend/src/effectPresets.ts) for this component's
    base/hover/active look - not raw CSS, just a choice from a curated menu."""

    base: str | None = None
    hover: str | None = None
    active: str | None = None


class RunWorkflowAction(BaseModel):
    type: Literal["run_workflow"] = "run_workflow"
    workflow_id: str
    workflow_name: str = ""
    input_mapping: dict[str, str] = Field(default_factory=dict)
    output_key: str | None = None


class SetVariableAction(BaseModel):
    type: Literal["set_variable"] = "set_variable"
    name: str
    # A formula (see frontend/src/builder/expressions.ts), evaluated at
    # run time - e.g. `true`, `{{count}} + 1`, `{{name}} != ""`.
    value: str = ""


class NavigateAction(BaseModel):
    type: Literal["navigate"] = "navigate"
    screen_id: str


class SendChatMessageAction(BaseModel):
    """Injects a message into a chat component as if the user had typed and
    sent it - e.g. an "example question" button elsewhere on the screen."""

    type: Literal["send_chat_message"] = "send_chat_message"
    target_component_id: str
    message: str = ""


class ListField(BaseModel):
    key: str
    value: str = ""


class AppendToListAction(BaseModel):
    """Pushes one structured entry onto a variable (creating it as a list if
    it isn't one yet) - each field's value is its own formula, evaluated at
    run time. This is how a custom-built chat feed grows."""

    type: Literal["append_to_list"] = "append_to_list"
    variable: str
    fields: list[ListField] = Field(default_factory=list)


ActionStep = Annotated[
    Union[RunWorkflowAction, SetVariableAction, NavigateAction, SendChatMessageAction, AppendToListAction],
    Field(discriminator="type"),
]


class Component(BaseModel):
    id: str = Field(default_factory=lambda: uuid4().hex)
    type: ComponentKind
    name: str
    position: Position
    size: Size
    props: dict[str, object] = Field(default_factory=dict)
    binding: ComponentBinding | None = None
    style: ComponentStyle | None = None
    # When set, `position` is relative to the parent container's top-left
    # corner instead of the screen's, and this component moves with it.
    parent_id: str | None = None
    trigger: Literal["on_click", "on_load"] | None = None
    actions: list[ActionStep] = Field(default_factory=list)
    # A formula (see frontend/src/builder/expressions.ts); blank/None means
    # always visible.
    visibility_expression: str | None = None


class Screen(BaseModel):
    id: str = Field(default_factory=lambda: uuid4().hex)
    name: str = "Screen 1"
    components: list[Component] = Field(default_factory=list)
    size: Size = Field(default_factory=lambda: Size(width=1280, height=800))


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
