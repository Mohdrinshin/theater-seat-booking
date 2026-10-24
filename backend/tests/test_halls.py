import os
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta
from uuid import uuid4

import pytest
from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

from backend.app.db import Base
from backend.app.models import Hall, HallSeat, HallSection, SeatDesign, Show, ShowSeat, User
from backend.app.routers.halls import owned_hall, replace_layout
from backend.app.routers.shows import book
from backend.app.schemas import BookRequest, HallSeatIn, LayoutIn, SectionIn
from backend.app.seed import seed


@pytest.fixture
def db():
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(engine)
    with Session(engine, expire_on_commit=False) as session:
        yield session
    Base.metadata.drop_all(engine)
    engine.dispose()


def setup_hall(db, suffix=""):
    suffix = suffix or str(uuid4())
    owner = User(email=f"owner-{suffix}@test.local", password_hash="unused", role="owner")
    stranger = User(email=f"stranger-{suffix}@test.local", password_hash="unused", role="owner")
    design = SeatDesign(key="classic", name="Classic", width=0.55, depth=0.6, capacity=1,
                        price_multiplier=1, default_colors={})
    db.add_all([owner, stranger, design])
    db.flush()
    hall = Hall(owner_id=owner.id, name="Test Hall", status="draft", room_width=12,
                room_depth=20, room_height=8, screen={"width": 8, "height": 4})
    db.add(hall)
    db.commit()
    return owner, stranger, design, hall


def test_owner_only_hall_access(db):
    owner, stranger, _, hall = setup_hall(db)
    assert owned_hall(db, hall.id, owner).id == hall.id
    with pytest.raises(HTTPException) as error:
        owned_hall(db, hall.id, stranger)
    assert error.value.status_code == 403


def test_default_seed_links_all_hall_seats_to_the_demo_show(db):
    seed(db)
    show = db.query(Show).one()
    assert show.hall_id is not None
    assert db.query(HallSeat).filter_by(hall_id=show.hall_id).count() == 108
    assert db.query(ShowSeat).filter_by(show_id=show.id).count() == 108


def test_layout_rejects_duplicate_seat_labels(db):
    owner, _, design, hall = setup_hall(db)
    body = LayoutIn(sections=[SectionIn(name="Classic", base_price=10)], seats=[
        HallSeatIn(section_id=1, design_id=design.id, row_label="A", seat_number=1, label="A1", x=-1, z=5),
        HallSeatIn(section_id=1, design_id=design.id, row_label="A", seat_number=1, label="A1 copy", x=1, z=8),
    ])
    with pytest.raises(HTTPException) as error:
        replace_layout(hall.id, body, db, owner)
    assert error.value.status_code == 422
    assert "Duplicate seat number" in error.value.detail


def test_layout_rejects_overlapping_footprints(db):
    owner, _, design, hall = setup_hall(db)
    body = LayoutIn(sections=[SectionIn(name="Classic", base_price=10)], seats=[
        HallSeatIn(section_id=1, design_id=design.id, row_label="A", seat_number=1, label="A1", x=0, z=5),
        HallSeatIn(section_id=1, design_id=design.id, row_label="A", seat_number=2, label="A2", x=0.2, z=5),
    ])
    with pytest.raises(HTTPException) as error:
        replace_layout(hall.id, body, db, owner)
    assert error.value.status_code == 422
    assert "overlaps" in error.value.detail


@pytest.mark.skipif(not os.getenv("TEST_DATABASE_URL"), reason="Set TEST_DATABASE_URL to a disposable PostgreSQL database")
def test_two_concurrent_bookings_cannot_take_same_seat():
    """Integration check for PostgreSQL SELECT FOR UPDATE behavior."""
    from sqlalchemy import create_engine
    from sqlalchemy.orm import sessionmaker
    engine = create_engine(os.environ["TEST_DATABASE_URL"], pool_size=4)
    factory = sessionmaker(engine, expire_on_commit=False)
    # The database must already be migrated. Use unique labels to avoid changing
    # any existing demo records; the test only removes its own rows afterward.
    with factory() as db:
        owner, stranger, design, hall = setup_hall(db)
        section = HallSection(hall_id=hall.id, name="Race", base_price=10, color="#333333")
        db.add(section)
        db.flush()
        seat = HallSeat(hall_id=hall.id, section_id=section.id, design_id=design.id, row_label="RACE",
                        seat_number=1, label="RACE1", x=0, y=0, z=5, rotation_y=0, colors={}, is_active=True)
        db.add(seat)
        show = Show(movie="Race", cinema=hall.name, starts_at=datetime.utcnow(), hall_id=hall.id)
        db.add(show)
        db.flush()
        show_seat = ShowSeat(show_id=show.id, hall_seat_id=seat.id, price=10, status="held",
                             held_by="same-token", held_until=datetime.utcnow() + timedelta(minutes=5))
        db.add(show_seat)
        db.commit()
        show_id, show_seat_id = show.id, show_seat.id

    def attempt():
        with factory() as session:
            try:
                return book(show_id, BookRequest(seat_ids=[show_seat_id], hold_token="same-token"), session).booked
            except HTTPException as error:
                return error.status_code

    with ThreadPoolExecutor(max_workers=2) as pool:
        results = list(pool.map(lambda _: attempt(), range(2)))
    assert sum(isinstance(result, list) for result in results) == 1
    assert 409 in results
    with factory.begin() as db:
        db.query(ShowSeat).filter(ShowSeat.id == show_seat_id).delete()
        db.query(Show).filter(Show.id == show_id).delete()
        db.query(HallSeat).filter(HallSeat.label == "RACE1").delete()
        hall_id = db.query(Hall).filter(Hall.name == "Test Hall", Hall.owner_id == owner.id).scalar_subquery()
        db.query(HallSection).filter(HallSection.hall_id == hall_id).delete(synchronize_session=False)
        db.query(Hall).filter(Hall.id == hall_id).delete(synchronize_session=False)
        db.query(User).filter(User.id == owner.id).delete()
        db.query(User).filter(User.id == stranger.id).delete()
    engine.dispose()
