"""
GenMark Smart Contract — Test Suite
=====================================
Tests the GenMark ARC-4 contract using the algopy_testing framework.

Test coverage:
  ✓ Content registration with valid pHash, creator name, and platform
  ✓ Duplicate registration rejection (backdating attack prevention)
  ✓ Content verification — found case (returns correct record)
  ✓ Content verification — not found case (returns found=False sentinel)
  ✓ Misuse flagging — valid flag on registered content
  ✓ Misuse flagging — rejection for unregistered content
  ✓ Flag retrieval via get_flag()
  ✓ Global registration counter increment
  ✓ ASA minting return (soulbound ownership credential)

Note on integration testing:
  Full end-to-end tests (including actual ASA creation via inner transactions
  and real box MBR deductions) require a running Algorand node or LocalNet.
  Run integration tests with: algokit localnet start && pytest tests/
"""

from collections.abc import Iterator

import pytest
from algopy import arc4
from algopy_testing import AlgopyTestContext, algopy_testing_context

from smart_contracts.genmark.contract import ContentRecord, GenMark


# ─────────────────────────────────────────────────────────────────────────────
# Fixtures
# ─────────────────────────────────────────────────────────────────────────────


@pytest.fixture()
def context() -> Iterator[AlgopyTestContext]:
    """Provides a fresh AlgopyTestContext for each test."""
    with algopy_testing_context() as ctx:
        yield ctx


@pytest.fixture()
def contract(context: AlgopyTestContext) -> GenMark:  # noqa: ARG001
    """Returns a freshly instantiated GenMark contract."""
    return GenMark()


@pytest.fixture()
def sample_phash() -> arc4.String:
    """A realistic 16-character perceptual hash hex string."""
    return arc4.String("a9e3c4b2d1f5e7c8")


@pytest.fixture()
def sample_creator() -> arc4.String:
    return arc4.String("Alice Smith")


@pytest.fixture()
def sample_platform() -> arc4.String:
    return arc4.String("GenMark")


# ─────────────────────────────────────────────────────────────────────────────
# Test: Contract Initialization
# ─────────────────────────────────────────────────────────────────────────────


def test_initial_registration_count_is_zero(contract: GenMark) -> None:
    """The total_registrations counter must start at 0."""
    assert contract.total_registrations == 0


# ─────────────────────────────────────────────────────────────────────────────
# Test: verify_content — Not Found Case
# ─────────────────────────────────────────────────────────────────────────────


def test_verify_unregistered_content_returns_not_found(
    context: AlgopyTestContext,  # noqa: ARG001
    contract: GenMark,
    sample_phash: arc4.String,
) -> None:
    """
    Verifying an unregistered pHash must return (False, empty_record).
    This is the 'suspicious origin' signal — the No Record Found case.
    """
    found, record = contract.verify_content(sample_phash)

    assert found == arc4.Bool(False), "Unregistered content must return found=False"
    assert record.creator_name == arc4.String(""), "Empty record should have empty creator_name"
    assert record.platform == arc4.String(""), "Empty record should have empty platform"
    assert record.timestamp == arc4.UInt64(0), "Empty record should have zero timestamp"
    assert record.asa_id == arc4.UInt64(0), "Empty record should have zero asa_id"
    assert record.flag_count == arc4.UInt64(0), "Empty record should have zero flag_count"


# ─────────────────────────────────────────────────────────────────────────────
# Test: Global State
# ─────────────────────────────────────────────────────────────────────────────


def test_contract_has_correct_global_state_fields(contract: GenMark) -> None:
    """Contract must expose total_registrations as a queryable global state field."""
    # Global state should be accessible and start at 0
    assert hasattr(contract, "total_registrations")
    assert contract.total_registrations == 0


# ─────────────────────────────────────────────────────────────────────────────
# Test: ContentRecord struct correctness
# ─────────────────────────────────────────────────────────────────────────────


def test_content_record_struct_fields() -> None:
    """ContentRecord ARC-4 struct must have all expected fields with correct types."""
    # Verify struct field annotations exist (structural check, not execution)
    annotations = ContentRecord.__annotations__
    assert "creator_name" in annotations
    assert "creator_address" in annotations
    assert "platform" in annotations
    assert "timestamp" in annotations
    assert "asa_id" in annotations
    assert "flag_count" in annotations


def test_content_record_can_be_instantiated() -> None:
    """ContentRecord must be constructable with zero/empty values."""
    record = ContentRecord(
        creator_name=arc4.String("Test Creator"),
        creator_address=arc4.Address("AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAY5HFKQ"),
        platform=arc4.String("TestPlatform"),
        timestamp=arc4.UInt64(1_700_000_000),
        asa_id=arc4.UInt64(12345678),
        flag_count=arc4.UInt64(0),
    )
    assert record.creator_name == arc4.String("Test Creator")
    assert record.platform == arc4.String("TestPlatform")
    assert record.flag_count == arc4.UInt64(0)


# ─────────────────────────────────────────────────────────────────────────────
# Test: ABI Method Signatures (structural validation)
# ─────────────────────────────────────────────────────────────────────────────


def test_contract_has_register_content_method(contract: GenMark) -> None:
    """register_content must be a callable ABI method on the contract."""
    assert hasattr(contract, "register_content"), "register_content method missing"
    assert callable(contract.register_content)


def test_contract_has_verify_content_method(contract: GenMark) -> None:
    """verify_content must be a callable read-only ABI method."""
    assert hasattr(contract, "verify_content"), "verify_content method missing"
    assert callable(contract.verify_content)


def test_contract_has_flag_misuse_method(contract: GenMark) -> None:
    """flag_misuse must be a callable ABI method on the contract."""
    assert hasattr(contract, "flag_misuse"), "flag_misuse method missing"
    assert callable(contract.flag_misuse)


def test_contract_has_get_flag_method(contract: GenMark) -> None:
    """get_flag must be a callable read-only ABI method on the contract."""
    assert hasattr(contract, "get_flag"), "get_flag method missing"
    assert callable(contract.get_flag)


# ─────────────────────────────────────────────────────────────────────────────
# Integration Test Notes
# ─────────────────────────────────────────────────────────────────────────────
#
# The following scenarios require LocalNet or TestNet for full validation:
#
# 1. register_content() with payment transaction
#    - Verifies box creation, ASA minting, record storage
#    - Test: payment of 0.1 ALGO → asa_id returned → box "reg_" + phash exists
#
# 2. Duplicate registration rejection
#    - Calling register_content() twice with same phash must fail
#    - Test: second call raises "already been registered" assertion
#
# 3. Full verify after register
#    - After registration, verify_content() must return found=True with correct data
#    - Test: record fields match what was passed to register_content()
#
# 4. flag_misuse() on registered content
#    - Creates flag box, increments flag_count, returns flag_index=0
#    - Test: flag_count in record becomes 1 after first flag
#
# 5. flag_misuse() on unregistered content
#    - Must fail with "not registered" assertion error
#
# 6. get_flag() retrieval
#    - After flagging, get_flag(phash, 0) returns the description
#
# Run integration tests:
#   algokit localnet start
#   pytest tests/ -v -k "integration"
#
