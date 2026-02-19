"""
GenMark — Algorand Blockchain Interaction Module
=================================================
Handles all smart contract calls using raw algosdk AtomicTransactionComposer.

Design: The backend is the ONLY component that touches the blockchain.
The frontend never calls Algorand directly — it sends HTTP requests to this
FastAPI backend, which holds the deployer credentials and App ID.

ABI method signatures (derived from the GenMark contract definition):
  register_content(string,string,string,pay)uint64
  verify_content(string)(bool,(string,address,string,uint64,uint64,uint64))
  flag_misuse(string,string,pay)uint64
  get_flag(string,uint64)string

ContentRecord struct ABI type: (string,address,string,uint64,uint64,uint64)
  Index 0: creator_name    (string)
  Index 1: creator_address (address → 32 bytes, encode as base32 Algorand address)
  Index 2: platform        (string)
  Index 3: timestamp       (uint64, Unix seconds)
  Index 4: asa_id          (uint64)
  Index 5: flag_count      (uint64)
"""

import logging
import os
from datetime import datetime, timezone

import algosdk
from algosdk import abi, mnemonic as mn
from algosdk.atomic_transaction_composer import (
    AccountTransactionSigner,
    AtomicTransactionComposer,
    TransactionWithSigner,
)
from algosdk.transaction import PaymentTxn
from algosdk.v2client import algod

logger = logging.getLogger(__name__)

# ─────────────────────────────────────────────────────────────────────────────
# ABI Method Definitions
# Defined once at module load — these correspond exactly to the Puya contract
# ─────────────────────────────────────────────────────────────────────────────

# ContentRecord tuple type for decoding verify_content return value
CONTENT_RECORD_TYPE = "(string,address,string,uint64,uint64,uint64)"

REGISTER_METHOD = abi.Method.from_signature(
    f"register_content(string,string,string,pay)uint64"
)

VERIFY_METHOD = abi.Method.from_signature(
    f"verify_content(string)(bool,{CONTENT_RECORD_TYPE})"
)

FLAG_METHOD = abi.Method.from_signature(
    f"flag_misuse(string,string,pay)uint64"
)

GET_FLAG_METHOD = abi.Method.from_signature(
    "get_flag(string,uint64)string"
)


# ─────────────────────────────────────────────────────────────────────────────
# Client Initialization
# ─────────────────────────────────────────────────────────────────────────────


def get_algod_client() -> algod.AlgodClient:
    """Create and return an AlgodClient connected to the configured network."""
    server = os.getenv("ALGORAND_ALGOD_SERVER", "https://testnet-api.algonode.cloud")
    port = os.getenv("ALGORAND_ALGOD_PORT", "")
    token = os.getenv(
        "ALGORAND_ALGOD_TOKEN",
        "a" * 64,  # AlgoNode public endpoint uses empty or any token
    )
    url = f"{server}:{port}" if port else server
    return algod.AlgodClient(token, url)


def get_deployer_credentials() -> tuple[str, str]:
    """
    Load the deployer's private key and address from environment.

    Returns:
        (private_key, address) tuple

    Raises:
        ValueError: If DEPLOYER_MNEMONIC is not set in environment.
    """
    mnemonic_phrase = os.getenv("DEPLOYER_MNEMONIC")
    if not mnemonic_phrase:
        raise ValueError(
            "DEPLOYER_MNEMONIC environment variable is not set. "
            "Run: algokit generate account and copy the mnemonic to .env"
        )
    private_key = mn.to_private_key(mnemonic_phrase)
    address = algosdk.account.address_from_private_key(private_key)
    return private_key, address


def get_app_id() -> int:
    """Load the deployed GenMark App ID from environment."""
    app_id_str = os.getenv("ALGORAND_APP_ID", "0")
    app_id = int(app_id_str)
    if app_id == 0:
        raise ValueError(
            "ALGORAND_APP_ID is not set. Deploy the contract first with: "
            "algokit project deploy testnet"
        )
    return app_id


def get_app_address(app_id: int) -> str:
    """Compute the deterministic contract escrow address from the App ID."""
    return algosdk.logic.get_application_address(app_id)


# ─────────────────────────────────────────────────────────────────────────────
# Blockchain Operations
# ─────────────────────────────────────────────────────────────────────────────


def register_content_on_chain(
    phash: str,
    creator_name: str,
    platform: str,
) -> dict:
    """
    Register a new content item on the GenMark smart contract.

    Builds an atomic transaction group with:
      [0] PaymentTxn  → contract address (covers box MBR + ASA creation fee)
      [1] ApplicationCallTxn → register_content() ABI method call

    The outer transaction pays 2x min_fee to cover the inner ASA creation itxn.

    Args:
        phash        : 16-char perceptual hash hex string
        creator_name : Display name of the creator
        platform     : Platform name (e.g., "GenMark")

    Returns:
        dict with keys: tx_id, asa_id, app_id, phash
    """
    algod_client = get_algod_client()
    private_key, address = get_deployer_credentials()
    app_id = get_app_id()
    app_address = get_app_address(app_id)
    signer = AccountTransactionSigner(private_key)

    sp = algod_client.suggested_params()
    # The outer method call needs fee = 2 * min_fee to cover the inner ASA creation.
    # AtomicTransactionComposer handles fee calculation when flat_fee=True.
    sp_with_extra_fee = algod_client.suggested_params()
    sp_with_extra_fee.flat_fee = True
    sp_with_extra_fee.fee = 2 * 1000  # 2x min fee for outer txn + 1 inner txn

    # Build payment transaction (covers box MBR + ASA creation)
    # 0.1 ALGO = 100,000 microAlgos (conservative estimate for box costs)
    pay_txn = PaymentTxn(
        sender=address,
        sp=algod_client.suggested_params(),
        receiver=app_address,
        amt=100_000,  # 0.1 ALGO
    )

    atc = AtomicTransactionComposer()
    atc.add_method_call(
        app_id=app_id,
        method=REGISTER_METHOD,
        sender=address,
        sp=sp_with_extra_fee,
        signer=signer,
        method_args=[
            phash,
            creator_name,
            platform,
            TransactionWithSigner(pay_txn, signer),
        ],
    )

    result = atc.execute(algod_client, wait_rounds=4)
    asa_id = int(result.abi_results[0].return_value)
    tx_id = result.tx_ids[1]  # Method call txn ID (index 1, after the pay txn)

    logger.info(f"Registered content on-chain: phash={phash} asa_id={asa_id} tx={tx_id}")

    return {
        "tx_id": tx_id,
        "asa_id": asa_id,
        "phash": phash,
        "app_id": app_id,
    }


def verify_content_on_chain(phash: str) -> dict:
    """
    Verify a content item by querying the GenMark smart contract.

    Uses the algod simulate endpoint (free, no fees) since verify_content
    is a read-only method (readonly=True in the Puya contract).

    Args:
        phash: 16-char perceptual hash hex string to look up

    Returns:
        dict with keys: found (bool), and if found: creator_name, creator_address,
        platform, timestamp (ISO string), asa_id, flag_count, phash, app_id
    """
    algod_client = get_algod_client()
    private_key, address = get_deployer_credentials()
    app_id = get_app_id()
    signer = AccountTransactionSigner(private_key)

    sp = algod_client.suggested_params()
    sp.flat_fee = True
    sp.fee = 1000

    atc = AtomicTransactionComposer()
    atc.add_method_call(
        app_id=app_id,
        method=VERIFY_METHOD,
        sender=address,
        sp=sp,
        signer=signer,
        method_args=[phash],
    )

    # Use simulate for read-only calls — no fees, no state change
    simulate_result = atc.simulate(algod_client)
    return_value = simulate_result.abi_results[0].return_value

    found = bool(return_value[0])

    if not found:
        return {"found": False}

    record = return_value[1]
    # record = (creator_name, creator_address_bytes, platform, timestamp, asa_id, flag_count)
    creator_name = str(record[0])
    creator_address_bytes = record[1]  # 32-byte address bytes
    platform = str(record[2])
    timestamp_unix = int(record[3])
    asa_id = int(record[4])
    flag_count = int(record[5])

    # Convert 32-byte address to base32 Algorand address string
    creator_address = algosdk.encoding.encode_address(bytes(creator_address_bytes))

    # Convert Unix timestamp to human-readable UTC string
    timestamp_str = datetime.fromtimestamp(timestamp_unix, tz=timezone.utc).strftime(
        "%Y-%m-%d %H:%M:%S UTC"
    )

    logger.info(f"Verified content: phash={phash} found=True creator={creator_name}")

    return {
        "found": True,
        "creator_name": creator_name,
        "creator_address": creator_address,
        "platform": platform,
        "timestamp": timestamp_str,
        "timestamp_unix": timestamp_unix,
        "asa_id": asa_id,
        "flag_count": flag_count,
        "phash": phash,
        "app_id": app_id,
    }


def flag_misuse_on_chain(phash: str, description: str) -> dict:
    """
    File an immutable misuse report on the GenMark smart contract.

    Builds an atomic transaction group with:
      [0] PaymentTxn  → contract address (covers flag box storage MBR)
      [1] ApplicationCallTxn → flag_misuse() ABI method call

    Args:
        phash       : Perceptual hash of the content being reported
        description : Human-readable misuse description

    Returns:
        dict with keys: tx_id, flag_index, phash
    """
    algod_client = get_algod_client()
    private_key, address = get_deployer_credentials()
    app_id = get_app_id()
    app_address = get_app_address(app_id)
    signer = AccountTransactionSigner(private_key)

    sp = algod_client.suggested_params()

    # Payment to cover flag box MBR (~0.05 ALGO)
    pay_txn = PaymentTxn(
        sender=address,
        sp=sp,
        receiver=app_address,
        amt=50_000,  # 0.05 ALGO
    )

    sp_call = algod_client.suggested_params()
    sp_call.flat_fee = True
    sp_call.fee = 1000

    atc = AtomicTransactionComposer()
    atc.add_method_call(
        app_id=app_id,
        method=FLAG_METHOD,
        sender=address,
        sp=sp_call,
        signer=signer,
        method_args=[
            phash,
            description,
            TransactionWithSigner(pay_txn, signer),
        ],
    )

    result = atc.execute(algod_client, wait_rounds=4)
    flag_index = int(result.abi_results[0].return_value)
    tx_id = result.tx_ids[1]

    logger.info(f"Flagged misuse: phash={phash} flag_index={flag_index} tx={tx_id}")

    return {
        "tx_id": tx_id,
        "flag_index": flag_index,
        "phash": phash,
    }


def get_flag_from_chain(phash: str, flag_index: int) -> str:
    """
    Retrieve a specific misuse flag description from the smart contract.

    Args:
        phash      : Perceptual hash of the content
        flag_index : Zero-based flag index

    Returns:
        The flag description string.
    """
    algod_client = get_algod_client()
    private_key, address = get_deployer_credentials()
    app_id = get_app_id()
    signer = AccountTransactionSigner(private_key)

    sp = algod_client.suggested_params()
    sp.flat_fee = True
    sp.fee = 1000

    atc = AtomicTransactionComposer()
    atc.add_method_call(
        app_id=app_id,
        method=GET_FLAG_METHOD,
        sender=address,
        sp=sp,
        signer=signer,
        method_args=[phash, flag_index],
    )

    simulate_result = atc.simulate(algod_client)
    return str(simulate_result.abi_results[0].return_value)
