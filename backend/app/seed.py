"""Seeds one demo show using the layout from the PVR screenshot."""
import os
from datetime import datetime
from sqlalchemy.orm import Session
from .auth import hash_password
from .models import Hall, HallSection, HallSeat, Seat, SeatDesign, Show, ShowSeat, User

CLASSIC_ROWS, PRIME_ROWS = list("ABCDEFG"), list("HJ")   # PVR skips "I"
CLASSIC_PRICE, PRIME_PRICE = 745.76, 889.82
SEATS_PER_ROW = 12

# Seats that are FREE in the screenshot. Everything else in a row is occupied.
FREE = {
    "A": {1, 2, 3, 4},
    "B": set(range(1, 13)),
    "C": set(range(1, 13)),
    "D": {1, 2, 3, 4, 8, 9, 10, 11, 12},
    "E": {1, 2, 3, 4, 5, 8, 9, 10, 11, 12},
    "F": {1, 2, 3},
    "G": set(),
    "H": {5},
    "J": {2, 8, 9, 10},
}


def seed(db: Session) -> None:
    designs = [
        ("classic", "Classic chair", 0.55, 0.60, 1, 1.0, {"cushion": "#b71927", "frame": "#28252a", "accent": "#4b4542"}),
        ("recliner", "Premium recliner", 0.85, 1.10, 1, 1.5, {"cushion": "#8c1520", "frame": "#29262b", "accent": "#b79a6a"}),
        ("couple", "Couple sofa", 1.40, 0.80, 2, 1.8, {"cushion": "#7e1822", "frame": "#28252a", "accent": "#b79a6a"}),
        ("lounger", "Luxury lounger", 1.00, 1.80, 1, 2.0, {"cushion": "#4a2032", "frame": "#242228", "accent": "#b79a6a"}),
        ("accessible", "Wheelchair space", 1.20, 1.40, 1, 1.0, {"cushion": "#385a78", "frame": "#25262a", "accent": "#d5dbe2"}),
    ]
    for key, name, width, depth, capacity, multiplier, colors in designs:
        item = db.query(SeatDesign).filter_by(key=key).first()
        if not item:
            db.add(SeatDesign(key=key, name=name, width=width, depth=depth, capacity=capacity,
                              price_multiplier=multiplier, default_colors=colors))
    if not db.query(Show).count():
        show = Show(movie="Namit Malhotra's Ramayana", cinema="PVR Vegas Dwarka", starts_at=datetime(2026, 11, 5, 17, 45))
        db.add(show)
        db.flush()
        for row in CLASSIC_ROWS + PRIME_ROWS:
            section = "classic" if row in CLASSIC_ROWS else "prime"
            price = CLASSIC_PRICE if section == "classic" else PRIME_PRICE
            for n in range(1, SEATS_PER_ROW + 1):
                status = "available" if n in FREE[row] else "occupied"
                db.add(Seat(show_id=show.id, row=row, number=n, section=section, price=price, status=status))
    db.flush()

    owner = db.query(User).filter_by(email="owner@pvr.local").first()
    if not owner:
        owner = User(email="owner@pvr.local", password_hash=hash_password(os.getenv("DEMO_OWNER_PASSWORD", "PvrDemo2026!")), role="owner")
        db.add(owner)
        db.flush()
    show = db.query(Show).order_by(Show.id).first()
    hall = db.query(Hall).filter_by(name="PVR Vegas", owner_id=owner.id).first()
    if not hall and show:
        hall = Hall(owner_id=owner.id, name="PVR Vegas", status="published", room_width=24,
                    room_depth=30, room_height=12,
                    screen={"width": 16, "height": 7, "curve": 0, "x": 0, "y": 4.2, "z": 0, "aspect": 16 / 7})
        db.add(hall)
        db.flush()
        classic = HallSection(hall_id=hall.id, name="Classic", base_price=CLASSIC_PRICE, color="#b71927")
        prime = HallSection(hall_id=hall.id, name="Prime", base_price=PRIME_PRICE, color="#8c1520")
        db.add_all([classic, prime])
        db.flush()
        design = db.query(SeatDesign).filter_by(key="classic").one()
        for row_index, row in enumerate(CLASSIC_ROWS + PRIME_ROWS):
            is_prime = row in PRIME_ROWS
            section = prime if is_prime else classic
            for number in range(1, SEATS_PER_ROW + 1):
                block, within = divmod(number - 1, 4)
                x = -5.5 + block * 3.9 + within * 0.7
                z = 4 + row_index * 1.15 + (1.2 if is_prime else 0)
                db.add(HallSeat(hall_id=hall.id, section_id=section.id, design_id=design.id,
                                row_label=row, seat_number=number, label=f"{row}{number}",
                                x=x, y=row_index * 0.28, z=z, rotation_y=0,
                                colors=design.default_colors, is_active=True))
        db.flush()
        show.hall_id = hall.id
    if hall and show:
        show.hall_id = hall.id
        if not db.query(ShowSeat).filter_by(show_id=show.id).count():
            legacy = {(s.row, s.number): s for s in db.query(Seat).filter_by(show_id=show.id).all()}
            sections = {s.id: s for s in db.query(HallSection).filter_by(hall_id=hall.id).all()}
            designs_by_id = {d.id: d for d in db.query(SeatDesign).all()}
            for hall_seat in db.query(HallSeat).filter_by(hall_id=hall.id, is_active=True).all():
                old = legacy.get((hall_seat.row_label, hall_seat.seat_number))
                section = sections[hall_seat.section_id]
                design = designs_by_id[hall_seat.design_id]
                db.add(ShowSeat(show_id=show.id, hall_seat_id=hall_seat.id,
                                price=old.price if old else round(section.base_price * design.price_multiplier, 2),
                                status="booked" if old and old.status == "occupied" else "available"))
    db.commit()
