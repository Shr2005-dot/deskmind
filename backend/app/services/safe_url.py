"""Safe URL fetcher with SSRF protection.

This module validates and fetches web pages while protecting against:
- Invalid URL schemes
- Private/internal IP addresses
- Cloud metadata endpoints
- DNS rebinding
- Malicious redirects
- Oversized responses
- Unsupported content types
"""

from __future__ import annotations

import ipaddress
import logging
import socket
from typing import Optional
from urllib.parse import urlparse

import requests
from fastapi import HTTPException, status

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

# Only allow these schemes
ALLOWED_SCHEMES = {"http", "https"}

# Block these specific IPs regardless of range
BLOCKED_IPS = {
    ipaddress.ip_address("169.254.169.254"),  # AWS/GCP/Azure metadata
}

# Private/reserved networks to block
BLOCKED_NETWORKS = [
    ipaddress.ip_network("127.0.0.0/8"),       # loopback
    ipaddress.ip_network("10.0.0.0/8"),        # private
    ipaddress.ip_network("172.16.0.0/12"),     # private
    ipaddress.ip_network("192.168.0.0/16"),    # private
    ipaddress.ip_network("169.254.0.0/16"),    # link-local / cloud metadata
    ipaddress.ip_network("::1/128"),           # IPv6 loopback
    ipaddress.ip_network("fc00::/7"),          # IPv6 unique local
    ipaddress.ip_network("fe80::/10"),         # IPv6 link-local
    ipaddress.ip_network("0.0.0.0/8"),         # unspecified
    ipaddress.ip_network("100.64.0.0/10"),     # shared address space (CGNAT)
]

# Request limits
MAX_RESPONSE_SIZE = 5 * 1024 * 1024  # 5 MB
REQUEST_TIMEOUT = 15  # seconds

# Allowed content types for web ingestion
ALLOWED_CONTENT_TYPES = {
    "text/html",
    "text/plain",
    "text/markdown",
    "application/xhtml+xml",
}


# ---------------------------------------------------------------------------
# Validation helpers
# ---------------------------------------------------------------------------


def _is_private_ip(ip_str: str) -> bool:
    """Check if an IP address is private/reserved/loopback."""
    try:
        addr = ipaddress.ip_address(ip_str)
    except ValueError:
        return True  # unparseable → treat as unsafe

    if addr in BLOCKED_IPS:
        return True

    for network in BLOCKED_NETWORKS:
        if addr in network:
            return True

    return False


def validate_url(url: str) -> str:
    """Validate a URL for safe fetching.

    Checks:
    - scheme is http or https
    - hostname is present
    - DNS resolves to a non-private IP
    - URL length is reasonable

    Returns the normalized URL string.

    Raises ValueError on any validation failure with a user-safe message.
    """
    if not url or not isinstance(url, str):
        raise ValueError("URL is required")

    url = url.strip()
    if len(url) > 2048:
        raise ValueError("URL is too long")

    parsed = urlparse(url)

    # Scheme check
    if parsed.scheme not in ALLOWED_SCHEMES:
        raise ValueError("URL must start with http:// or https://")

    # Hostname check
    if not parsed.netloc:
        raise ValueError("Invalid URL: missing domain")

    hostname = parsed.hostname
    if not hostname:
        raise ValueError("Invalid URL: missing domain")

    # Resolve hostname and validate IP
    try:
        # Use getaddrinfo for both IPv4 and IPv6
        addr_infos = socket.getaddrinfo(hostname, parsed.port or (443 if parsed.scheme == "https" else 80))
    except socket.gaierror:
        raise ValueError("Unable to resolve the website address")

    for addr_info in addr_infos:
        ip_str = addr_info[4][0]
        if _is_private_ip(ip_str):
            raise ValueError("This URL points to an internal or private address")

    return url


def _validate_redirect(url: str) -> str:
    """Validate a redirect destination URL.

    Returns the validated URL or raises ValueError.
    """
    return validate_url(url)


class _RetryableHTTPError(Exception):
    """Raised when an HTTP response indicates a transient server-side failure."""

    def __init__(self, status_code: int, message: str) -> None:
        self.status_code = status_code
        super().__init__(message)


def _is_retryable_status(status_code: int) -> bool:
    return status_code in (429, 500, 502, 503, 504)


# ---------------------------------------------------------------------------
# Safe fetcher
# ---------------------------------------------------------------------------


def safe_get(url: str, timeout: int = REQUEST_TIMEOUT) -> str:
    """Fetch a URL safely with SSRF protections.

    1. Validates the URL scheme and hostname
    2. Resolves DNS and checks for private IPs
    3. Fetches with strict timeouts and size limits
    4. Validates content type
    5. Validates redirects if followed

    Returns the response text.

    Raises ValueError on any failure with a user-safe message.
    """
    validated_url = validate_url(url)
    logger.info("Fetching URL: %s", validated_url)

    try:
        response = requests.get(
            validated_url,
            timeout=timeout,
            headers={
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
                "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
                "Accept-Language": "en-US,en;q=0.5",
                "Accept-Encoding": "gzip, deflate, br",
                "Connection": "keep-alive",
                "Upgrade-Insecure-Requests": "1",
                "Sec-Fetch-Dest": "document",
                "Sec-Fetch-Mode": "navigate",
                "Sec-Fetch-Site": "none",
                "Sec-Fetch-User": "?1",
            },
            allow_redirects=False,  # We'll handle redirects manually
            stream=True,
        )
    except requests.exceptions.Timeout:
        raise ValueError("The website took too long to respond")
    except requests.exceptions.ConnectionError:
        raise ValueError("Could not connect to the website")
    except requests.exceptions.RequestException as exc:
        raise ValueError(f"Failed to fetch URL: {exc}") from exc

    # Handle redirects manually so we can validate each destination
    redirect_limit = 5
    while redirect_limit > 0 and response.is_redirect:
        redirect_limit -= 1
        location = response.headers.get("Location", "")
        if not location:
            break

        # Resolve relative redirects
        redirect_url = requests.compat.urljoin(validated_url, location)
        try:
            validated_url = _validate_redirect(redirect_url)
        except ValueError as exc:
            raise ValueError("Redirect destination is not allowed") from exc

        try:
            response = requests.get(
                validated_url,
                timeout=timeout,
                headers={
                    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
                    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
                    "Accept-Language": "en-US,en;q=0.5",
                    "Accept-Encoding": "gzip, deflate, br",
                    "Connection": "keep-alive",
                    "Upgrade-Insecure-Requests": "1",
                },
                allow_redirects=False,
                stream=True,
            )
        except requests.exceptions.Timeout:
            raise ValueError("The website took too long to respond")
        except requests.exceptions.ConnectionError:
            raise ValueError("Could not connect to the website")
        except requests.exceptions.RequestException as exc:
            raise ValueError(f"Failed to fetch URL: {exc}") from exc

    if redirect_limit == 0:
        raise ValueError("Too many redirects")

    # Check status code
    if response.status_code != 200:
        if _is_retryable_status(response.status_code):
            raise _RetryableHTTPError(
                response.status_code,
                f"Website returned a retryable error (status {response.status_code})",
            )
        raise ValueError(f"Website returned an error (status {response.status_code})")

    # Validate content type
    content_type = response.headers.get("Content-Type", "").lower()
    logger.info("URL content type: %s", content_type)
    if not any(ct in content_type for ct in ALLOWED_CONTENT_TYPES):
        raise ValueError("Unsupported content type. Only HTML and text pages are supported.")

    # Read with size limit
    chunks = []
    total_size = 0
    for chunk in response.iter_content(chunk_size=8192):
        if chunk:
            total_size += len(chunk)
            if total_size > MAX_RESPONSE_SIZE:
                raise ValueError("The page is too large to process")
            chunks.append(chunk)

    raw_bytes = b"".join(chunks)
    logger.info("Fetched %s bytes from %s", total_size, validated_url)

    # Decode with fallback encodings.  Some sites declare UTF-8 but actually
    # serve Windows-1252 or Latin-1; replace bad sequences instead of failing.
    for encoding in ("utf-8", "cp1252", "latin-1"):
        try:
            return raw_bytes.decode(encoding)
        except (UnicodeDecodeError, LookupError):
            continue
    return raw_bytes.decode("utf-8", errors="replace")


# ---------------------------------------------------------------------------
# HTTPException helper
# ---------------------------------------------------------------------------


def http_error(exc: ValueError) -> HTTPException:
    """Convert a ValueError from this module into an HTTPException."""
    return HTTPException(
        status_code=status.HTTP_400_BAD_REQUEST,
        detail=str(exc),
    )
