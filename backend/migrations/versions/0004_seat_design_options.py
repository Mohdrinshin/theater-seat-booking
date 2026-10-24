"""Persist seat mechanism options with hall layouts."""
from alembic import op
import sqlalchemy as sa

revision = "0004_seat_design_options"
down_revision = "0003_cinema_designs"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("hall_seats", sa.Column("design_options", sa.JSON(), nullable=False, server_default="{}"))


def downgrade():
    op.drop_column("hall_seats", "design_options")
