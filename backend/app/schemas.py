from datetime import datetime
from pydantic import BaseModel, ConfigDict


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


class BookRequest(BaseModel):
    seat_ids: list[int]


class BookResponse(BaseModel):
    booked: list[int]
    total: float
