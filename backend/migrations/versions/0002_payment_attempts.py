"""Persist Razorpay checkout attempts and booking settlement state."""
from alembic import op
import sqlalchemy as sa


revision = "0002_payment_attempts"
down_revision = "0001_hall_builder"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "payment_attempts",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("show_id", sa.Integer(), sa.ForeignKey("shows.id", ondelete="CASCADE"), nullable=False),
        sa.Column("razorpay_order_id", sa.String(length=64), nullable=True),
        sa.Column("razorpay_payment_id", sa.String(length=64), nullable=True),
        sa.Column("seat_ids", sa.JSON(), nullable=False),
        sa.Column("hold_token", sa.String(length=64), nullable=False),
        sa.Column("amount_paise", sa.Integer(), nullable=False),
        sa.Column("currency", sa.String(length=3), nullable=False, server_default="INR"),
        sa.Column("status", sa.String(length=24), nullable=False, server_default="creating"),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.UniqueConstraint("razorpay_order_id"),
        sa.UniqueConstraint("razorpay_payment_id"),
    )
    op.create_index("ix_payment_attempts_show_id", "payment_attempts", ["show_id"])
    op.create_index("ix_payment_attempts_status", "payment_attempts", ["status"])


def downgrade():
    op.drop_index("ix_payment_attempts_status", table_name="payment_attempts")
    op.drop_index("ix_payment_attempts_show_id", table_name="payment_attempts")
    op.drop_table("payment_attempts")
