"""Shared primitives for fetching and analysing OpenCode pricing. Stdlib only — no third-party dependencies."""

import re
import sys
import urllib.request
from html.parser import HTMLParser
from urllib.error import HTTPError, URLError

SOURCES = {
    "go": {
        "url": "https://opencode.ai/v2/docs/console/go/",
        "table_heading": "Usage limits",
        "has_limit": True,
    },
}

STRIKETHROUGH_PATTERN = re.compile(r"~~.*?~~")
BOLD_PRICE_PATTERN = re.compile(r"\*\*\$(\d+)\*\*")
PLAIN_PRICE_PATTERN = re.compile(r"\$(\d+)")
PRICE_PATTERN = re.compile(r"\$([0-9]+(?:\.[0-9]+)?)")
USER_AGENT = "opencode-pricing/1.0"


def fetch_page(url: str) -> str:
    """Fetch a URL and return its UTF-8 decoded body, exiting on failure."""
    req = urllib.request.Request(
        url,
        headers={"User-Agent": USER_AGENT},
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            return resp.read().decode("utf-8")
    except HTTPError as e:
        print(f"Error: HTTP {e.code} fetching {url}", file=sys.stderr)
        sys.exit(1)
    except URLError as e:
        print(f"Error: Failed to connect - {e.reason}", file=sys.stderr)
        sys.exit(1)
    except UnicodeDecodeError:
        print("Error: Unable to decode response as UTF-8", file=sys.stderr)
        sys.exit(1)


def try_fetch_page(url: str) -> str | None:
    """Fetch a URL, returning None instead of exiting on failure."""
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            return resp.read().decode("utf-8")
    except (HTTPError, URLError, UnicodeDecodeError):
        return None


class _GoPricingTableParser(HTMLParser):
    """Collect tables as (aria_label, rows) with markdown-ish cell text.

    <strong>/<b> -> **...**, <s>/<del>/<strike> -> ~~...~~,
    <small> -> <small>...</small>, <br> -> space, all else stripped.
    """

    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.tables: list[tuple[str | None, list[list[str]]]] = []
        self._aria: str | None = None
        self._in_table = False
        self._rows: list[list[str]] = []
        self._current_row: list[str] | None = None
        self._cell_parts: list[str] | None = None

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        tag = tag.lower()
        if tag == "table":
            self._in_table = True
            self._rows = []
            self._aria = None
            for name, value in attrs:
                if name.lower() == "aria-label" and value is not None:
                    self._aria = value
        elif not self._in_table:
            return
        elif tag == "tr":
            self._current_row = []
        elif tag in ("th", "td"):
            self._cell_parts = []
        elif self._cell_parts is not None:
            if tag in ("strong", "b"):
                self._cell_parts.append("**")
            elif tag in ("s", "del", "strike"):
                self._cell_parts.append("~~")
            elif tag == "small":
                self._cell_parts.append("<small>")
            elif tag == "br":
                self._cell_parts.append(" ")

    def handle_endtag(self, tag: str) -> None:
        tag = tag.lower()
        if tag == "table" and self._in_table:
            self.tables.append((self._aria, self._rows))
            self._in_table = False
            self._rows = []
            self._current_row = None
            self._cell_parts = None
        elif not self._in_table:
            return
        elif tag == "tr":
            if self._current_row is not None:
                self._rows.append(self._current_row)
            self._current_row = None
        elif tag in ("th", "td"):
            if self._cell_parts is not None and self._current_row is not None:
                text = "".join(self._cell_parts)
                text = re.sub(r"\s+", " ", text).strip()
                self._current_row.append(text)
            self._cell_parts = None
        elif self._cell_parts is not None:
            if tag in ("strong", "b"):
                self._cell_parts.append("**")
            elif tag in ("s", "del", "strike"):
                self._cell_parts.append("~~")
            elif tag == "small":
                self._cell_parts.append("</small>")

    def handle_data(self, data: str) -> None:
        if self._in_table and self._cell_parts is not None:
            self._cell_parts.append(data)


def _extract_html_table(
    html: str, table_heading: str
) -> tuple[list[str], list[list[str]]]:
    """Extract header/rows from the first table after a heading."""
    heading_pos = html.find(table_heading)
    if heading_pos == -1:
        print(f"Error: Section '## {table_heading}' not found", file=sys.stderr)
        sys.exit(1)
    sub = html[heading_pos:]
    parser = _GoPricingTableParser()
    parser.feed(sub)
    parser.close()
    if not parser.tables:
        print(f"Error: No table found under '## {table_heading}'", file=sys.stderr)
        sys.exit(1)
    for aria, rows in parser.tables:
        if aria == "Go model pricing":
            if not rows:
                print(
                    f"Error: No table found under '## {table_heading}'",
                    file=sys.stderr,
                )
                sys.exit(1)
            return rows[0], rows[1:]
    rows = parser.tables[0][1]
    if not rows:
        print(f"Error: No table found under '## {table_heading}'", file=sys.stderr)
        sys.exit(1)
    return rows[0], rows[1:]


def extract_table(
    markdown: str, table_heading: str
) -> tuple[list[str], list[list[str]]]:
    """Extract the header cells and data rows of a markdown or HTML table section."""
    if "<table" in markdown.lower():
        return _extract_html_table(markdown, table_heading)
    heading_line = f"## {table_heading}"
    lines = markdown.splitlines()

    section_start = None
    for i, line in enumerate(lines):
        if line.strip() == heading_line:
            section_start = i + 1
            break

    if section_start is None:
        print(f"Error: Section '{heading_line}' not found", file=sys.stderr)
        sys.exit(1)

    table_lines: list[str] = []
    for line in lines[section_start:]:
        stripped = line.strip()
        if stripped.startswith("|"):
            table_lines.append(stripped)
        elif table_lines:
            break

    if len(table_lines) < 2:
        print(f"Error: No table found under '{heading_line}'", file=sys.stderr)
        sys.exit(1)

    def split_row(line: str) -> list[str]:
        return [cell.strip() for cell in line.strip("|").split("|")]

    header_cells = split_row(table_lines[0])
    data_rows = [
        split_row(line)
        for line in table_lines[1:]
        if not re.match(r"^\|[\s:|-]+\|$", line)
    ]

    return header_cells, data_rows


def parse_monthly_limit(cell: str) -> float:
    """Parse a dollar monthly limit from a cell, preferring bold values."""
    if "unlimited" in cell.lower():
        return float("inf")
    cleaned = STRIKETHROUGH_PATTERN.sub("", cell)
    bold_match = BOLD_PRICE_PATTERN.search(cleaned)
    if bold_match:
        return int(bold_match.group(1))
    plain_match = PLAIN_PRICE_PATTERN.search(cleaned)
    if plain_match:
        return int(plain_match.group(1))
    return 0


def parse_price(cell: str) -> float | None:
    """Parse a per-token price from a cell, returning None when absent."""
    if "free" in cell.lower():
        return 0.0
    cleaned = STRIKETHROUGH_PATTERN.sub("", cell).replace("**", "")
    if cleaned.strip() == "-":
        return None
    match = PRICE_PATTERN.search(cleaned)
    if not match:
        return None
    return float(match.group(1))


def filter_rows(
    header: list[str], rows: list[list[str]], min_limit: int
) -> list[list[str]]:
    """Return rows whose monthly limit meets or exceeds min_limit."""
    monthly_index = None
    for i, col in enumerate(header):
        if col.lower() == "monthly limit":
            monthly_index = i
            break

    if monthly_index is None:
        print("Error: 'Monthly limit' column not found", file=sys.stderr)
        sys.exit(1)

    return [
        row
        for row in rows
        if monthly_index < len(row)
        and parse_monthly_limit(row[monthly_index]) >= min_limit
    ]


def format_table(header: list[str], rows: list[list[str]]) -> str:
    """Render header and rows as a markdown table string."""
    lines = [
        "| " + " | ".join(header) + " |",
        "|" + "|".join("---" for _ in header) + "|",
    ]
    for row in rows:
        lines.append("| " + " | ".join(row) + " |")
    return "\n".join(lines)


def compute_effective(
    input_price: float,
    output_price: float,
    cache_read: float,
    ratio: float,
    output_share: float = 0.0,
) -> tuple[float, float]:
    """Compute effective input and blended per-million-token costs.

    ratio is a fraction in 0..1 (not a percentage) of tokens served from cache.
    """
    eff_input = ratio * cache_read + (1 - ratio) * input_price
    blended = eff_input + output_share * output_price
    return (eff_input, blended)
