from datetime import datetime
from math import cos, sin, pi

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from ..auth import owner_user
from ..db import get_db
from ..models import Hall, HallSeat, HallSection, SeatDesign, Show, User
from ..schemas import HallImport, HallIn, HallOut, LayoutIn

router = APIRouter(prefix="/api/halls", tags=["halls"])


def owned_hall(db: Session, hall_id: int, owner: User) -> Hall:
    hall = db.scalar(select(Hall).options(selectinload(Hall.sections), selectinload(Hall.hall_seats)).where(Hall.id == hall_id))
    if not hall:
        raise HTTPException(404, "Hall not found")
    if hall.owner_id != owner.id:
        raise HTTPException(403, "You do not own this hall")
    return hall


@router.get("")
def list_halls(db: Session = Depends(get_db), owner: User = Depends(owner_user)):
    halls = db.scalars(select(Hall).options(selectinload(Hall.sections), selectinload(Hall.hall_seats)).where(Hall.owner_id == owner.id).order_by(Hall.id)).unique().all()
    return [HallOut.from_hall(h) for h in halls]


@router.post("", status_code=201)
def create_hall(body: HallIn, db: Session = Depends(get_db), owner: User = Depends(owner_user)):
    hall = Hall(owner_id=owner.id, name=body.name.strip(), room_width=body.room_width,
                room_depth=body.room_depth, room_height=body.room_height, screen=body.screen)
    if not hall.name:
        raise HTTPException(422, "Hall name is required")
    db.add(hall)
    db.commit()
    return HallOut.from_hall(owned_hall(db, hall.id, owner))


@router.get("/{hall_id}")
def get_hall(hall_id: int, db: Session = Depends(get_db), owner: User = Depends(owner_user)):
    return HallOut.from_hall(owned_hall(db, hall_id, owner))


@router.put("/{hall_id}")
def update_hall(hall_id: int, body: HallIn, db: Session = Depends(get_db), owner: User = Depends(owner_user)):
    hall = owned_hall(db, hall_id, owner)
    has_future_shows = hall.status == "published" and db.scalar(select(Show.id).where(Show.hall_id == hall.id, Show.starts_at > datetime.utcnow()))
    if has_future_shows and (hall.room_width != body.room_width or hall.room_depth != body.room_depth or
                             hall.room_height != body.room_height or hall.screen != body.screen):
        raise HTTPException(409, "A published hall with future shows only allows a rename")
    hall.name = body.name.strip()
    hall.room_width, hall.room_depth, hall.room_height = body.room_width, body.room_depth, body.room_height
    hall.screen = body.screen
    hall.updated_at = datetime.utcnow()
    db.commit()
    return HallOut.from_hall(owned_hall(db, hall_id, owner))


@router.delete("/{hall_id}", status_code=204)
def delete_hall(hall_id: int, db: Session = Depends(get_db), owner: User = Depends(owner_user)):
    hall = owned_hall(db, hall_id, owner)
    if hall.status == "published" or db.scalar(select(Show.id).where(Show.hall_id == hall.id)):
        raise HTTPException(409, "A published hall or a hall used by a show cannot be deleted")
    db.delete(hall)
    db.commit()


@router.put("/{hall_id}/layout")
def replace_layout(hall_id: int, body: LayoutIn, db: Session = Depends(get_db), owner: User = Depends(owner_user)):
    hall = owned_hall(db, hall_id, owner)
    future_show_ids = db.scalars(select(Show.id).where(Show.hall_id == hall.id, Show.starts_at > datetime.utcnow())).all() if hall.status == "published" else []
    section_keys = set()
    for section in body.sections:
        key = section.id if section.id is not None else len(section_keys) + 1
        if key in section_keys:
            raise HTTPException(422, "Duplicate section identifier")
        section_keys.add(key)
    designs = {d.id: d for d in db.scalars(select(SeatDesign)).all()}
    occupied = []
    labels = set()
    seat_labels = set()
    for seat in body.seats:
        key = (seat.row_label.upper(), seat.seat_number)
        if key in seat_labels:
            raise HTTPException(422, f"Duplicate seat number {key[0]}{key[1]}")
        seat_labels.add(key)
        if seat.section_id not in section_keys:
            raise HTTPException(422, f"Seat {seat.label} references an unknown section")
        design = designs.get(seat.design_id)
        if not design:
            raise HTTPException(422, f"Seat {seat.label} references an unknown design")
        if abs(seat.x) + design.width / 2 > hall.room_width / 2 or seat.z - design.depth / 2 < 0 or seat.z + design.depth / 2 > hall.room_depth:
            raise HTTPException(422, f"Seat {seat.label} is outside the room bounds")
        angle = seat.rotation_y * pi / 180
        half_w = (abs(cos(angle)) * design.width + abs(sin(angle)) * design.depth) / 2
        half_d = (abs(sin(angle)) * design.width + abs(cos(angle)) * design.depth) / 2
        for other in occupied:
            if abs(seat.x - other[0]) < half_w + other[2] and abs(seat.z - other[1]) < half_d + other[3]:
                raise HTTPException(422, f"Seat {seat.label} overlaps another seat")
        occupied.append((seat.x, seat.z, half_w, half_d))
        labels.add(key)

    if future_show_ids:
        existing_sections = {s.id: s for s in hall.sections}
        existing_seats = {(s.row_label, s.seat_number): s for s in hall.hall_seats}
        if len(existing_sections) != len(body.sections) or len(existing_seats) != len(body.seats):
            raise HTTPException(409, "A published hall with future shows only allows price changes")
        for section in body.sections:
            existing = existing_sections.get(section.id)
            if not existing or existing.name != section.name or existing.color != section.color:
                raise HTTPException(409, "A published hall with future shows only allows price changes")
        for seat in body.seats:
            existing = existing_seats.get((seat.row_label.upper(), seat.seat_number))
            if not existing or (existing.section_id != seat.section_id or existing.design_id != seat.design_id or
                    existing.label != seat.label or existing.x != seat.x or existing.y != seat.y or
                    existing.z != seat.z or existing.rotation_y != seat.rotation_y or
                    existing.colors != seat.colors or existing.is_active != seat.is_active):
                raise HTTPException(409, "A published hall with future shows only allows price changes")
        for section in body.sections:
            existing_sections[section.id].base_price = section.base_price
        db.flush()
        price_rows = db.execute(select(ShowSeat, HallSeat, HallSection, SeatDesign)
            .join(HallSeat, ShowSeat.hall_seat_id == HallSeat.id)
            .join(HallSection, HallSeat.section_id == HallSection.id)
            .join(SeatDesign, HallSeat.design_id == SeatDesign.id)
            .where(ShowSeat.show_id.in_(future_show_ids))).all()
        for show_seat, _, section, design in price_rows:
            show_seat.price = round(section.base_price * design.price_multiplier, 2)
        hall.updated_at = datetime.utcnow()
        db.commit()
        return HallOut.from_hall(owned_hall(db, hall_id, owner))

    with db.begin_nested():
        db.query(HallSeat).filter(HallSeat.hall_id == hall.id).delete()
        db.query(HallSection).filter(HallSection.hall_id == hall.id).delete()
        db.flush()
        section_map = {}
        for index, section in enumerate(body.sections, start=1):
            row = HallSection(hall_id=hall.id, name=section.name, base_price=section.base_price, color=section.color)
            db.add(row)
            db.flush()
            section_map[section.id if section.id is not None else index] = row.id
        for seat in body.seats:
            db.add(HallSeat(hall_id=hall.id, section_id=section_map[seat.section_id], design_id=seat.design_id,
                            row_label=seat.row_label.upper(), seat_number=seat.seat_number, label=seat.label,
                            x=seat.x, y=seat.y, z=seat.z, rotation_y=seat.rotation_y,
                            colors=seat.colors, is_active=seat.is_active))
        hall.updated_at = datetime.utcnow()
    db.commit()
    return HallOut.from_hall(owned_hall(db, hall_id, owner))


@router.post("/{hall_id}/publish")
def publish_hall(hall_id: int, db: Session = Depends(get_db), owner: User = Depends(owner_user)):
    hall = owned_hall(db, hall_id, owner)
    if not hall.sections or not hall.hall_seats:
        raise HTTPException(422, "Add at least one section and one seat before publishing")
    hall.status = "published"
    hall.updated_at = datetime.utcnow()
    db.commit()
    return {"id": hall.id, "status": hall.status}


@router.get("/{hall_id}/export")
def export_hall(hall_id: int, db: Session = Depends(get_db), owner: User = Depends(owner_user)):
    return HallOut.from_hall(owned_hall(db, hall_id, owner)).model_dump()


@router.post("/import", status_code=201)
def import_hall(body: HallImport, db: Session = Depends(get_db), owner: User = Depends(owner_user)):
    hall = Hall(owner_id=owner.id, name=body.name.strip(), room_width=body.room_width,
                room_depth=body.room_depth, room_height=body.room_height, screen=body.screen)
    db.add(hall)
    db.commit()
    db.refresh(hall)
    return replace_layout(hall.id, LayoutIn(sections=body.sections, seats=body.seats), db, owner)
