from datetime import datetime
from pydantic import BaseModel, ConfigDict, Field


class ShowOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    movie: str
    cinema: str
    starts_at: datetime


class SeatOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    row: str
    number: int
    section: str
    price: float
    status: str
    x: float | None = None
    y: float | None = None
    z: float | None = None
    rotation_y: float | None = None
    design: str | None = None
    colors: dict | None = None
    label: str | None = None
    capacity: int = 1


class BookRequest(BaseModel):
    seat_ids: list[int]
    hold_token: str | None = None


class BookResponse(BaseModel):
    booked: list[int]
    total: float


class RegisterRequest(BaseModel):
    email: str
    password: str = Field(min_length=8)
    role: str = "customer"


class LoginRequest(BaseModel):
    email: str
    password: str


class TokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"


class DesignOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    key: str
    name: str
    width: float
    depth: float
    capacity: int
    price_multiplier: float
    default_colors: dict


class HallIn(BaseModel):
    name: str
    room_width: float = Field(default=24, gt=0)
    room_depth: float = Field(default=30, gt=0)
    room_height: float = Field(default=12, gt=0)
    screen: dict = Field(default_factory=lambda: {"width": 16, "height": 7, "curve": 0, "x": 0, "y": 4.2, "z": 0, "aspect": 16 / 7})


class SectionIn(BaseModel):
    id: int | None = None
    name: str
    base_price: float = Field(ge=0)
    color: str = "#c0262d"


class HallSeatIn(BaseModel):
    section_id: int
    design_id: int
    row_label: str = Field(min_length=1, max_length=8)
    seat_number: int = Field(ge=1)
    label: str
    x: float
    y: float = 0
    z: float
    rotation_y: float = 0
    colors: dict = Field(default_factory=dict)
    is_active: bool = True


class LayoutIn(BaseModel):
    sections: list[SectionIn]
    seats: list[HallSeatIn]


class HallImport(HallIn):
    sections: list[SectionIn] = Field(default_factory=list)
    seats: list[HallSeatIn] = Field(default_factory=list)


class HallOut(BaseModel):
    id: int
    owner_id: int
    name: str
    status: str
    room_width: float
    room_depth: float
    room_height: float
    screen: dict
    sections: list[dict]
    seats: list[dict]

    @classmethod
    def from_hall(cls, hall):
        return cls(
            id=hall.id, owner_id=hall.owner_id, name=hall.name, status=hall.status,
            room_width=hall.room_width, room_depth=hall.room_depth, room_height=hall.room_height,
            screen=hall.screen,
            sections=[{"id": s.id, "name": s.name, "base_price": s.base_price, "color": s.color} for s in hall.sections],
            seats=[{"id": s.id, "section_id": s.section_id, "design_id": s.design_id,
                    "row_label": s.row_label, "seat_number": s.seat_number, "label": s.label,
                    "x": s.x, "y": s.y, "z": s.z, "rotation_y": s.rotation_y,
                    "colors": s.colors, "is_active": s.is_active} for s in hall.hall_seats],
        )


class ShowCreate(BaseModel):
    hall_id: int
    movie: str
    starts_at: datetime


class HoldResponse(BaseModel):
    held: list[int]
    hold_token: str
    held_until: datetime
