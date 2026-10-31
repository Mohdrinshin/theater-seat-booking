"""Seeds one demo show using the layout from the PVR screenshot."""
import os
from datetime import datetime
from sqlalchemy.orm import Session
from .auth import hash_password
from .models import Hall, HallSection, HallSeat, PaymentAttempt, RoomTheme, Seat, SeatDesign, Show, ShowSeat, User

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
        ("classic", "Classic Cinema Chair", .600, .668, .668, 1, 1.0, "Standard", "fabric", {"uph": "#5c1520", "frame": "#1b1b1d", "metal": "steel"}),
        ("recliner", "Premium Recliner", .930, 1.079, 1.515, 1, 1.6, "Prime", "leather", {"uph": "#8a4a23", "frame": "#3a3c40", "metal": "chrome"}),
        ("couple", "Couple Loveseat", 1.380, 1.009, 1.009, 2, 2.4, "Prime", "leather", {"uph": "#4a1418", "frame": "#1b1b1d", "metal": "steel"}),
        ("vip", "VIP Luxury Recliner", 1.000, 1.285, 1.774, 1, 2.2, "Luxe", "leather", {"uph": "#2d2d30", "frame": "#1b1b1d", "metal": "brass"}),
        ("modern", "Modern Fabric Seat", .570, .640, .640, 1, 1.1, "Standard+", "fabric", {"uph": "#6f7d6a", "frame": "#3a3c40", "metal": "steel"}),
        ("pod", "Private Pod Suite", 1.234, .937, .937, 1, 3.0, "Luxe", "leather", {"uph": "#d8cfc0", "frame": "#4a3a2c", "metal": "brass"}),
    ]
    for key, name, width, depth_closed, depth_open, capacity, multiplier, tier, upholstery, colors in designs:
        item = db.query(SeatDesign).filter_by(key=key).first()
        if not item:
            item = SeatDesign(key=key)
            db.add(item)
        item.name, item.width, item.depth = name, width, depth_closed
        item.depth_closed, item.depth_open = depth_closed, depth_open
        item.capacity, item.price_multiplier = capacity, multiplier
        item.tier, item.upholstery, item.default_colors = tier, upholstery, colors

    themes = [
        ("multiplex", "Classic Multiplex", "classic", {"layout": {"rows": 10, "sec": [4, 10, 4], "aisle": 1.2, "side": 1.1, "pitch": 1.2, "riser": .38, "front": 4.5, "back": 2.2, "minW": 14, "H": 8, "fill": .78, "aspect": 2.39, "stage": .6}, "palette": {"wall": "#1d1e23", "feature": "#2b2e38", "carpet": "#25272f"}, "style": "panels", "lights": ["sconces", "downlights", "step-lights"], "defaultFinish": {"uph": "#5c1520", "frame": "#1b1b1d", "metal": "steel"}}),
        ("luxury", "Premium Luxury Auditorium", "recliner", {"layout": {"rows": 7, "sec": [3, 7, 3], "aisle": 1.3, "side": 1.2, "pitch": 1.8, "riser": .45, "front": 4.5, "back": 2, "minW": 16, "H": 7.5, "fill": .8, "aspect": 2.39, "stage": .5}, "palette": {"wall": "#3b2618", "feature": "#5b3a24", "carpet": "#3a2a20", "curtain": "#cbb79a"}, "style": "walnut", "lights": ["cove", "coffers", "step-lights"], "defaultFinish": {"uph": "#8a4a23", "frame": "#3a3c40", "metal": "chrome"}}),
        ("largeformat", "Large-Format Theatre", "classic", {"layout": {"rows": 11, "sec": [4, 12, 4], "aisle": 1.2, "side": 1.2, "pitch": 1.2, "riser": .55, "front": 5, "back": 2, "minW": 18, "H": 12, "fill": .95, "aspect": 1.9, "stage": .3}, "palette": {"wall": "#0e0e10", "feature": "#18181b", "carpet": "#1a1b1f"}, "style": "flutes", "lights": ["acoustic-clouds", "step-lights"], "defaultFinish": {"uph": "#2d2d30", "frame": "#1b1b1d", "metal": "chrome"}}),
        ("immersive", "Immersive Sound Cinema", "vip", {"layout": {"rows": 8, "sec": [3, 8, 3], "aisle": 1.3, "side": 1.3, "pitch": 2.3, "riser": .45, "front": 5, "back": 2, "minW": 18, "H": 9, "fill": .88, "aspect": 2.39, "stage": .4}, "palette": {"wall": "#141416", "feature": "#1f2024", "carpet": "#16171a"}, "style": "hpanels", "lights": ["speaker-arrays", "floor-led", "step-lights"], "defaultFinish": {"uph": "#2d2d30", "frame": "#1b1b1d", "metal": "brass"}}),
        ("vip", "VIP Private Screening Room", "pod", {"layout": {"rows": 3, "sec": [4], "aisle": 1.2, "side": 1.3, "pitch": 2, "riser": .4, "front": 3.5, "back": 1.6, "minW": 8.5, "H": 4.5, "fill": .78, "aspect": 2.39, "stage": .3}, "palette": {"wall": "#cfc4b2", "feature": "#5b3a24", "carpet": "#1f3a3c", "curtain": "#6a1420"}, "style": "wainscot", "lights": ["brass-sconces", "tray-cove", "step-lights"], "defaultFinish": {"uph": "#d8cfc0", "frame": "#4a3a2c", "metal": "brass"}}),
        ("boutique", "Modern Boutique Cinema", "modern", {"layout": {"rows": 8, "sec": [3, 7, 3], "aisle": 1.15, "side": 1.1, "pitch": 1.15, "riser": .35, "front": 4, "back": 1.8, "minW": 12, "H": 6.5, "fill": .8, "aspect": 2.39, "stage": .45}, "palette": {"wall": "#2a2b2e", "feature": "#a77c52", "carpet": "#2c2e30"}, "style": "battens", "lights": ["linear-pendants", "step-lights"], "defaultFinish": {"uph": "#6f7d6a", "frame": "#3a3c40", "metal": "steel", "wood": "#a77c52"}}),
    ]
    for key, name, default_seat, config in themes:
        theme = db.query(RoomTheme).filter_by(key=key).first()
        if not theme:
            theme = RoomTheme(key=key)
            db.add(theme)
        theme.name, theme.default_seat, theme.config = name, default_seat, config
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
        hall.room_theme = hall.room_theme or "multiplex"
        hall.theme_options = hall.theme_options or {"accent": True, "accentColor": "#ffb35a", "accentLevel": 0.35,
                                                    "shadows": True, "haze": False, "dust": False, "quality": "high"}
        show.hall_id = hall.id
        legacy = {(s.row, s.number): s for s in db.query(Seat).filter_by(show_id=show.id).all()}
        show_seats = db.query(ShowSeat).filter_by(show_id=show.id).all()
        if not show_seats:
            sections = {s.id: s for s in db.query(HallSection).filter_by(hall_id=hall.id).all()}
            designs_by_id = {d.id: d for d in db.query(SeatDesign).all()}
            for hall_seat in db.query(HallSeat).filter_by(hall_id=hall.id, is_active=True).all():
                old = legacy.get((hall_seat.row_label, hall_seat.seat_number))
                section = sections[hall_seat.section_id]
                design = designs_by_id[hall_seat.design_id]
                db.add(ShowSeat(show_id=show.id, hall_seat_id=hall_seat.id,
                                price=old.price if old else round(section.base_price * design.price_multiplier, 2),
                                status="booked" if old and old.status == "occupied" else "available"))
        elif not db.query(PaymentAttempt).filter_by(show_id=show.id).count():
            # The demo hall was migrated from legacy seats. Keep its initial seat
            # availability in sync until it has payment history; never reset seats
            # for a show that may contain completed bookings.
            hall_seats = {seat.id: seat for seat in db.query(HallSeat).filter_by(hall_id=hall.id).all()}
            for show_seat in show_seats:
                hall_seat = hall_seats.get(show_seat.hall_seat_id)
                old = legacy.get((hall_seat.row_label, hall_seat.seat_number)) if hall_seat else None
                if old:
                    show_seat.status = "booked" if old.status == "occupied" else "available"
                    show_seat.held_until = None
                    show_seat.held_by = None
    db.commit()
