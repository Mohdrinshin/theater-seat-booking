from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..db import get_db
from ..models import RoomTheme, SeatDesign
from ..schemas import DesignOut, RoomThemeOut

router = APIRouter(prefix="/api/seat-designs", tags=["seat designs"])


@router.get("", response_model=list[DesignOut])
def list_designs(db: Session = Depends(get_db)):
    return db.scalars(select(SeatDesign).where(SeatDesign.key.in_(["classic", "recliner", "couple", "vip", "modern", "pod"]))
                      .order_by(SeatDesign.id)).all()


room_router = APIRouter(prefix="/api/room-themes", tags=["room themes"])


@room_router.get("", response_model=list[RoomThemeOut])
def list_room_themes(db: Session = Depends(get_db)):
    return db.scalars(select(RoomTheme).order_by(RoomTheme.id)).all()
