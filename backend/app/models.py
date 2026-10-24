from datetime import datetime
from sqlalchemy import DateTime, ForeignKey, Numeric, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship
from .db import Base


class Show(Base):
    __tablename__ = "shows"
    id: Mapped[int] = mapped_column(primary_key=True)
    movie: Mapped[str] = mapped_column(String(200))
    cinema: Mapped[str] = mapped_column(String(200))
    starts_at: Mapped[datetime] = mapped_column(DateTime)
    seats: Mapped[list["Seat"]] = relationship(back_populates="show")


class Seat(Base):
    __tablename__ = "seats"
    __table_args__ = (UniqueConstraint("show_id", "row", "number"),)
    id: Mapped[int] = mapped_column(primary_key=True)
    show_id: Mapped[int] = mapped_column(ForeignKey("shows.id"), index=True)
    row: Mapped[str] = mapped_column(String(2))          # "A".."J"
    number: Mapped[int]                                   # 1..12
    section: Mapped[str] = mapped_column(String(20))     # "classic" | "prime"
    price: Mapped[float] = mapped_column(Numeric(10, 2))
    status: Mapped[str] = mapped_column(String(12), default="available")  # available | occupied
    show: Mapped[Show] = relationship(back_populates="seats")
