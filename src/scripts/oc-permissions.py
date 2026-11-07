#!/usr/bin/env python3
"""oc-permissions — manage opencode's saved ("always allow") permissions.

Read and delete only. A saved permission is created by one keystroke in a
session ("allow always") and persists silently, which makes them easy to
accumulate and hard to audit; this tool is the audit. Deliberate allows
belong in config `permissions` rules — this tool never creates.

All access goes through the official API (`opencode api`); the database is
never touched, and the unparametrized saved-permission listing is never
trusted (it returns an empty default even when rows exist).
"""

from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path

HOME = str(Path.home())


def warn(message: str) -> None:
    print(f"oc-permissions: warning: {message}", file=sys.stderr)


def shorten_home(text: str) -> str:
    if text == HOME:
        return "~"
    if text.startswith(HOME + "/"):
        return "~" + text[len(HOME):]
    return text


# --- domain objects ----------------------------------------------------------


@dataclass(frozen=True)
class Project:
    """A project known to opencode, keyed by canonical checkout path."""

    id: str
    canonical: str

    @property
    def is_global(self) -> bool:
        return False

    def label(self) -> str:
        if self.canonical == HOME:
            return "~"
        return Path(self.canonical).name or self.canonical

    def order_key(self) -> tuple:
        return (1, self.canonical)


@dataclass(frozen=True)
class GlobalProject:
    """The everywhere-scope, as a null object: it answers every question a
    Project answers, so no `is global` checks appear anywhere else."""

    id: str = "global"

    @property
    def canonical(self) -> None:
        return None

    @property
    def is_global(self) -> bool:
        return True

    def label(self) -> str:
        return "(global)"

    def order_key(self) -> tuple:
        return (0, "")


GLOBAL = GlobalProject()


@dataclass(frozen=True)
class SavedPermission:
    """One saved ("always allow") row. Owns its cell content only."""

    id: str
    action: str
    resource: str
    project: Project | GlobalProject
    created_ms: int | None

    @classmethod
    def from_api(cls, row: dict, project: Project | GlobalProject) -> SavedPermission:
        created = (row.get("time") or {}).get("created")
        return cls(
            id=str(row.get("id", "")),
            action=str(row.get("action", "")),
            resource=str(row.get("resource", "")),
            project=project,
            created_ms=created if isinstance(created, int) else None,
        )

    def created_date(self) -> str:
        if self.created_ms is None:
            return "?"
        return datetime.fromtimestamp(self.created_ms / 1000).strftime("%Y-%m-%d")

    def resource_label(self) -> str:
        return shorten_home(self.resource)

    def describe(self) -> str:
        """The one-line display the removal gate shows before deleting."""
        return "  ".join([
            self.action,
            self.resource_label(),
            self.project.label(),
            f"since {self.created_date()}",
        ])


# --- errors -------------------------------------------------------------------


class OcError(Exception):
    """A user-facing failure: printed to stderr, exit status 1."""


class UnknownProjectRef(OcError):
    pass


class AmbiguousProjectRef(OcError):
    def __init__(self, text: str, matches: list) -> None:
        lines = [f'"{text}" matches {len(matches)} projects — be more specific:']
        lines += [f"  {project.id}  {project.canonical}" for project in matches]
        super().__init__("\n".join(lines))


class RowNotFound(OcError):
    pass


class AmbiguousRow(OcError):
    def __init__(self, text: str, matches: list) -> None:
        lines = [
            f'"{text}" matches {len(matches)} saved permissions — be more specific:'
        ]
        lines += [f"  #{number}  {row.describe()}" for number, row in matches]
        super().__init__("\n".join(lines))


# --- store (the API gateway) ---------------------------------------------------


class PermissionStore:
    """Gateway to opencode's saved permissions through the official API.

    Policies owned here: every query passes an explicit projectID; the
    project list is load-bearing (its failure is fatal); per-project query
    failures are the sweep's problem — `all_saved` warns and continues so
    an audit always returns something. Deletion trusts the exit status and
    never parses the response body.
    """

    def projects(self) -> list[Project]:
        payload = self._get("/api/project")
        if not isinstance(payload, list):
            raise RuntimeError("unexpected /api/project response shape")
        projects = []
        for entry in payload:
            pid = entry.get("id")
            canonical = entry.get("canonical")
            if not pid or pid == "global" or not canonical:
                continue  # the global scope is queried separately, as GLOBAL
            projects.append(Project(id=pid, canonical=canonical))
        return projects

    def saved(self, project: Project | GlobalProject) -> list[SavedPermission]:
        """Rows for one scope. Raises RuntimeError; callers own the policy."""
        payload = self._get(f"/api/permission/saved?projectID={project.id}")
        rows = payload.get("data", []) if isinstance(payload, dict) else payload
        if not isinstance(rows, list):
            return []
        return [SavedPermission.from_api(row, project) for row in rows]

    def all_saved(self, projects: list[Project]) -> list[SavedPermission]:
        """Sweep every project plus global, in parallel. Query failures warn
        (in sweep order) and contribute no rows."""
        targets = [*projects, GLOBAL]
        with ThreadPoolExecutor(max_workers=8) as pool:
            results = list(pool.map(self._saved_or_error, targets))
        rows: list[SavedPermission] = []
        failures = []
        for project, result in zip(targets, results):
            if isinstance(result, RuntimeError):
                failures.append(
                    f"query failed for {project.label()} — skipped ({result})"
                )
            else:
                rows.extend(result)
        for message in failures:
            warn(message)
        return rows

    def _saved_or_error(self, project: Project | GlobalProject):
        try:
            return self.saved(project)
        except RuntimeError as exc:
            return exc

    def delete(self, permission: SavedPermission) -> None:
        self._run("delete", f"/api/permission/saved/{permission.id}")

    # -- transport, private --

    def _run(self, *args: str) -> str:
        proc = subprocess.run(
            ["opencode", "api", *args], capture_output=True, text=True
        )
        if proc.returncode != 0:
            detail = (proc.stderr or proc.stdout).strip()
            raise RuntimeError(f"`opencode api {' '.join(args)}` failed: {detail}")
        return proc.stdout

    def _get(self, path: str):
        try:
            return json.loads(self._run("get", path))
        except json.JSONDecodeError as exc:
            raise RuntimeError(f"unparseable response from {path}: {exc}") from exc


# --- location -------------------------------------------------------------------


@dataclass(frozen=True)
class LocationContext:
    """Where the CLI is running: the matching projects and the scenario."""

    projects: tuple
    scenario: str  # "known" | "fresh" | "none"

    def notice(self) -> str | None:
        if self.scenario == "fresh":
            return (
                "this project is new to opencode — nothing saved under it yet; "
                "showing global rules; --all for everything"
            )
        if self.scenario == "none":
            return (
                "not in a known project — showing global rules; "
                "--all for the full audit"
            )
        return None

    def scope(self) -> frozenset:
        """Effective-here: this location's projects plus global."""
        return frozenset((*self.projects, GLOBAL))


class LocationResolver:
    """cwd → opencode project.

    Resolution uses the nearest git toplevel (no repo: cwd itself), never
    an ancestor walk: ~ is itself a registered non-git project here, and
    ancestor-walking would resolve nearly every unregistered directory
    under it to "home".
    """

    def resolve(self, projects: list[Project]) -> LocationContext:
        toplevel = self._git_toplevel()
        here = os.path.realpath(toplevel or os.getcwd())
        matches = tuple(
            p for p in projects if os.path.realpath(p.canonical) == here
        )
        if matches:
            return LocationContext(matches, "known")
        return LocationContext((), "fresh" if toplevel else "none")

    @staticmethod
    def _git_toplevel() -> str | None:
        try:
            proc = subprocess.run(
                ["git", "rev-parse", "--show-toplevel"],
                capture_output=True,
                text=True,
            )
        except OSError:
            return None
        return proc.stdout.strip() if proc.returncode == 0 else None


# --- project references ---------------------------------------------------------


class ProjectRef:
    """A `--project REF`: the literal `global`, a project ID, a canonical
    path, a basename, or `.` — resolved as a chain of steps. A step that
    matches one project resolves; a step that matches several refuses with
    the candidates; a step that matches none defers to the next."""

    def __init__(self, text: str) -> None:
        self.text = text

    def resolve(self, projects: list[Project]) -> Project | GlobalProject:
        steps = (
            self._global_literal,
            self._id_prefix,
            self._path,
            self._basename,
            self._cwd,
        )
        for step in steps:
            matches = step(projects)
            if len(matches) == 1:
                return matches[0]
            if len(matches) > 1:
                raise AmbiguousProjectRef(self.text, matches)
        if self.text == ".":
            raise UnknownProjectRef(
                "not inside a project known to opencode (use --all, or an explicit ref)"
            )
        raise UnknownProjectRef(
            f'unknown project "{self.text}" '
            "(accepted: global, project ID, canonical path, basename, or '.')"
        )

    def _global_literal(self, projects: list[Project]) -> list:
        return [GLOBAL] if self.text == "global" else []

    def _id_prefix(self, projects: list[Project]) -> list:
        return [p for p in projects if p.id.startswith(self.text)]

    def _path(self, projects: list[Project]) -> list:
        if not (
            self.text.startswith(("/", "~"))
            or self.text.startswith(("./", "../"))
        ):
            return []  # bare names are basenames, not cwd-relative paths
        ref = os.path.realpath(os.path.expanduser(self.text))
        prefix = ref.rstrip(os.sep) + os.sep
        return [
            p
            for p in projects
            if os.path.realpath(p.canonical) == ref
            or os.path.realpath(p.canonical).startswith(prefix)
        ]

    def _basename(self, projects: list[Project]) -> list:
        return [p for p in projects if Path(p.canonical).name == self.text]

    def _cwd(self, projects: list[Project]) -> list:
        context = LocationResolver().resolve(projects)
        return list(context.projects)


# --- collection -----------------------------------------------------------------


@dataclass(frozen=True)
class NumberedRow:
    number: int
    row: SavedPermission


class PermissionCollection:
    """All saved permissions in one deterministic order.

    A row's number is its position in this full ordering, so every view —
    filtered or not — shows the same number for the same row, and `remove`
    never needs to know which view produced a number.
    """

    def __init__(self, rows: list[SavedPermission]) -> None:
        self._numbered = tuple(
            NumberedRow(number, row)
            for number, row in enumerate(sorted(rows, key=self._order_key), start=1)
        )

    @staticmethod
    def _order_key(row: SavedPermission) -> tuple:
        return (row.project.order_key(), row.action, row.resource, row.id)

    def numbered(self) -> tuple:
        """The full audit view."""
        return self._numbered

    def in_scope(self, scope: frozenset) -> tuple:
        """Rows whose project is in scope, keeping their global numbers."""
        return tuple(
            entry for entry in self._numbered if entry.row.project in scope
        )

    def find(self, ref: str) -> SavedPermission:
        """A remove reference: a row number, or a full/unique ID prefix."""
        if ref.isascii() and ref.isdigit():
            return self._by_number(int(ref))
        return self._by_id_prefix(ref)

    def _by_number(self, number: int) -> SavedPermission:
        for entry in self._numbered:
            if entry.number == number:
                return entry.row
        valid = f"1-{len(self._numbered)}" if self._numbered else "none exist"
        raise RowNotFound(f"no saved permission numbered {number} (valid: {valid})")

    def _by_id_prefix(self, prefix: str) -> SavedPermission:
        matches = [
            (entry.number, entry.row)
            for entry in self._numbered
            if entry.row.id.startswith(prefix)
        ]
        if len(matches) == 1:
            return matches[0][1]
        if not matches:
            raise RowNotFound(f'no saved permission matches "{prefix}"')
        raise AmbiguousRow(prefix, matches)


# --- the removal gate --------------------------------------------------------------


class Confirmation:
    """The safety-critical policy, in one place.

    The row is always displayed first. Then: `--yes` proceeds (the command
    file allows it only after the user's explicit in-conversation
    approval); a non-TTY context without `--yes` refuses — an agent cannot
    silently bypass the gate; a TTY gets [y/N], default no.
    """

    def __init__(self, assume_yes: bool = False, stream=None) -> None:
        self._assume_yes = assume_yes
        self._stream = stream if stream is not None else sys.stdin

    def confirm(self, permission: SavedPermission) -> bool:
        # flush: keep the row display ahead of the stderr refusal when
        # stdout is a captured pipe instead of a line-buffered terminal
        print(f"  {permission.describe()}", flush=True)
        print(flush=True)
        if self._assume_yes:
            return True
        if not self._stream.isatty():
            print(
                "refusing to remove without confirmation in a non-interactive "
                "context (pass --yes only with the user's explicit approval)",
                file=sys.stderr,
            )
            return False
        answer = input("Remove this saved permission? [y/N] ").strip().lower()
        return answer in ("y", "yes")


# --- presentation -----------------------------------------------------------------


class Table:
    """Layout only — dynamic column widths, the --ids variant. Cell content
    belongs to the entities."""

    HEADERS = ("#", "ACTION", "RESOURCE", "PROJECT", "CREATED")

    def __init__(self, show_ids: bool = False) -> None:
        self.show_ids = show_ids

    def render(self, entries) -> str:
        headers = list(self.HEADERS)
        if self.show_ids:
            headers.insert(1, "ID")
        table = [headers]
        for entry in entries:
            cells = [
                str(entry.number),
                entry.row.action,
                entry.row.resource_label(),
                entry.row.project.label(),
                entry.row.created_date(),
            ]
            if self.show_ids:
                cells.insert(1, entry.row.id)
            table.append(cells)
        widths = [max(len(cell) for cell in column) for column in zip(*table)]
        lines = [
            "  ".join(cell.ljust(width) for cell, width in zip(cells, widths)).rstrip()
            for cells in table
        ]
        return "\n".join(lines)


def footer(entries) -> str:
    rows = [entry.row for entry in entries]
    count = len(rows)
    text = f"{count} saved permission{'s' if count != 1 else ''}"
    scopes = {row.project for row in rows}
    if len(scopes) > 1:
        return f"{text} across {len(scopes)} projects"
    return text


# --- commands ---------------------------------------------------------------------


class ListCommand:
    def __init__(self, store: PermissionStore) -> None:
        self.store = store

    def run(self, args: argparse.Namespace) -> int:
        if getattr(args, "project", None) is not None:
            return self._run_ref(getattr(args, "project"), getattr(args, "ids", False))
        if getattr(args, "all", False):
            return self._run_all(getattr(args, "ids", False))
        return self.run_default(getattr(args, "ids", False))

    def run_default(self, show_ids: bool = False) -> int:
        projects = self.store.projects()
        context = LocationResolver().resolve(projects)
        notice = context.notice()
        if notice:
            print(notice)
        collection = PermissionCollection(self.store.all_saved(projects))
        self._present(collection.in_scope(context.scope()), show_ids)
        return 0

    def _run_ref(self, ref: str, show_ids: bool) -> int:
        projects = self.store.projects()
        project = ProjectRef(ref).resolve(projects)
        collection = PermissionCollection(self.store.all_saved(projects))
        self._present(collection.in_scope(frozenset({project})), show_ids)
        return 0

    def _run_all(self, show_ids: bool) -> int:
        projects = self.store.projects()
        collection = PermissionCollection(self.store.all_saved(projects))
        self._present(collection.numbered(), show_ids)
        return 0

    @staticmethod
    def _present(entries, show_ids: bool) -> None:
        if not entries:
            print("no saved permissions")
            return
        print(Table(show_ids).render(entries))
        print()
        print(footer(entries))


class RemoveCommand:
    def __init__(self, store: PermissionStore) -> None:
        self.store = store

    def run(self, args: argparse.Namespace) -> int:
        projects = self.store.projects()
        collection = PermissionCollection(self.store.all_saved(projects))
        permission = collection.find(args.ref)
        if not Confirmation(assume_yes=args.yes).confirm(permission):
            return 1
        self.store.delete(permission)
        print("Removed.")
        print()
        ListCommand(self.store).run_default()
        return 0


# --- CLI ---------------------------------------------------------------------------


def _build_parser() -> argparse.ArgumentParser:
    # The list flags live on a shared parent so they work with or without
    # the word "list" (`oc-permissions --all` == `oc-permissions list --all`).
    # SUPPRESS defaults keep a subparser's defaults from clobbering values
    # the main parser already parsed.
    list_flags = argparse.ArgumentParser(add_help=False)
    list_flags.add_argument(
        "--all",
        action="store_true",
        default=argparse.SUPPRESS,
        help="full audit: every project's rules plus global",
    )
    list_flags.add_argument(
        "--project",
        metavar="REF",
        default=argparse.SUPPRESS,
        help="strict scope: global, project ID, canonical path, basename, or '.'",
    )
    list_flags.add_argument(
        "--ids",
        action="store_true",
        default=argparse.SUPPRESS,
        help="include full permission IDs in the table",
    )

    parser = argparse.ArgumentParser(
        prog="oc-permissions",
        description='manage opencode\'s saved ("always allow") permissions',
        epilog=(
            "Manages only the saved store — rules persisted by an "
            '"always allow" keystroke. Deliberate allows belong in config '
            "`permissions` rules; this tool never creates. All access goes "
            "through the official API; the database is never touched."
        ),
        parents=[list_flags],
    )
    subparsers = parser.add_subparsers(dest="command")
    subparsers.add_parser(
        "list", parents=[list_flags], help="list saved permissions (default)"
    )
    remove = subparsers.add_parser("remove", help="remove a saved permission")
    remove.add_argument(
        "ref", help="row number, or a full/unique permission ID prefix"
    )
    remove.add_argument(
        "--yes",
        action="store_true",
        help="skip the confirmation prompt (non-interactive use only)",
    )
    return parser


def main(argv=None) -> int:
    args = _build_parser().parse_args(argv)
    store = PermissionStore()
    try:
        if args.command == "remove":
            return RemoveCommand(store).run(args)
        return ListCommand(store).run(args)
    except OcError as exc:
        print(f"oc-permissions: {exc}", file=sys.stderr)
        return 1
    except RuntimeError as exc:
        print(f"oc-permissions: fatal: {exc}", file=sys.stderr)
        return 1
    except KeyboardInterrupt:
        print(file=sys.stderr)
        return 130


if __name__ == "__main__":
    sys.exit(main())
