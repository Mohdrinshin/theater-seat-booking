from datetime import datetime
from sqlalchemy import DateTime, ForeignKey, JSON, Numeric, String, UniqueConstraint, Boolean, Float
from sqlalchemy.orm import Mapped, mapped_column, relationship
from .db import Base


class Show(Base):
    __tablename__ = "shows"
    id: Mapped[int] = mapped_column(primary_key=True)
    movie: Mapped[str] = mapped_column(String(200))
    cinema: Mapped[str] = mapped_column(String(200))
    starts_at: Mapped[datetime] = mapped_column(DateTime)
    hall_id: Mapped[int | None] = mapped_column(ForeignKey("halls.id"), nullable=True, index=True)
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


class User(Base):
    __tablename__ = "users"
    id: Mapped[int] = mapped_column(primary_key=True)
    email: Mapped[str] = mapped_column(String(320), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(256))
    role: Mapped[str] = mapped_column(String(16), default="customer")


class SeatDesign(Base):
    __tablename__ = "seat_designs"
    id: Mapped[int] = mapped_column(primary_key=True)
    key: Mapped[str] = mapped_column(String(32), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(100))
    width: Mapped[float] = mapped_column(Float)
    depth: Mapped[float] = mapped_column(Float)
    depth_closed: Mapped[float] = mapped_column(Float, default=0.6)
    depth_open: Mapped[float] = mapped_column(Float, default=0.6)
    capacity: Mapped[int] = mapped_column(default=1)
    price_multiplier: Mapped[float] = mapped_column(Float, default=1)
    tier: Mapped[str] = mapped_column(String(32), default="Standard")
    upholstery: Mapped[str] = mapped_column(String(16), default="fabric")
    default_colors: Mapped[dict] = mapped_column(JSON, default=dict)


class RoomTheme(Base):
    __tablename__ = "room_themes"
    id: Mapped[int] = mapped_column(primary_key=True)
    key: Mapped[str] = mapped_column(String(32), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(100))
    default_seat: Mapped[str] = mapped_column(String(32))
    config: Mapped[dict] = mapped_column(JSON, default=dict)


class Hall(Base):
    __tablename__ = "halls"
    id: Mapped[int] = mapped_column(primary_key=True)
    owner_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    name: Mapped[str] = mapped_column(String(160))
    status: Mapped[str] = mapped_column(String(16), default="draft")
    room_width: Mapped[float] = mapped_column(Float, default=24)
    room_depth: Mapped[float] = mapped_column(Float, default=30)
    room_height: Mapped[float] = mapped_column(Float, default=12)
    screen: Mapped[dict] = mapped_column(JSON, default=dict)
    room_theme: Mapped[str] = mapped_column(String(32), default="multiplex")
    theme_options: Mapped[dict] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    sections: Mapped[list["HallSection"]] = relationship(cascade="all, delete-orphan")
    hall_seats: Mapped[list["HallSeat"]] = relationship(cascade="all, delete-orphan")


class HallSection(Base):
    __tablename__ = "hall_sections"
    id: Mapped[int] = mapped_column(primary_key=True)
    hall_id: Mapped[int] = mapped_column(ForeignKey("halls.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(String(80))
    base_price: Mapped[float] = mapped_column(Float, default=0)
    color: Mapped[str] = mapped_column(String(16), default="#c0262d")


class HallSeat(Base):
    __tablename__ = "hall_seats"
    __table_args__ = (UniqueConstraint("hall_id", "row_label", "seat_number"),)
    id: Mapped[int] = mapped_column(primary_key=True)
    hall_id: Mapped[int] = mapped_column(ForeignKey("halls.id", ondelete="CASCADE"), index=True)
    section_id: Mapped[int] = mapped_column(ForeignKey("hall_sections.id", ondelete="CASCADE"))
    design_id: Mapped[int] = mapped_column(ForeignKey("seat_designs.id"))
    row_label: Mapped[str] = mapped_column(String(8))
    seat_number: Mapped[int] = mapped_column()
    label: Mapped[str] = mapped_column(String(32))
    x: Mapped[float] = mapped_column(Float)
    y: Mapped[float] = mapped_column(Float, default=0)
    z: Mapped[float] = mapped_column(Float)
    rotation_y: Mapped[float] = mapped_column(Float, default=0)
    colors: Mapped[dict] = mapped_column(JSON, default=dict)
    design_options: Mapped[dict] = mapped_column(JSON, default=dict)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)


class ShowSeat(Base):
    __tablename__ = "show_seats"
    __table_args__ = (UniqueConstraint("show_id", "hall_seat_id"),)
    id: Mapped[int] = mapped_column(primary_key=True)
    show_id: Mapped[int] = mapped_column(ForeignKey("shows.id", ondelete="CASCADE"), index=True)
    hall_seat_id: Mapped[int] = mapped_column(ForeignKey("hall_seats.id"))
    price: Mapped[float] = mapped_column(Numeric(10, 2))
    status: Mapped[str] = mapped_column(String(12), default="available")
    held_until: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    held_by: Mapped[str | None] = mapped_column(String(64), nullable=True)


class PaymentAttempt(Base):
    __tablename__ = "payment_attempts"
    id: Mapped[int] = mapped_column(primary_key=True)
    show_id: Mapped[int] = mapped_column(ForeignKey("shows.id", ondelete="CASCADE"), index=True)
    razorpay_order_id: Mapped[str | None] = mapped_column(String(64), unique=True, nullable=True)
    razorpay_payment_id: Mapped[str | None] = mapped_column(String(64), unique=True, nullable=True)
    seat_ids: Mapped[list[int]] = mapped_column(JSON)
    hold_token: Mapped[str] = mapped_column(String(64))
    amount_paise: Mapped[int] = mapped_column()
    currency: Mapped[str] = mapped_column(String(3), default="INR")
    status: Mapped[str] = mapped_column(String(24), default="creating", index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
