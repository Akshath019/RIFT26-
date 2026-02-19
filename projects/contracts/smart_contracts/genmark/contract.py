"""
GenMark Smart Contract — AI Content Origin Registry
====================================================
Deployed on Algorand TestNet via AlgoKit + Puya compiler.

This contract acts as an unforgeable birth certificate for AI-generated content.
Every image is registered at the moment of creation using a perceptual hash (pHash),
creating an immutable, publicly auditable chain of evidence for accountability.

Architecture:
  - Box storage: per-content records keyed by pHash string (namespace: "reg_")
  - Flag boxes:  individual misuse reports with composite keys (namespace: "flg_")
  - Global state: total registration counter visible on-chain

ARC Standards:
  - ARC-4: Smart contract ABI (method signatures, struct types)
  - ARC-4 Box Storage: O(1) per-content lookup without indexer
  - Soulbound ASA: total=1, decimals=0, default_frozen=True

Author: GenMark Team
"""

from algopy import (
    ARC4Contract,
    BoxMap,
    Bytes,
    Global,
    Txn,
    UInt64,
    arc4,
    gtxn,
    itxn,
    op,
)
from algopy.arc4 import abimethod


# ─────────────────────────────────────────────────────────────────────────────
# ARC-4 Data Structures
# ─────────────────────────────────────────────────────────────────────────────


class ContentRecord(arc4.Struct):
    """
    ARC-4 encoded registration record for a single AI-generated content item.

    Stored in Algorand Box storage, keyed by the perceptual hash of the image.
    Each field is ARC-4 encoded for efficient binary storage and ABI compatibility.

    Field encoding:
        creator_name    → arc4.String  (variable length, 2-byte length prefix)
        creator_address → arc4.Address (fixed 32 bytes, Algorand standard encoding)
        platform        → arc4.String  (variable length, 2-byte length prefix)
        timestamp       → arc4.UInt64  (fixed 8 bytes, Unix seconds)
        asa_id          → arc4.UInt64  (fixed 8 bytes, soulbound ASA identifier)
        flag_count      → arc4.UInt64  (fixed 8 bytes, misuse report counter)
    """

    creator_name: arc4.String  # Human-readable creator display name
    creator_address: arc4.Address  # 32-byte Algorand wallet address of the creator
    platform: arc4.String  # Platform/tool that generated the content (e.g. "GenMark")
    timestamp: arc4.UInt64  # Unix timestamp of registration (seconds since epoch)
    asa_id: arc4.UInt64  # Soulbound ASA ID — the on-chain ownership credential
    flag_count: arc4.UInt64  # Number of misuse reports filed against this content


# ─────────────────────────────────────────────────────────────────────────────
# Main Contract
# ─────────────────────────────────────────────────────────────────────────────


class GenMark(ARC4Contract):
    """
    GenMark — AI Content Origin Registry

    Core innovation: every AI-generated image receives a silent, unforgeable
    digital birth certificate at the moment of creation. The perceptual hash
    (pHash) fingerprint enables tracking even through resizing, compression,
    format conversion, and minor editing — unlike SHA-256 which changes on
    any pixel modification.

    Registration flow (invisible to users):
      1. User generates image on the GenMark platform
      2. Backend computes pHash using the imagehash Python library
      3. Backend calls register_content() in an atomic transaction group
      4. A soulbound ASA is minted as the cryptographic ownership credential
      5. Record is permanently stored in Algorand Box storage
      6. User sees only a small "Content Stamped ✓" badge

    Verification flow:
      1. Investigator uploads suspicious image to the verify portal
      2. Backend computes pHash of the uploaded image
      3. Backend calls verify_content() (read-only, no fees)
      4. Full origin record is returned: creator, platform, exact timestamp
      5. Investigator can download a forensic PDF certificate

    Misuse flagging:
      1. Investigator clicks "Report Misuse" with a description
      2. Backend calls flag_misuse() in an atomic transaction
      3. Immutable flag record stored in a dedicated box (cannot be deleted)
      4. Transaction ID serves as evidence of the report being filed

    Design decisions:
      • Box namespace "reg_" separates registry boxes from flag boxes ("flg_")
      • Soulbound ASA: total=1, decimals=0, default_frozen=True, all roles=contract
      • flag_count is the only field updated post-registration → box size stays constant
      • Payment requirements prevent spam and cover box Minimum Balance Requirements
    """

    # Global state: total number of successfully registered content items.
    # Visible to anyone querying the contract's global state on-chain.
    total_registrations: UInt64

    def __init__(self) -> None:
        """Initialize global state on first deployment."""
        # BoxMap: arc4.String (pHash) → ContentRecord
        # Box keys are: b"reg_" + arc4_encoded_phash_bytes
        self.registry = BoxMap(arc4.String, ContentRecord, key_prefix=b"reg_")
        self.total_registrations = UInt64(0)

    # ─────────────────────────────────────────────────────────────────────
    # Method 1: Register Content
    # ─────────────────────────────────────────────────────────────────────

    @abimethod()
    def register_content(
        self,
        phash: arc4.String,
        creator_name: arc4.String,
        platform: arc4.String,
        pay_txn: gtxn.PaymentTransaction,
    ) -> arc4.UInt64:
        """
        Register a new AI-generated content item with its perceptual fingerprint.

        Called silently at the moment of image generation. The user never sees
        blockchain terminology — they see only a "Content Stamped ✓" badge.

        Args:
            phash       : Perceptual hash hex string (pHash, 16-char hex = 64-bit hash).
                          Stable across minor image modifications (resize, recompress).
            creator_name: Display name of the content creator.
            platform    : Name of the AI platform (e.g., "GenMark").
            pay_txn     : Payment to contract covering box MBR + ASA creation fee.
                          Minimum: 0.1 ALGO (100,000 microAlgos).

        Returns:
            asa_id: The Algorand Standard Asset ID of the minted soulbound certificate.
                    This ID is stored in the record and returned to the frontend.

        Errors:
            • "Payment must be directed to the GenMark contract" — wrong receiver
            • "Minimum 0.1 ALGO required" — payment too small
            • "Content fingerprint has already been registered" — duplicate hash

        Notes on the soulbound ASA:
            total=1          → exactly one unit exists, making it non-fungible
            decimals=0       → indivisible, whole unit only
            default_frozen=True → receiving accounts are frozen by default
            manager/freeze/clawback = contract → only the contract can manage this ASA,
                              making unauthorized transfers impossible
        """
        # ── Validate payment to cover on-chain storage costs ─────────────────
        assert pay_txn.receiver == Global.current_application_address, (
            "Payment must be directed to the GenMark contract to fund box storage"
        )
        assert pay_txn.amount >= UInt64(100_000), (
            "Minimum 0.1 ALGO (100,000 microAlgos) required for box MBR + ASA creation"
        )

        # ── Prevent duplicate registrations (backdating attack mitigation) ───
        # Each perceptual hash can only be registered once. Any attempt to register
        # the same fingerprint twice is rejected, ensuring temporal integrity.
        assert phash not in self.registry, (
            "This content fingerprint has already been registered on GenMark"
        )

        # ── Mint soulbound ownership credential ASA ───────────────────────────
        # An inner transaction creates a non-transferable ASA bound to this content.
        # The ASA ID serves as the certificate number in forensic documentation.
        #
        # Why soulbound? The combination of default_frozen=True and assigning all
        # management roles to the contract means no external party can transfer,
        # modify, or destroy this ASA — only the contract has authority.
        asset_result = itxn.AssetConfig(
            total=1,  # Non-fungible: exactly one unit exists in the universe
            decimals=0,  # Indivisible: no fractional ownership
            default_frozen=True,  # Recipients are frozen — cannot transact
            asset_name=b"GenMark Certificate",  # Human-readable name
            unit_name=b"GMC",  # Ticker symbol for wallet/explorer display
            url=b"https://genmark.app",  # Reference URL for additional metadata
            # Assigning all control roles to the contract makes this ASA soulbound:
            # no external wallet can manage, freeze, or clawback this asset
            manager=Global.current_application_address,
            freeze=Global.current_application_address,
            clawback=Global.current_application_address,
            # fee=0 means this fee is pooled from the outer transaction.
            # Callers must set outer_txn.fee = 2 * min_fee to cover this inner txn.
            fee=0,
        ).submit()

        asset_id = asset_result.created_asset.id

        # ── Write permanent registration record to box storage ────────────────
        # Box key = b"reg_" + arc4_encode(phash)
        # This creates an immutable on-chain record that anyone can query forever.
        self.registry[phash] = ContentRecord(
            creator_name=creator_name,
            creator_address=arc4.Address(Txn.sender),  # Caller's wallet address
            platform=platform,
            timestamp=arc4.UInt64(Global.latest_timestamp),  # Block timestamp
            asa_id=arc4.UInt64(asset_id),  # Ownership credential reference
            flag_count=arc4.UInt64(0),  # No misuse reports at registration time
        )

        # ── Increment global registration counter ─────────────────────────────
        self.total_registrations += UInt64(1)

        return arc4.UInt64(asset_id)

    # ─────────────────────────────────────────────────────────────────────
    # Method 2: Verify Content
    # ─────────────────────────────────────────────────────────────────────

    @abimethod(readonly=True)
    def verify_content(
        self,
        phash: arc4.String,
    ) -> tuple[arc4.Bool, ContentRecord]:
        """
        Look up a content item by its perceptual hash and return the origin record.

        This is a READ-ONLY method (readonly=True). It can be simulated without
        submitting a transaction — zero fees, zero state changes. Anyone, anywhere,
        can verify any image without a wallet or any blockchain knowledge.

        Args:
            phash: Perceptual hash of the image to verify (16-char hex string).

        Returns:
            (found, record): ARC-4 tuple where:
                found=True  → content was registered; record has full origin details
                found=False → no registration found; treat as unregistered (suspicious)

        Note on fuzzy matching:
            This contract performs exact hash lookup. The backend layer handles
            fuzzy matching (Hamming distance threshold) before calling this method,
            allowing detection of near-duplicate modified images.

        Use case:
            A journalist finds a suspicious deepfake image. They upload it to the
            GenMark verify portal. The portal calls this method. If found=True,
            the full origin record (creator, platform, exact timestamp) is returned.
            If found=False, the portal shows "No Registration Found" — which is
            itself evidence of suspicious origin.
        """
        if phash in self.registry:
            # ── Content found: return full provenance record ───────────────────
            return arc4.Bool(True), self.registry[phash].copy()

        # ── Content not found: return sentinel empty record ───────────────────
        # The caller should check the Bool flag before using the record fields.
        # Global.zero_address is the 32-byte zero address used as a null placeholder.
        return arc4.Bool(False), ContentRecord(
            creator_name=arc4.String(""),
            creator_address=arc4.Address(Global.zero_address),
            platform=arc4.String(""),
            timestamp=arc4.UInt64(0),
            asa_id=arc4.UInt64(0),
            flag_count=arc4.UInt64(0),
        )

    # ─────────────────────────────────────────────────────────────────────
    # Method 3: Flag Misuse
    # ─────────────────────────────────────────────────────────────────────

    @abimethod()
    def flag_misuse(
        self,
        phash: arc4.String,
        description: arc4.String,
        pay_txn: gtxn.PaymentTransaction,
    ) -> arc4.UInt64:
        """
        File an immutable misuse report against a registered content item.

        Each flag is stored in a dedicated box with a composite key:
            key = b"flg_" + arc4_encode(phash) + itob(flag_index)

        The transaction ID of this call is legally meaningful evidence — it proves
        a report was filed at a specific time and included a specific description.
        Flags can never be deleted or modified, creating a tamper-proof evidence chain.

        Args:
            phash       : Perceptual hash of the content being reported.
            description : Human-readable description of the misuse.
                          Example: "Used in deepfake video impersonating politician X"
            pay_txn     : Payment to contract covering flag box storage (min 0.05 ALGO).

        Returns:
            flag_index: Zero-based index of this flag for this content item.
                        Use (phash + flag_index) to retrieve the flag via get_flag().

        Legal use:
            The transaction ID returned to the caller can be presented to law
            enforcement as evidence that a formal report was filed on-chain.
            The PDF certificate generated by the backend includes this transaction ID.
        """
        # ── Verify the content exists before allowing flagging ────────────────
        assert phash in self.registry, "Cannot file a misuse report: content not registered on GenMark"

        # ── Validate payment for flag box storage costs ───────────────────────
        assert pay_txn.receiver == Global.current_application_address, (
            "Payment must be directed to the GenMark contract"
        )
        assert pay_txn.amount >= UInt64(50_000), (
            "Minimum 0.05 ALGO (50,000 microAlgos) required for flag box storage"
        )

        # ── Determine sequential flag index ───────────────────────────────────
        flag_index = self.registry[phash].flag_count.native

        # ── Store flag description in a dedicated namespaced box ──────────────
        flag_box_key = Bytes(b"flg_") + phash.bytes + op.itob(flag_index)
        op.Box.put(flag_box_key, description.bytes)

        # ── Increment flag count in the registration record ───────────────────
        self.registry[phash].flag_count = arc4.UInt64(flag_index + UInt64(1))

        return arc4.UInt64(flag_index)

    # ─────────────────────────────────────────────────────────────────────
    # Method 4: Get Flag (read-only)
    # ─────────────────────────────────────────────────────────────────────

    @abimethod(readonly=True)
    def get_flag(
        self,
        phash: arc4.String,
        flag_index: arc4.UInt64,
    ) -> arc4.String:
        """
        Retrieve the description text of a specific misuse flag.

        Flags are immutable and indexed sequentially from 0.
        Use verify_content() first to get the flag_count, then iterate.

        Args:
            phash      : Perceptual hash of the content.
            flag_index : Zero-based index of the flag to retrieve (0 to flag_count-1).

        Returns:
            The ARC-4 encoded description string of the flag.

        Errors:
            • "Flag not found at the specified index" — index out of range
        """
        flag_box_key = Bytes(b"flg_") + phash.bytes + op.itob(flag_index.native)
        flag_bytes, flag_exists = op.Box.get(flag_box_key)
        assert flag_exists, "Flag not found at the specified index"
        return arc4.String.from_bytes(flag_bytes)
