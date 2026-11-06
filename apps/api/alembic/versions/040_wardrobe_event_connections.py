"""Replace wardrobe URL shortcuts with native event connections.

Revision ID: 040
Revises: 039
"""

from alembic import op

revision = "040"
down_revision = "039"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
        UPDATE calendar_events AS event
        SET link = NULL,
            connections = (COALESCE(event.connections::jsonb, '{}'::jsonb) ||
                jsonb_build_object('wardrobe',
                    jsonb_build_object('outfit_id', edge.target_id::text)))::json
        FROM links AS edge
        WHERE edge.source_type = 'event' AND edge.target_type = 'wardrobe_outfit'
            AND edge.source_id = event.id
            AND event.link = '/wardrobe?tab=outfits&outfit=' || edge.target_id::text
    """)
    op.execute("""
        DELETE FROM links AS old USING links AS native
        WHERE old.source_type = 'event' AND old.target_type = 'wardrobe_outfit'
            AND old.relation = 'outfit' AND native.relation = 'logged_from'
            AND native.source_type = old.source_type AND native.source_id = old.source_id
            AND native.target_type = old.target_type AND native.target_id = old.target_id
    """)
    op.execute(
        "UPDATE links SET relation = 'logged_from' WHERE source_type = 'event' "
        "AND target_type = 'wardrobe_outfit' AND relation = 'outfit'"
    )


def downgrade() -> None:
    # Data-only normalization: preserve native graph edges and never recreate stale URLs.
    pass
