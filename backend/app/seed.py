"""Seeds one demo show using the layout from the PVR screenshot."""
from datetime import datetime
from sqlalchemy.orm import Session
from .models import Seat, Show

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
    if db.query(Show).count():
        return
    show = Show(
        movie="Namit Malhotra's Ramayana",
        cinema="PVR Vegas Dwarka",
        starts_at=datetime(2026, 11, 5, 17, 45),
    )
    db.add(show)
    db.flush()
    for row in CLASSIC_ROWS + PRIME_ROWS:
        section = "classic" if row in CLASSIC_ROWS else "prime"
        price = CLASSIC_PRICE if section == "classic" else PRIME_PRICE
        for n in range(1, SEATS_PER_ROW + 1):
            status = "available" if n in FREE[row] else "occupied"
            db.add(Seat(show_id=show.id, row=row, number=n,
                        section=section, price=price, status=status))
    db.commit()
