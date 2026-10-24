"""Add data-driven cinema seat specifications and room themes."""
from alembic import op
import sqlalchemy as sa

revision = "0003_cinema_designs"
down_revision = "0002_payment_attempts"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("seat_designs", sa.Column("depth_closed", sa.Float(), nullable=True))
    op.add_column("seat_designs", sa.Column("depth_open", sa.Float(), nullable=True))
    op.add_column("seat_designs", sa.Column("tier", sa.String(32), nullable=False, server_default="Standard"))
    op.add_column("seat_designs", sa.Column("upholstery", sa.String(16), nullable=False, server_default="fabric"))
    op.execute("UPDATE seat_designs SET depth_closed=depth, depth_open=depth")
    op.alter_column("seat_designs", "depth_closed", nullable=False)
    op.alter_column("seat_designs", "depth_open", nullable=False)
    op.create_table(
        "room_themes",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("key", sa.String(32), nullable=False, unique=True),
        sa.Column("name", sa.String(100), nullable=False),
        sa.Column("default_seat", sa.String(32), nullable=False),
        sa.Column("config", sa.JSON(), nullable=False),
    )
    op.create_index("ix_room_themes_key", "room_themes", ["key"], unique=True)
    op.add_column("halls", sa.Column("room_theme", sa.String(32), nullable=False, server_default="multiplex"))
    op.add_column("halls", sa.Column("theme_options", sa.JSON(), nullable=False, server_default="{}"))


def downgrade():
    op.drop_column("halls", "theme_options")
    op.drop_column("halls", "room_theme")
    op.drop_index("ix_room_themes_key", table_name="room_themes")
    op.drop_table("room_themes")
    op.drop_column("seat_designs", "upholstery")
    op.drop_column("seat_designs", "tier")
    op.drop_column("seat_designs", "depth_open")
    op.drop_column("seat_designs", "depth_closed")
