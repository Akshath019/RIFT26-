"""
GenMark — Perceptual Hashing Module
=====================================
Implements perceptual hashing (pHash) for image fingerprinting.

Why pHash instead of SHA-256?
    SHA-256 produces completely different output if even a single pixel changes.
    Real-world misuse always involves re-saving, compressing, cropping, or
    resizing the image — making SHA-256 useless for tracking.

    Perceptual hashing works by:
    1. Resizing the image to a small fixed size (e.g., 32x32)
    2. Computing the DCT (Discrete Cosine Transform) of pixel values
    3. Comparing each frequency coefficient to the median
    4. Encoding the comparison results as a 64-bit integer

    The result: two versions of the same image (even after compression,
    minor cropping, or format conversion) will produce hashes with a low
    Hamming distance (typically < 4 for the same image, > 15 for different images).

    This makes pHash practical for real-world content tracking.
"""

import io
import logging

import imagehash
from PIL import Image

logger = logging.getLogger(__name__)

# Hamming distance threshold below which two hashes are considered the same image.
# 0 = exact match only | 4 = very similar | 10 = probably similar
SIMILARITY_THRESHOLD = 4


def compute_phash(image_bytes: bytes) -> str:
    """
    Compute the perceptual hash of an image from raw bytes.

    Args:
        image_bytes: Raw image bytes (JPEG, PNG, WebP, GIF, etc.)

    Returns:
        A 16-character lowercase hex string representing the 64-bit pHash.
        Example: "a9e3c4b2d1f5e7c8"

    Raises:
        ValueError: If the bytes cannot be parsed as a valid image.
    """
    try:
        img = Image.open(io.BytesIO(image_bytes))
        # Convert to RGB to normalize format (handles PNG alpha, RGBA, etc.)
        img = img.convert("RGB")
        phash = imagehash.phash(img, hash_size=8)  # 8x8 = 64-bit hash
        hex_str = str(phash)  # Returns 16-char lowercase hex (e.g., "a9e3c4b2d1f5e7c8")
        logger.debug(f"Computed pHash: {hex_str}")
        return hex_str
    except Exception as e:
        logger.error(f"Failed to compute pHash: {e}")
        raise ValueError(f"Invalid image data: {e}") from e


def hamming_distance(hash1: str, hash2: str) -> int:
    """
    Compute the Hamming distance between two pHash hex strings.

    The Hamming distance counts the number of bit positions where the two
    hashes differ. A low distance means the images are visually similar.

    Args:
        hash1: First pHash hex string (16 chars)
        hash2: Second pHash hex string (16 chars)

    Returns:
        Integer in range [0, 64].
        0 = identical images
        1-4 = very similar (same image, minor modification)
        5-15 = possibly related
        >15 = likely different images
    """
    h1 = imagehash.hex_to_hash(hash1)
    h2 = imagehash.hex_to_hash(hash2)
    return h1 - h2  # imagehash overloads subtraction as Hamming distance


def are_similar(hash1: str, hash2: str, threshold: int = SIMILARITY_THRESHOLD) -> bool:
    """
    Check if two images are perceptually similar based on their hashes.

    Args:
        hash1: First pHash hex string
        hash2: Second pHash hex string
        threshold: Maximum Hamming distance to consider similar (default: 4)

    Returns:
        True if the images are similar, False otherwise.
    """
    try:
        distance = hamming_distance(hash1, hash2)
        return distance <= threshold
    except Exception:
        return False
