"""
GenMark — Algorand Blockchain Interaction Module
"""

import logging
import os
import time
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

CONTENT_RECORD_TYPE = "(string,address,string,uint64,uint64,uint64,string,string)"

REGISTER_METHOD = abi.Method.from_signature(
    "register_content(string,string,string,string,string,pay)uint64"
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


def register_content_on_chain(
    phash: str,
    creator_name: str,
    platform: str,
    original_phash: str = "",
    morphed_by: str = "",
) -> dict:
    """Register a new content item on the GenMark smart contract.

    original_phash: pHash of the parent image, empty string if this is original content.
    morphed_by: name of the person who morphed it, empty string if original content.
    These two fields are stored permanently on-chain and form the provenance chain.

    Retries up to 3 times on network timeout errors (AlgoNode can be slow).
    """
    last_error: Exception = RuntimeError("No attempts made")

    for attempt in range(3):
        try:
            # Build a fresh ATC each attempt — suggested params expire after a few rounds
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
                amt=300_000,  # 0.3 ALGO — covers base account MBR + ASA MBR + box MBR
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
                    original_phash,
                    morphed_by,
                    TransactionWithSigner(pay_txn, signer),
                ],
                boxes=[(app_id, box_key)],
            )

            result = atc.execute(algod_client, wait_rounds=4)
            asa_id = int(result.abi_results[0].return_value)
            tx_id = result.tx_ids[1]

            logger.info(f"Registered content on-chain: phash={phash} asa_id={asa_id} tx={tx_id}")
            return {"tx_id": tx_id, "asa_id": asa_id, "phash": phash, "app_id": app_id}

        except Exception as e:
            error_str = str(e).lower()
            is_timeout = "timeout" in error_str or "timed out" in error_str
            if is_timeout and attempt < 2:
                last_error = e
                logger.warning(
                    f"Registration timeout (attempt {attempt + 1}/3) — retrying in 4s… ({e})"
                )
                time.sleep(4)
                continue
            # Non-timeout errors or final retry exhausted: re-raise immediately
            raise

    raise last_error


def verify_content_on_chain(phash: str) -> dict:
    """Verify a content item by querying the GenMark smart contract.
    Retries once on timeout (simulate is fast but AlgoNode can be slow).
    """
    for attempt in range(2):
        try:
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
            break  # success — exit retry loop
        except Exception as e:
            error_str = str(e).lower()
            if ("timeout" in error_str or "timed out" in error_str) and attempt == 0:
                logger.warning(f"Verify timeout, retrying… ({e})")
                time.sleep(2)
                continue
            raise

    abi_result = simulate_result.abi_results[0] if simulate_result.abi_results else None
    return_value = abi_result.return_value if abi_result else None

    if return_value is None:
        return {"found": False}

    found = bool(return_value[0])
    if not found:
        return {"found": False}

    record = return_value[1]
    creator_name = str(record[0])
    creator_address_raw = record[1]
    platform = str(record[2])
    timestamp_unix = int(record[3])
    asa_id = int(record[4])
    flag_count = int(record[5])
    original_phash = str(record[6])  # empty string if original content
    morphed_by = str(record[7])      # empty string if original content

    if isinstance(creator_address_raw, str):
        creator_address = creator_address_raw
    else:
        creator_address = algosdk.encoding.encode_address(bytes(creator_address_raw))
    timestamp_str = datetime.fromtimestamp(timestamp_unix, tz=timezone.utc).strftime(
        "%Y-%m-%d %H:%M:%S UTC"
    )

    logger.info(f"Verified content: phash={phash} found=True creator={creator_name} morphed_by={morphed_by or 'none'}")

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
        "original_phash": original_phash,
        "morphed_by": morphed_by,
        "is_modification": bool(original_phash),
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