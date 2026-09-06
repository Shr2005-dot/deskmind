"""Tests for safe URL validation and SSRF protections."""

from __future__ import annotations

import socket
from unittest.mock import patch

import pytest

from app.services.safe_url import (
    _is_private_ip,
    validate_url,
    BLOCKED_NETWORKS,
    ALLOWED_SCHEMES,
)


class TestValidateUrl:
    def test_valid_https_url(self):
        url = validate_url("https://example.com/page")
        assert url == "https://example.com/page"

    def test_valid_http_url(self):
        url = validate_url("http://example.com/page")
        assert url == "http://example.com/page"

    def test_url_is_stripped(self):
        url = validate_url("  https://example.com/page  ")
        assert url == "https://example.com/page"

    def test_invalid_scheme_file(self):
        with pytest.raises(ValueError, match="URL must start with http"):
            validate_url("file:///etc/passwd")

    def test_invalid_scheme_ftp(self):
        with pytest.raises(ValueError, match="URL must start with http"):
            validate_url("ftp://example.com")

    def test_invalid_scheme_gopher(self):
        with pytest.raises(ValueError, match="URL must start with http"):
            validate_url("gopher://example.com")

    def test_missing_hostname(self):
        with pytest.raises(ValueError, match="missing domain"):
            validate_url("https://")

    def test_missing_scheme(self):
        with pytest.raises(ValueError, match="URL must start with http"):
            validate_url("example.com")

    def test_url_too_long(self):
        long_url = "https://example.com/" + "a" * 2048
        with pytest.raises(ValueError, match="URL is too long"):
            validate_url(long_url)

    def test_empty_url(self):
        with pytest.raises(ValueError, match="URL is required"):
            validate_url("")

    def test_none_url(self):
        with pytest.raises(ValueError, match="URL is required"):
            validate_url(None)  # type: ignore[arg-type]


class TestPrivateIpBlocking:
    @patch("socket.getaddrinfo")
    def test_localhost_blocked(self, mock_getaddrinfo):
        mock_getaddrinfo.return_value = [
            (socket.AF_INET, socket.SOCK_STREAM, 0, "", ("127.0.0.1", 80))
        ]
        with pytest.raises(ValueError, match="internal or private"):
            validate_url("http://localhost/page")

    @patch("socket.getaddrinfo")
    def test_127_0_0_1_blocked(self, mock_getaddrinfo):
        mock_getaddrinfo.return_value = [
            (socket.AF_INET, socket.SOCK_STREAM, 0, "", ("127.0.0.1", 80))
        ]
        with pytest.raises(ValueError, match="internal or private"):
            validate_url("http://127.0.0.1/page")

    @patch("socket.getaddrinfo")
    def test_10_0_0_0_8_blocked(self, mock_getaddrinfo):
        mock_getaddrinfo.return_value = [
            (socket.AF_INET, socket.SOCK_STREAM, 0, "", ("10.0.0.1", 80))
        ]
        with pytest.raises(ValueError, match="internal or private"):
            validate_url("http://10.0.0.1/page")

    @patch("socket.getaddrinfo")
    def test_172_16_0_0_12_blocked(self, mock_getaddrinfo):
        mock_getaddrinfo.return_value = [
            (socket.AF_INET, socket.SOCK_STREAM, 0, "", ("172.16.0.1", 80))
        ]
        with pytest.raises(ValueError, match="internal or private"):
            validate_url("http://172.16.0.1/page")

    @patch("socket.getaddrinfo")
    def test_192_168_0_0_16_blocked(self, mock_getaddrinfo):
        mock_getaddrinfo.return_value = [
            (socket.AF_INET, socket.SOCK_STREAM, 0, "", ("192.168.1.1", 80))
        ]
        with pytest.raises(ValueError, match="internal or private"):
            validate_url("http://192.168.1.1/page")

    @patch("socket.getaddrinfo")
    def test_169_254_169_254_blocked(self, mock_getaddrinfo):
        mock_getaddrinfo.return_value = [
            (socket.AF_INET, socket.SOCK_STREAM, 0, "", ("169.254.169.254", 80))
        ]
        with pytest.raises(ValueError, match="internal or private"):
            validate_url("http://169.254.169.254/latest/meta-data/")

    @patch("socket.getaddrinfo")
    def test_ipv6_loopback_blocked(self, mock_getaddrinfo):
        mock_getaddrinfo.return_value = [
            (socket.AF_INET6, socket.SOCK_STREAM, 0, "", ("::1", 80, 0, 0))
        ]
        with pytest.raises(ValueError, match="internal or private"):
            validate_url("http://[::1]/page")

    @patch("socket.getaddrinfo")
    def test_ipv6_link_local_blocked(self, mock_getaddrinfo):
        mock_getaddrinfo.return_value = [
            (socket.AF_INET6, socket.SOCK_STREAM, 0, "", ("fe80::1", 80, 0, 0))
        ]
        with pytest.raises(ValueError, match="internal or private"):
            validate_url("http://[fe80::1]/page")

    @patch("socket.getaddrinfo")
    def test_public_ip_allowed(self, mock_getaddrinfo):
        mock_getaddrinfo.return_value = [
            (socket.AF_INET, socket.SOCK_STREAM, 0, "", ("93.184.216.34", 80))
        ]
        url = validate_url("http://example.com/page")
        assert url == "http://example.com/page"

    @patch("socket.getaddrinfo")
    def test_dns_resolution_failure(self, mock_getaddrinfo):
        mock_getaddrinfo.side_effect = socket.gaierror("Name or service not known")
        with pytest.raises(ValueError, match="Unable to resolve"):
            validate_url("http://nonexistent.invalid/page")

    @patch("socket.getaddrinfo")
    def test_multiple_ips_one_private_blocked(self, mock_getaddrinfo):
        # If any resolved IP is private, the URL is blocked
        mock_getaddrinfo.return_value = [
            (socket.AF_INET, socket.SOCK_STREAM, 0, "", ("93.184.216.34", 80)),
            (socket.AF_INET, socket.SOCK_STREAM, 0, "", ("10.0.0.1", 80)),
        ]
        with pytest.raises(ValueError, match="internal or private"):
            validate_url("http://example.com/page")


class TestIsPrivateIp:
    def test_loopback(self):
        assert _is_private_ip("127.0.0.1") is True

    def test_private_10(self):
        assert _is_private_ip("10.0.0.1") is True

    def test_private_172(self):
        assert _is_private_ip("172.16.0.1") is True

    def test_private_192(self):
        assert _is_private_ip("192.168.1.1") is True

    def test_link_local_169(self):
        assert _is_private_ip("169.254.169.254") is True

    def test_ipv6_loopback(self):
        assert _is_private_ip("::1") is True

    def test_ipv6_unique_local(self):
        assert _is_private_ip("fc00::1") is True

    def test_ipv6_link_local(self):
        assert _is_private_ip("fe80::1") is True

    def test_unspecified(self):
        assert _is_private_ip("0.0.0.0") is True

    def test_public_ip(self):
        assert _is_private_ip("93.184.216.34") is False

    def test_invalid_ip(self):
        assert _is_private_ip("not-an-ip") is True
