from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..db import get_db
from ..models import SeatDesign
from ..schemas import DesignOut

router = APIRouter(prefix="/api/seat-designs", tags=["seat designs"])


@router.get("", response_model=list[DesignOut])
def list_designs(db: Session = Depends(get_db)):
    return db.scalars(select(SeatDesign).order_by(SeatDesign.id)).all()
