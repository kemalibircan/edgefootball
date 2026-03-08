"""
Quick crawlability / broken-link self-check helper.

Usage (from project root):

    python scripts/check_sitemap_links.py --base-url https://your-domain.com --limit 500

What it does:
  - Fetches the sitemap index at `${base_url}/sitemap.xml`
  - Discovers all nested sitemap files
  - Reads `<loc>` entries from each sitemap
  - Issues lightweight HEAD requests (falling back to GET on failure)
  - Reports any URLs with non-2xx status codes

Notes:
  - This script is for **manual checks in staging/production**, not for hot paths.
  - It is intentionally conservative and respects an optional `--limit` argument.
"""

from __future__ import annotations

import argparse
import sys
import textwrap
from typing import Iterable, List, Set
from urllib.parse import urljoin
import xml.etree.ElementTree as ET

import requests


def _fetch(url: str, timeout: float = 10.0) -> requests.Response:
  """GET wrapper with basic error surfacing."""
  try:
    resp = requests.get(url, timeout=timeout)
    resp.raise_for_status()
    return resp
  except Exception as exc:  # pragma: no cover - utility script
    raise RuntimeError(f"Failed to fetch {url}: {exc}") from exc


def _head_or_get(url: str, timeout: float = 8.0) -> requests.Response:
  """Prefer HEAD but fall back to GET on servers that do not support it well."""
  try:
    resp = requests.head(url, allow_redirects=True, timeout=timeout)
    if resp.status_code < 400:
      return resp
  except Exception:
    # Fall back to GET below
    pass

  resp = requests.get(url, allow_redirects=True, timeout=timeout)
  return resp


def _parse_xml_locations(xml_text: str, tag_name: str) -> List[str]:
  """Extract <loc> contents from sitemap or sitemap index XML."""
  try:
    root = ET.fromstring(xml_text)
  except ET.ParseError as exc:  # pragma: no cover - manual script
    raise RuntimeError(f"Failed to parse XML: {exc}") from exc

  # Namespace-agnostic search
  ns = {"sm": "http://www.sitemaps.org/schemas/sitemap/0.9"}
  locs: List[str] = []
  for elem in root.findall(f".//sm:{tag_name}/sm:loc", ns):
    text = (elem.text or "").strip()
    if text:
      locs.append(text)
  if not locs:
    # Fallback without namespaces
    for elem in root.iter(tag_name):
      for child in elem:
        if child.tag.lower().endswith("loc"):
          text = (child.text or "").strip()
          if text:
            locs.append(text)
  return locs


def _iter_sitemap_urls(base_url: str) -> Iterable[str]:
  index_url = urljoin(base_url.rstrip("/") + "/", "sitemap.xml")
  index_resp = _fetch(index_url)
  sitemap_urls = _parse_xml_locations(index_resp.text, "sitemap")
  if not sitemap_urls:
    # Single sitemap index is also acceptable; treat it as urlset
    url_locs = _parse_xml_locations(index_resp.text, "url")
    for loc in url_locs:
      yield loc
    return

  seen: Set[str] = set()
  for sm_url in sitemap_urls:
    if sm_url in seen:
      continue
    seen.add(sm_url)
    resp = _fetch(sm_url)
    url_locs = _parse_xml_locations(resp.text, "url")
    for loc in url_locs:
      yield loc


def main(argv: list[str] | None = None) -> int:
  parser = argparse.ArgumentParser(
    description="Quickly check for obvious broken links by walking sitemap.xml.",
    formatter_class=argparse.RawDescriptionHelpFormatter,
    epilog=textwrap.dedent(
      """
      Examples:
        python scripts/check_sitemap_links.py --base-url https://edgefootball.ai
        python scripts/check_sitemap_links.py --base-url https://edgefootball.ai --limit 300
      """
    ),
  )
  parser.add_argument(
    "--base-url",
    required=True,
    help="Base site URL, e.g. https://edgefootball.ai",
  )
  parser.add_argument(
    "--limit",
    type=int,
    default=500,
    help="Maximum number of sitemap URLs to probe (default: 500).",
  )
  parser.add_argument(
    "--timeout",
    type=float,
    default=8.0,
    help="Per-request timeout in seconds (default: 8.0).",
  )

  args = parser.parse_args(argv)
  base_url = args.base_url.strip()
  limit = max(1, int(args.limit or 1))
  timeout = float(args.timeout or 8.0)

  print(f"Base URL: {base_url}")
  print(f"Reading sitemap index at: {urljoin(base_url.rstrip('/') + '/', 'sitemap.xml')}")
  print(f"Max URLs to probe: {limit}")
  print()

  failures: List[tuple[str, int]] = []
  checked = 0

  for loc in _iter_sitemap_urls(base_url):
    if checked >= limit:
      break
    checked += 1
    try:
      resp = _head_or_get(loc, timeout=timeout)
      status = resp.status_code
    except Exception as exc:  # pragma: no cover - manual script
      print(f"[ERROR] {loc} -> {exc}")
      failures.append((loc, 0))
      continue

    if status >= 400:
      print(f"[FAIL] {status} {loc}")
      failures.append((loc, status))
    else:
      print(f"[OK]   {status} {loc}")

  print()
  print(f"Checked {checked} URL(s).")
  if failures:
    print(f"Found {len(failures)} failing URL(s):")
    for loc, status in failures:
      label = status or "ERR"
      print(f"  - [{label}] {loc}")
    return 1

  print("No obvious broken links detected within the checked subset.")
  return 0


if __name__ == "__main__":  # pragma: no cover - manual entrypoint
  raise SystemExit(main())













