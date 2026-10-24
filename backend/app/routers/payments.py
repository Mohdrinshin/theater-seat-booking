"""Razorpay Standard Checkout integration and payment settlement."""
from datetime import datetime, timedelta
from decimal import Decimal, ROUND_HALF_UP
import base64
import hashlib
import hmac
import json
import os
import urllib.error
import urllib.request
import secrets

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import select, update
from sqlalchemy.orm import Session

from ..db import get_db
from ..models import HallSeat, PaymentAttempt, Show, ShowSeat
from ..schemas import CheckoutCreate, CheckoutOrderOut, PaymentStatusOut, PaymentVerify

router = APIRouter(prefix="/api", tags=["payments"])
GST_RATE = Decimal("0.18")
HOLD_MINUTES = 15


def _keys() -> tuple[str, str]:
    key_id = os.getenv("RAZORPAY_KEY_ID", "").strip()
    key_secret = os.getenv("RAZORPAY_KEY_SECRET", "").strip()
    if not key_id or not key_secret:
        raise HTTPException(503, "Payments are not configured. Add RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET to backend/.env.")
    return key_id, key_secret


def _razorpay_request(method: str, path: str, payload: dict | None = None) -> dict:
    key_id, key_secret = _keys()
    body = json.dumps(payload).encode() if payload is not None else None
    auth = base64.b64encode(f"{key_id}:{key_secret}".encode()).decode()
    request = urllib.request.Request(
        f"https://api.razorpay.com/v1{path}", data=body, method=method,
        headers={"Authorization": f"Basic {auth}", "Content-Type": "application/json"},
    )
    try:
        with urllib.request.urlopen(request, timeout=15) as response:
            return json.loads(response.read())
    except urllib.error.HTTPError as error:
        detail = error.read().decode(errors="replace")
        raise RuntimeError(f"Razorpay request failed ({error.code}): {detail[:400]}") from error
    except (urllib.error.URLError, TimeoutError, json.JSONDecodeError) as error:
        raise RuntimeError("Could not reach Razorpay. Try again shortly.") from error


def _release_attempt(db: Session, attempt: PaymentAttempt, status: str) -> None:
    db.execute(
        update(ShowSeat)
        .where(ShowSeat.show_id == attempt.show_id, ShowSeat.id.in_(attempt.seat_ids),
               ShowSeat.status == "held", ShowSeat.held_by == attempt.hold_token)
        .values(status="available", held_until=None, held_by=None)
    )
    attempt.status = status


def _settle_captured(db: Session, attempt: PaymentAttempt, payment_id: str) -> bool:
    """Book held seats exactly once. Return false if the hold is no longer valid."""
    if attempt.status == "paid":
        return True
    now = datetime.utcnow()
    rows = db.scalars(
        select(ShowSeat).where(ShowSeat.show_id == attempt.show_id, ShowSeat.id.in_(attempt.seat_ids)).with_for_update()
    ).all()
    if len(rows) != len(attempt.seat_ids) or any(
        row.status != "held" or row.held_by != attempt.hold_token or not row.held_until or row.held_until <= now
        for row in rows
    ):
        attempt.status = "refund_required"
        attempt.razorpay_payment_id = payment_id
        return False
    for row in rows:
        row.status, row.held_until, row.held_by = "booked", None, None
    attempt.status = "paid"
    attempt.razorpay_payment_id = payment_id
    return True


def _payment_matches(attempt: PaymentAttempt, payment: dict) -> bool:
    return (payment.get("order_id") == attempt.razorpay_order_id
            and payment.get("amount") == attempt.amount_paise
            and payment.get("currency") == attempt.currency)


def _refund_payment(payment_id: str) -> bool:
    try:
        _razorpay_request("POST", f"/payments/{payment_id}/refund", {})
        return True
    except RuntimeError:
        return False


@router.post("/shows/{show_id}/checkout", response_model=CheckoutOrderOut, status_code=201)
def create_checkout_order(show_id: int, body: CheckoutCreate, db: Session = Depends(get_db)):
    key_id, _ = _keys()
    show = db.get(Show, show_id)
    if not show or not show.hall_id:
        raise HTTPException(404, "Hall-backed show not found")
    seat_ids = list(dict.fromkeys(body.seat_ids))
    if len(seat_ids) != len(body.seat_ids):
        raise HTTPException(422, "Seat list contains duplicates")

    now = datetime.utcnow()
    db.execute(update(ShowSeat).where(ShowSeat.show_id == show_id, ShowSeat.status == "held", ShowSeat.held_until <= now)
               .values(status="available", held_until=None, held_by=None))
    rows = db.scalars(select(ShowSeat).where(ShowSeat.show_id == show_id, ShowSeat.id.in_(seat_ids)).with_for_update()).all()
    if not rows or len(rows) != len(seat_ids):
        raise HTTPException(400, "Invalid seats")
    if any(row.status != "available" for row in rows):
        raise HTTPException(409, "One or more seats are no longer available")

    token = secrets.token_urlsafe(32)
    expiry = now + timedelta(minutes=HOLD_MINUTES)
    subtotal = sum((Decimal(str(row.price)) for row in rows), Decimal("0.00"))
    total = (subtotal * (Decimal("1") + GST_RATE)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    amount_paise = int(total * 100)
    if amount_paise < 100:
        raise HTTPException(422, "Razorpay requires a minimum payment of ₹1.00")
    for row in rows:
        row.status, row.held_until, row.held_by = "held", expiry, token

    attempt = PaymentAttempt(show_id=show_id, seat_ids=seat_ids, hold_token=token,
                             amount_paise=amount_paise, currency="INR", status="creating")
    db.add(attempt)
    db.flush()
    labels = db.scalars(select(HallSeat.label).join(ShowSeat, ShowSeat.hall_seat_id == HallSeat.id)
                        .where(ShowSeat.id.in_(seat_ids))).all()
    attempt_id = attempt.id
    db.commit()

    try:
        order = _razorpay_request("POST", "/orders", {
            "amount": amount_paise, "currency": "INR", "receipt": f"theater-{attempt_id}",
            "notes": {"payment_attempt_id": str(attempt_id), "show_id": str(show_id)},
        })
        order_id = order.get("id")
        if not order_id or order.get("amount") != amount_paise or order.get("currency") != "INR":
            raise RuntimeError("Razorpay returned an invalid order response")
    except RuntimeError as error:
        failed = db.get(PaymentAttempt, attempt_id)
        if failed:
            _release_attempt(db, failed, "failed")
            db.commit()
        raise HTTPException(502, str(error)) from error

    attempt = db.get(PaymentAttempt, attempt_id)
    attempt.razorpay_order_id = order_id
    attempt.status = "pending"
    db.commit()
    return CheckoutOrderOut(attempt_id=attempt_id, key_id=key_id, order_id=order_id,
                            amount=amount_paise, currency="INR", description=show.movie,
                            movie=show.movie, cinema=show.cinema, seats=labels)


@router.post("/payments/verify", response_model=PaymentStatusOut)
def verify_checkout_payment(body: PaymentVerify, db: Session = Depends(get_db)):
    _, secret = _keys()
    attempt = db.scalar(select(PaymentAttempt).where(PaymentAttempt.id == body.attempt_id).with_for_update())
    if not attempt:
        raise HTTPException(404, "Payment attempt not found")
    if attempt.status == "paid":
        return PaymentStatusOut(attempt_id=attempt.id, status=attempt.status, booked=attempt.seat_ids,
                                amount_paise=attempt.amount_paise, razorpay_payment_id=attempt.razorpay_payment_id)
    if not attempt.razorpay_order_id or not hmac.compare_digest(attempt.razorpay_order_id, body.razorpay_order_id):
        raise HTTPException(400, "Razorpay order does not match this checkout")
    signed_data = f"{attempt.razorpay_order_id}|{body.razorpay_payment_id}".encode()
    expected = hmac.new(secret.encode(), signed_data, hashlib.sha256).hexdigest()
    if not hmac.compare_digest(expected, body.razorpay_signature):
        raise HTTPException(400, "Payment signature verification failed")

    try:
        payment = _razorpay_request("GET", f"/payments/{body.razorpay_payment_id}")
        if not _payment_matches(attempt, payment):
            raise HTTPException(400, "Payment amount or order does not match this booking")
        if payment.get("status") == "authorized":
            payment = _razorpay_request("POST", f"/payments/{body.razorpay_payment_id}/capture",
                                        {"amount": attempt.amount_paise, "currency": attempt.currency})
        status = payment.get("status")
    except RuntimeError as error:
        attempt.razorpay_payment_id = body.razorpay_payment_id
        attempt.status = "pending"
        db.commit()
        raise HTTPException(502, "Payment was received but could not be confirmed yet. Retry confirmation shortly.") from error

    if status == "captured" or payment.get("captured") is True:
        settled = _settle_captured(db, attempt, body.razorpay_payment_id)
        db.commit()
        if not settled:
            refunded = _refund_payment(body.razorpay_payment_id)
            if refunded:
                attempt.status = "refunded"
                db.commit()
            return PaymentStatusOut(attempt_id=attempt.id, status=attempt.status, amount_paise=attempt.amount_paise,
                                    razorpay_payment_id=body.razorpay_payment_id)
        return PaymentStatusOut(attempt_id=attempt.id, status="paid", booked=attempt.seat_ids,
                                amount_paise=attempt.amount_paise, razorpay_payment_id=body.razorpay_payment_id)
    if status == "failed":
        _release_attempt(db, attempt, "failed")
        db.commit()
        return PaymentStatusOut(attempt_id=attempt.id, status="failed", amount_paise=attempt.amount_paise,
                                razorpay_payment_id=body.razorpay_payment_id)
    attempt.status = "pending"
    attempt.razorpay_payment_id = body.razorpay_payment_id
    db.commit()
    return PaymentStatusOut(attempt_id=attempt.id, status="pending", amount_paise=attempt.amount_paise,
                            razorpay_payment_id=body.razorpay_payment_id)


@router.get("/payments/{attempt_id}", response_model=PaymentStatusOut)
def get_payment_status(attempt_id: int, db: Session = Depends(get_db)):
    attempt = db.get(PaymentAttempt, attempt_id)
    if not attempt:
        raise HTTPException(404, "Payment attempt not found")
    return PaymentStatusOut(attempt_id=attempt.id, status=attempt.status,
                            booked=attempt.seat_ids if attempt.status == "paid" else [],
                            amount_paise=attempt.amount_paise, razorpay_payment_id=attempt.razorpay_payment_id)


@router.post("/payments/{attempt_id}/cancel", response_model=PaymentStatusOut)
def cancel_checkout(attempt_id: int, db: Session = Depends(get_db)):
    attempt = db.scalar(select(PaymentAttempt).where(PaymentAttempt.id == attempt_id).with_for_update())
    if not attempt:
        raise HTTPException(404, "Payment attempt not found")
    if attempt.status == "pending" and not attempt.razorpay_payment_id:
        _release_attempt(db, attempt, "cancelled")
        db.commit()
    return PaymentStatusOut(attempt_id=attempt.id, status=attempt.status, amount_paise=attempt.amount_paise,
                            razorpay_payment_id=attempt.razorpay_payment_id)


@router.post("/payments/webhook")
async def razorpay_webhook(request: Request, db: Session = Depends(get_db)):
    webhook_secret = os.getenv("RAZORPAY_WEBHOOK_SECRET", "").strip()
    signature = request.headers.get("x-razorpay-signature", "")
    if not webhook_secret or not signature:
        raise HTTPException(503, "Razorpay webhook is not configured")
    raw_body = await request.body()
    expected = hmac.new(webhook_secret.encode(), raw_body, hashlib.sha256).hexdigest()
    if not hmac.compare_digest(expected, signature):
        raise HTTPException(400, "Invalid webhook signature")
    try:
        event = json.loads(raw_body)
        if event.get("event") != "payment.captured":
            return {"ok": True, "ignored": True}
        payment = event["payload"]["payment"]["entity"]
    except (ValueError, KeyError, TypeError):
        raise HTTPException(400, "Invalid Razorpay webhook payload")
    attempt = db.scalar(select(PaymentAttempt).where(PaymentAttempt.razorpay_order_id == payment.get("order_id")).with_for_update())
    if not attempt:
        return {"ok": True, "ignored": True}
    if not _payment_matches(attempt, payment) or payment.get("status") != "captured":
        raise HTTPException(400, "Captured payment does not match the checkout order")
    if attempt.status == "paid":
        return {"ok": True, "status": "paid"}
    settled = _settle_captured(db, attempt, payment["id"])
    db.commit()
    if not settled:
        refunded = _refund_payment(payment["id"])
        if refunded:
            attempt.status = "refunded"
            db.commit()
    return {"ok": True, "status": attempt.status}
