"""
GenMark — Algorand Blockchain Interaction Module
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
# ─────────────────────────────────────────────────────────────────────────────

CONTENT_RECORD_TYPE = "(string,address,string,uint64,uint64,uint64)"

REGISTER_METHOD = abi.Method.from_signature(
    "register_content(string,string,string,pay)uint64"
)
VERIFY_METHOD = abi.Method.from_signature(
    f"verify_content(string)(bool,{CONTENT_RECORD_TYPE})"
)
FLAG_METHOD = abi.Method.from_signature(
    "flag_misuse(string,string,pay)uint64"
)
GET_FLAG_METHOD = abi.Method.from_signature(
    "get_flag(string,uint64)string"
)


# ─────────────────────────────────────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────────────────────────────────────


def _box_key(phash: str, prefix: bytes) -> bytes:
    """
    Compute the box key for a given phash.
    arc4.String encoding = 2-byte big-endian length + utf-8 bytes.
    BoxMap uses: prefix + arc4_encode(key)
    """
    phash_bytes = phash.encode("utf-8")
    arc4_encoded = len(phash_bytes).to_bytes(2, "big") + phash_bytes
    return prefix + arc4_encoded


def get_algod_client() -> algod.AlgodClient:
    server = os.getenv("ALGORAND_ALGOD_SERVER", "https://testnet-api.algonode.cloud")
    port = os.getenv("ALGORAND_ALGOD_PORT", "")
    token = os.getenv("ALGORAND_ALGOD_TOKEN", "a" * 64)
    url = f"{server}:{port}" if port else server
    return algod.AlgodClient(token, url)


def get_deployer_credentials() -> tuple[str, str]:
    mnemonic_phrase = os.getenv("DEPLOYER_MNEMONIC")
    if not mnemonic_phrase:
        raise ValueError("DEPLOYER_MNEMONIC environment variable is not set.")
    private_key = mn.to_private_key(mnemonic_phrase)
    address = algosdk.account.address_from_private_key(private_key)
    return private_key, address


def get_app_id() -> int:
    app_id = int(os.getenv("ALGORAND_APP_ID", "0"))
    if app_id == 0:
        raise ValueError("ALGORAND_APP_ID is not set. Deploy the contract first.")
    return app_id


def get_app_address(app_id: int) -> str:
    return algosdk.logic.get_application_address(app_id)


# ─────────────────────────────────────────────────────────────────────────────
# Blockchain Operations
# ─────────────────────────────────────────────────────────────────────────────


def register_content_on_chain(phash: str, creator_name: str, platform: str) -> dict:
    """Register a new content item on the GenMark smart contract."""
    algod_client = get_algod_client()
    private_key, address = get_deployer_credentials()
    app_id = get_app_id()
    app_address = get_app_address(app_id)
    signer = AccountTransactionSigner(private_key)

    sp_with_extra_fee = algod_client.suggested_params()
    sp_with_extra_fee.flat_fee = True
    sp_with_extra_fee.fee = 2 * 1000  # covers inner ASA creation itxn

    pay_txn = PaymentTxn(
        sender=address,
        sp=algod_client.suggested_params(),
        receiver=app_address,
        amt=100_000,  # 0.1 ALGO for box MBR + ASA creation
    )

    box_key = _box_key(phash, b"reg_")

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
        boxes=[(app_id, box_key)],
    )

    result = atc.execute(algod_client, wait_rounds=4)
    asa_id = int(result.abi_results[0].return_value)
    tx_id = result.tx_ids[1]

    logger.info(f"Registered content on-chain: phash={phash} asa_id={asa_id} tx={tx_id}")

    return {"tx_id": tx_id, "asa_id": asa_id, "phash": phash, "app_id": app_id}


def verify_content_on_chain(phash: str) -> dict:
    """Verify a content item by querying the GenMark smart contract."""
    algod_client = get_algod_client()
    private_key, address = get_deployer_credentials()
    app_id = get_app_id()
    signer = AccountTransactionSigner(private_key)

    sp = algod_client.suggested_params()
    sp.flat_fee = True
    sp.fee = 1000

    box_key = _box_key(phash, b"reg_")

    atc = AtomicTransactionComposer()
    atc.add_method_call(
        app_id=app_id,
        method=VERIFY_METHOD,
        sender=address,
        sp=sp,
        signer=signer,
        method_args=[phash],
        boxes=[(app_id, box_key)],
    )

    # simulate = read-only, no fees, no state change
    simulate_result = atc.simulate(algod_client)
    return_value = simulate_result.abi_results[0].return_value

    found = bool(return_value[0])
    if not found:
        return {"found": False}

    record = return_value[1]
    creator_name = str(record[0])
    creator_address_bytes = record[1]
    platform = str(record[2])
    timestamp_unix = int(record[3])
    asa_id = int(record[4])
    flag_count = int(record[5])

    creator_address = algosdk.encoding.encode_address(bytes(creator_address_bytes))
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
    """File an immutable misuse report on the GenMark smart contract."""
    algod_client = get_algod_client()
    private_key, address = get_deployer_credentials()
    app_id = get_app_id()
    app_address = get_app_address(app_id)
    signer = AccountTransactionSigner(private_key)

    sp = algod_client.suggested_params()

    pay_txn = PaymentTxn(
        sender=address,
        sp=sp,
        receiver=app_address,
        amt=50_000,  # 0.05 ALGO for flag box MBR
    )

    sp_call = algod_client.suggested_params()
    sp_call.flat_fee = True
    sp_call.fee = 1000

    box_key = _box_key(phash, b"reg_")

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
        boxes=[(app_id, box_key)],
    )

    result = atc.execute(algod_client, wait_rounds=4)
    flag_index = int(result.abi_results[0].return_value)
    tx_id = result.tx_ids[1]

    logger.info(f"Flagged misuse: phash={phash} flag_index={flag_index} tx={tx_id}")

    return {"tx_id": tx_id, "flag_index": flag_index, "phash": phash}


def get_flag_from_chain(phash: str, flag_index: int) -> str:
    """Retrieve a specific misuse flag description from the smart contract."""
    algod_client = get_algod_client()
    private_key, address = get_deployer_credentials()
    app_id = get_app_id()
    signer = AccountTransactionSigner(private_key)

    sp = algod_client.suggested_params()
    sp.flat_fee = True
    sp.fee = 1000

    box_key = _box_key(phash, b"reg_")

    atc = AtomicTransactionComposer()
    atc.add_method_call(
        app_id=app_id,
        method=GET_FLAG_METHOD,
        sender=address,
        sp=sp,
        signer=signer,
        method_args=[phash, flag_index],
        boxes=[(app_id, box_key)],
    )

    simulate_result = atc.simulate(algod_client)
    return str(simulate_result.abi_results[0].return_value)