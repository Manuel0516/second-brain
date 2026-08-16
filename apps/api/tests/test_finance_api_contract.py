from fastapi.routing import APIRoute

from app.dependencies import get_current_user
from app.main import app

EXPECTED_OPERATIONS = {
    ("GET", "/api/finance/summary"),
    ("GET", "/api/finance/timeseries"),
    ("GET", "/api/finance/accounts"),
    ("POST", "/api/finance/accounts"),
    ("GET", "/api/finance/assets"),
    ("POST", "/api/finance/assets"),
    ("POST", "/api/finance/events"),
    ("PATCH", "/api/finance/events/{event_id}"),
    ("GET", "/api/finance/events/{event_id}/lineage"),
    ("GET", "/api/finance/source-connections"),
    ("POST", "/api/finance/source-connections"),
    ("POST", "/api/finance/evidence"),
    ("GET", "/api/finance/evidence"),
    ("GET", "/api/finance/evidence/bundle"),
    ("POST", "/api/finance/imports/preview"),
    ("POST", "/api/finance/imports/{import_id}/commit"),
    ("GET", "/api/finance/imports"),
    ("GET", "/api/finance/imports/{import_id}/raw-records"),
    ("GET", "/api/finance/activity"),
    ("GET", "/api/finance/review-groups"),
    ("GET", "/api/finance/review-queue/counts"),
    ("POST", "/api/finance/review-groups/{group_id}/confirm"),
    ("POST", "/api/finance/review-groups/{group_id}/split"),
    ("POST", "/api/finance/review-groups/{group_id}/defer"),
    ("GET", "/api/finance/reconciliations"),
    ("POST", "/api/finance/reconciliations/run"),
    ("GET", "/api/finance/tax-profiles"),
    ("POST", "/api/finance/tax-profiles"),
    ("GET", "/api/finance/tax-profiles/{profile_id}/residency-facts"),
    ("POST", "/api/finance/tax-profiles/{profile_id}/residency-facts"),
    ("GET", "/api/finance/tax-profiles/{profile_id}/treatments"),
    ("POST", "/api/finance/tax-treatments/{revision_id}/confirm"),
    ("POST", "/api/finance/reports"),
    ("GET", "/api/finance/reports"),
    ("GET", "/api/finance/reports/{report_id}"),
    ("GET", "/api/finance/reports/{report_id}/download"),
}


def test_frozen_finance_operations_are_unique_and_authenticated() -> None:
    routes = [
        route
        for route in app.routes
        if isinstance(route, APIRoute) and route.path.startswith("/api/finance")
    ]
    operations = {
        (method, route.path)
        for route in routes
        for method in route.methods
        if method not in {"HEAD", "OPTIONS"}
    }
    assert operations == EXPECTED_OPERATIONS
    assert len(operations) == sum(len(route.methods - {"HEAD", "OPTIONS"}) for route in routes)
    for route in routes:
        assert any(
            dependency.call is get_current_user for dependency in route.dependant.dependencies
        ), route.path


def test_finance_mutations_require_idempotency_keys() -> None:
    schema = app.openapi()
    for method, path in EXPECTED_OPERATIONS:
        if method not in {"POST", "PATCH"}:
            continue
        parameters = schema["paths"][path][method.lower()].get("parameters", [])
        assert any(
            item.get("in") == "header"
            and item.get("name") == "Idempotency-Key"
            and item.get("required") is True
            for item in parameters
        ), path


def test_finance_openapi_preserves_frozen_boundary_types() -> None:
    schema = app.openapi()
    components = schema["components"]["schemas"]

    assert set(components["FinanceAccountCreate"]["required"]) == {
        "name",
        "institution",
        "account_type",
        "country_code",
        "base_currency",
        "tax_jurisdiction",
        "provider",
        "external_reference",
        "opened_at",
    }
    assert set(components["FinanceAssetCreate"]["required"]) == {
        "asset_type",
        "symbol",
        "name",
        "isin",
        "chain_id",
        "contract_address",
        "issuer_country",
        "decimals",
    }
    assert "confirm_warnings" in components["ImportCommitRequest"]["required"]
    assert set(components["ImportMappingOutput"]["properties"]) == {
        "date_column",
        "time_column",
        "amount_column",
        "quantity_column",
        "asset_column",
        "description_column",
        "external_id_column",
        "event_type_column",
        "timezone",
        "date_format",
        "decimal_separator",
    }
    assert "required" not in components["ImportMappingOutput"]
    assert components["ReportRunResponse"]["properties"]["status"]["enum"] == [
        "ready",
        "ready_with_warnings",
        "blocked",
    ]
    assert components["SummaryTotals"]["properties"]["income"]["pattern"] == (
        r"^-?[0-9]+(\.[0-9]+)?$"
    )
    assert "status" in components["TaxProfileCreate"]["required"]
    assert "determination_status" in components["ResidencyListResponse"]["required"]
    assert set(components["SourceConnectionCreate"]["required"]) == {
        "account_id",
        "provider",
        "credential_reference",
        "permission_scope",
    }
    assert set(components["ResidencyFactCreate"]["required"]) == {
        "fact_type",
        "period_start",
        "period_end",
        "value",
        "evidence_document_ids",
        "source",
        "notes",
    }
    assert "category" in components["ReportCreateRequest"]["properties"]
    assert "row_overrides" in components["ImportCommitRequest"]["properties"]
    assert "excluded_source_indexes" in components["ImportCommitRequest"]["properties"]
    assert components["ManualEventCreate"]["properties"]["amount"]["pattern"] == (
        r"^-?[0-9]+(\.[0-9]+)?$"
    )

    for name, component in components.items():
        properties = component.get("properties", {})
        paged_fields = {"items", "page", "completeness", "empty_state"}
        if paged_fields <= properties.keys():
            assert paged_fields <= set(component.get("required", [])), name


def test_finance_id_paths_are_uuid_formatted() -> None:
    schema = app.openapi()
    for path, path_item in schema["paths"].items():
        if not path.startswith("/api/finance"):
            continue
        for operation in path_item.values():
            if not isinstance(operation, dict):
                continue
            for parameter in operation.get("parameters", []):
                if parameter.get("in") != "path" or parameter["name"] == "tool_name":
                    continue
                assert parameter["schema"].get("format") == "uuid", (
                    path,
                    parameter["name"],
                )
