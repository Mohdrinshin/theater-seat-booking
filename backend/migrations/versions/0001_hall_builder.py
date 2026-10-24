"""Create hall-builder resources and upgrade the starter schema."""
from alembic import op
from sqlalchemy import Boolean, Column, DateTime, Float, ForeignKey, Integer, JSON, Numeric, String, UniqueConstraint, inspect

revision = "0001_hall_builder"
down_revision = None
branch_labels = None
depends_on = None


def upgrade():
    bind = op.get_bind()
    inspector = inspect(bind)
    tables = set(inspector.get_table_names())
    if "shows" not in tables:
        op.create_table("shows", Column("id", Integer, primary_key=True), Column("movie", String(200), nullable=False),
                        Column("cinema", String(200), nullable=False), Column("starts_at", DateTime, nullable=False),
                        Column("hall_id", Integer, nullable=True))
    elif "hall_id" not in {c["name"] for c in inspector.get_columns("shows")}:
        op.add_column("shows", Column("hall_id", Integer(), nullable=True))
    if "seats" not in tables:
        op.create_table("seats", Column("id", Integer, primary_key=True),
                        Column("show_id", Integer, ForeignKey("shows.id"), nullable=False),
                        Column("row", String(2), nullable=False), Column("number", Integer, nullable=False),
                        Column("section", String(20), nullable=False), Column("price", Numeric(10, 2), nullable=False),
                        Column("status", String(12), nullable=False, server_default="available"),
                        UniqueConstraint("show_id", "row", "number"))
        op.create_index("ix_seats_show_id", "seats", ["show_id"])
    if "users" not in tables:
        op.create_table("users", Column("id", Integer, primary_key=True), Column("email", String(320), nullable=False),
                        Column("password_hash", String(256), nullable=False), Column("role", String(16), nullable=False))
        op.create_index("ix_users_email", "users", ["email"], unique=True)
    if "seat_designs" not in tables:
        op.create_table("seat_designs", Column("id", Integer, primary_key=True), Column("key", String(32), nullable=False),
                        Column("name", String(100), nullable=False), Column("width", Float, nullable=False),
                        Column("depth", Float, nullable=False), Column("capacity", Integer, nullable=False),
                        Column("price_multiplier", Float, nullable=False), Column("default_colors", JSON, nullable=False))
        op.create_index("ix_seat_designs_key", "seat_designs", ["key"], unique=True)
    if "halls" not in tables:
        op.create_table("halls", Column("id", Integer, primary_key=True), Column("owner_id", Integer, ForeignKey("users.id"), nullable=False),
                        Column("name", String(160), nullable=False), Column("status", String(16), nullable=False),
                        Column("room_width", Float, nullable=False), Column("room_depth", Float, nullable=False),
                        Column("room_height", Float, nullable=False), Column("screen", JSON, nullable=False),
                        Column("created_at", DateTime, nullable=False), Column("updated_at", DateTime, nullable=False))
        op.create_index("ix_halls_owner_id", "halls", ["owner_id"])
    inspector = inspect(bind)
    if not any("hall_id" in fk.get("constrained_columns", []) for fk in inspector.get_foreign_keys("shows")):
        op.create_foreign_key("fk_shows_hall_id_halls", "shows", "halls", ["hall_id"], ["id"])
    if not any(index.get("name") == "ix_shows_hall_id" for index in inspect(bind).get_indexes("shows")):
        op.create_index("ix_shows_hall_id", "shows", ["hall_id"])
    if "hall_sections" not in tables:
        op.create_table("hall_sections", Column("id", Integer, primary_key=True),
                        Column("hall_id", Integer, ForeignKey("halls.id", ondelete="CASCADE"), nullable=False),
                        Column("name", String(80), nullable=False), Column("base_price", Float, nullable=False),
                        Column("color", String(16), nullable=False))
        op.create_index("ix_hall_sections_hall_id", "hall_sections", ["hall_id"])
    if "hall_seats" not in tables:
        op.create_table("hall_seats", Column("id", Integer, primary_key=True),
                        Column("hall_id", Integer, ForeignKey("halls.id", ondelete="CASCADE"), nullable=False),
                        Column("section_id", Integer, ForeignKey("hall_sections.id", ondelete="CASCADE"), nullable=False),
                        Column("design_id", Integer, ForeignKey("seat_designs.id"), nullable=False),
                        Column("row_label", String(8), nullable=False), Column("seat_number", Integer, nullable=False),
                        Column("label", String(32), nullable=False), Column("x", Float, nullable=False),
                        Column("y", Float, nullable=False), Column("z", Float, nullable=False),
                        Column("rotation_y", Float, nullable=False), Column("colors", JSON, nullable=False),
                        Column("is_active", Boolean, nullable=False), UniqueConstraint("hall_id", "row_label", "seat_number"))
        op.create_index("ix_hall_seats_hall_id", "hall_seats", ["hall_id"])
    if "show_seats" not in tables:
        op.create_table("show_seats", Column("id", Integer, primary_key=True),
                        Column("show_id", Integer, ForeignKey("shows.id", ondelete="CASCADE"), nullable=False),
                        Column("hall_seat_id", Integer, ForeignKey("hall_seats.id"), nullable=False),
                        Column("price", Numeric(10, 2), nullable=False), Column("status", String(12), nullable=False),
                        Column("held_until", DateTime, nullable=True), Column("held_by", String(64), nullable=True),
                        UniqueConstraint("show_id", "hall_seat_id"))
        op.create_index("ix_show_seats_show_id", "show_seats", ["show_id"])


def downgrade():
    bind = op.get_bind()
    inspector = inspect(bind)
    if "shows" in inspector.get_table_names():
        if any("hall_id" in fk.get("constrained_columns", []) for fk in inspect(bind).get_foreign_keys("shows")):
            op.drop_constraint("fk_shows_hall_id_halls", "shows", type_="foreignkey")
    for table in ("show_seats", "hall_seats", "hall_sections", "seat_designs", "halls", "users", "seats"):
        if table in inspector.get_table_names():
            op.drop_table(table)
    if "shows" in inspector.get_table_names():
        if "hall_id" in {c["name"] for c in inspect(bind).get_columns("shows")}:
            op.drop_column("shows", "hall_id")
