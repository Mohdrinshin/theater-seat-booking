from datetime import datetime, timedelta
import secrets

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select, update
from sqlalchemy.orm import Session
from ..auth import owner_user
from ..db import get_db
from ..models import Hall, HallSeat, HallSection, Seat, SeatDesign, Show, ShowSeat, User
from ..schemas import BookRequest, BookResponse, HoldResponse, SeatOut, ShowCreate, ShowOut

router = APIRouter(prefix="/api/shows", tags=["shows"])


@router.get("", response_model=list[ShowOut])
def list_shows(db: Session = Depends(get_db)):
    return db.scalars(select(Show).order_by(Show.starts_at)).all()


@router.get("/{show_id}/seats", response_model=list[SeatOut])
def get_seats(show_id: int, db: Session = Depends(get_db)):
    show = db.get(Show, show_id)
    if not show:
        raise HTTPException(404, "Show not found")
    if show.hall_id:
        rows = db.execute(
            select(ShowSeat, HallSeat, HallSection, SeatDesign)
            .join(HallSeat, ShowSeat.hall_seat_id == HallSeat.id)
            .join(HallSection, HallSeat.section_id == HallSection.id)
            .join(SeatDesign, HallSeat.design_id == SeatDesign.id)
            .where(ShowSeat.show_id == show_id, HallSeat.is_active.is_(True))
            .order_by(HallSeat.row_label, HallSeat.seat_number)
        ).all()
        return [SeatOut(id=ss.id, row=hs.row_label, number=hs.seat_number, section=section.name,
                        price=float(ss.price), status="occupied" if ss.status in {"booked", "held"} and (ss.status == "booked" or not ss.held_until or ss.held_until > datetime.utcnow()) else "available",
                        x=hs.x, y=hs.y, z=hs.z, rotation_y=hs.rotation_y, design=design.key,
                        colors=hs.colors, label=hs.label, capacity=design.capacity)
                for ss, hs, section, design in rows]
    return db.scalars(
        select(Seat).where(Seat.show_id == show_id).order_by(Seat.row, Seat.number)
    ).all()


@router.post("", response_model=ShowOut, status_code=201)
def create_show(body: ShowCreate, db: Session = Depends(get_db), owner: User = Depends(owner_user)):
    hall = db.get(Hall, body.hall_id)
    if not hall or hall.owner_id != owner.id:
        raise HTTPException(404, "Hall not found")
    if hall.status != "published":
        raise HTTPException(409, "Publish the hall before creating a show")
    show = Show(movie=body.movie, cinema=hall.name, starts_at=body.starts_at, hall_id=hall.id)
    db.add(show)
    db.flush()
    sections = {s.id: s for s in db.scalars(select(HallSection).where(HallSection.hall_id == hall.id)).all()}
    designs = {d.id: d for d in db.scalars(select(SeatDesign)).all()}
    seats = db.scalars(select(HallSeat).where(HallSeat.hall_id == hall.id, HallSeat.is_active.is_(True))).all()
    for seat in seats:
        section, design = sections[seat.section_id], designs[seat.design_id]
        db.add(ShowSeat(show_id=show.id, hall_seat_id=seat.id,
                        price=round(section.base_price * design.price_multiplier, 2), status="available"))
    db.commit()
    db.refresh(show)
    return show


@router.post("/{show_id}/hold", response_model=HoldResponse)
def hold(show_id: int, body: BookRequest, db: Session = Depends(get_db)):
    show = db.get(Show, show_id)
    if not show or not show.hall_id:
        raise HTTPException(404, "Hall-backed show not found")
    now = datetime.utcnow()
    ids = list(set(body.seat_ids))
    db.execute(update(ShowSeat).where(ShowSeat.show_id == show_id, ShowSeat.status == "held", ShowSeat.held_until <= now)
               .values(status="available", held_until=None, held_by=None))
    rows = db.scalars(select(ShowSeat).where(ShowSeat.show_id == show_id, ShowSeat.id.in_(ids)).with_for_update()).all()
    if not ids or len(rows) != len(ids):
        raise HTTPException(400, "Invalid seats")
    if any(row.status != "available" for row in rows):
        raise HTTPException(409, "One or more seats are no longer available")
    token = secrets.token_urlsafe(24)
    expiry = now + timedelta(minutes=5)
    for row in rows:
        row.status, row.held_until, row.held_by = "held", expiry, token
    db.commit()
    return HoldResponse(held=[row.id for row in rows], hold_token=token, held_until=expiry)


@router.post("/{show_id}/book", response_model=BookResponse)
def book(show_id: int, body: BookRequest, db: Session = Depends(get_db)):
    show = db.get(Show, show_id)
    if show and show.hall_id:
        now = datetime.utcnow()
        ids = list(set(body.seat_ids))
        db.execute(update(ShowSeat).where(ShowSeat.show_id == show_id, ShowSeat.status == "held", ShowSeat.held_until <= now)
                   .values(status="available", held_until=None, held_by=None))
        rows = db.scalars(select(ShowSeat).where(ShowSeat.show_id == show_id, ShowSeat.id.in_(ids)).with_for_update()).all()
        if not ids or len(rows) != len(ids):
            raise HTTPException(400, "Invalid seats")
        if any(row.status != "held" or row.held_by != body.hold_token or not row.held_until or row.held_until <= now for row in rows):
            raise HTTPException(409, "Hold expired or seats were held by another customer")
        for row in rows:
            row.status, row.held_until, row.held_by = "booked", None, None
        db.commit()
        return BookResponse(booked=[row.id for row in rows], total=float(sum(row.price for row in rows)))
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
