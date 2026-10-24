from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session
from ..db import get_db
from ..models import Seat, Show
from ..schemas import BookRequest, BookResponse, SeatOut, ShowOut

router = APIRouter(prefix="/api/shows", tags=["shows"])


@router.get("", response_model=list[ShowOut])
def list_shows(db: Session = Depends(get_db)):
    return db.scalars(select(Show).order_by(Show.starts_at)).all()


@router.get("/{show_id}/seats", response_model=list[SeatOut])
def get_seats(show_id: int, db: Session = Depends(get_db)):
    if not db.get(Show, show_id):
        raise HTTPException(404, "Show not found")
    return db.scalars(
        select(Seat).where(Seat.show_id == show_id).order_by(Seat.row, Seat.number)
    ).all()


@router.post("/{show_id}/book", response_model=BookResponse)
def book(show_id: int, body: BookRequest, db: Session = Depends(get_db)):
    # Row locks stop two people booking the same seat at once.
    seats = db.scalars(
        select(Seat)
        .where(Seat.show_id == show_id, Seat.id.in_(body.seat_ids))
        .with_for_update()
    ).all()
    if not seats or len(seats) != len(set(body.seat_ids)):
        raise HTTPException(400, "Invalid seats")
    if any(s.status != "available" for s in seats):
        raise HTTPException(409, "One or more seats were just taken")
    for s in seats:
        s.status = "occupied"
    db.commit()
    return BookResponse(booked=[s.id for s in seats], total=float(sum(s.price for s in seats)))
