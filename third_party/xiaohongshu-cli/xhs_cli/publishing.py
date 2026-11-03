"""Shared publication validation and request fields; no network or account state."""

from __future__ import annotations

import json
import re
from collections.abc import Sequence
from datetime import datetime, timedelta, timezone
from typing import Any

from .exceptions import XhsApiError

# Fixed UTC+8 avoids requiring a system tzdata database on Windows.
BEIJING = timezone(timedelta(hours=8), "Asia/Shanghai")
DECLARATION_ORIGINS = {"none": 0, "fiction": 1, "ai": 2, "marketing": 3, "self-shot": 4, "repost": 5}


def _declaration_text(value: Any, label: str) -> str:
    if not isinstance(value, str) or not value.strip() or any(ord(c) < 32 for c in value):
        raise XhsApiError(f"{label} must be non-empty text without control characters")
    return value.strip()


def _photo_date(value: Any) -> str:
    if not isinstance(value, str) or not re.fullmatch(r"\d{4}-\d{2}-\d{2}", value):
        raise XhsApiError("Photo date must use YYYY-MM-DD")
    try:
        when = datetime.strptime(value, "%Y-%m-%d").date()
    except ValueError as exc:
        raise XhsApiError("Photo date is not a valid calendar date") from exc
    if when > datetime.now(BEIJING).date():
        raise XhsApiError("Photo date cannot be in the future (Beijing time)")
    return value


def validate_declaration(value: dict[str, Any] | None) -> dict[str, Any] | None:
    """Validate and copy the official userDeclarationBind, including nested metadata."""
    if value is None:
        return None
    if not isinstance(value, dict) or type(value.get("origin")) is not int or value["origin"] not in range(6):
        raise XhsApiError("Declaration origin must be an integer from 0 to 5")
    origin = value["origin"]
    allowed = {"origin"} | ({"photoInfo"} if origin == 4 else {"repostInfo"} if origin == 5 else set())
    if value.keys() - allowed:
        raise XhsApiError("Unknown declaration fields or metadata incompatible with its type")
    result: dict[str, Any] = {"origin": origin}
    if "repostInfo" in value:
        info = value["repostInfo"]
        if not isinstance(info, dict) or info.keys() != {"source"}:
            raise XhsApiError("Repost metadata requires only a source field")
        result["repostInfo"] = {"source": _declaration_text(info["source"], "Declaration source")}
    if "photoInfo" in value:
        info = value["photoInfo"]
        if not isinstance(info, dict) or info.keys() - {"photoTime", "photoPlace"}:
            raise XhsApiError("Unknown or invalid self-shot photo metadata")
        photo: dict[str, Any] = {}
        if "photoTime" in info:
            photo["photoTime"] = _photo_date(info["photoTime"])
        if "photoPlace" in info:
            place = info["photoPlace"]
            required = {"poiId", "poiType", "name"}
            if not isinstance(place, dict) or not required <= place.keys() or place.keys() - required - {"subname"}:
                raise XhsApiError("Photo location requires poiId, poiType and name")
            if type(place["poiType"]) is not int or place["poiType"] < 0:
                raise XhsApiError("Photo location poiType must be a non-negative integer")
            address = place.get("subname", "")
            if not isinstance(address, str) or any(ord(c) < 32 for c in address):
                raise XhsApiError("Photo location address must be text without control characters")
            photo["photoPlace"] = {
                "poiId": _declaration_text(place["poiId"], "Photo location ID"), "poiType": place["poiType"],
                "name": _declaration_text(place["name"], "Photo location name"), "subname": address.strip(),
            }
        result["photoInfo"] = photo
    return result


def prepare_declaration(
    declaration: str | None = None, *, ai_generated: bool = False, source: str | None = None,
    photo_date: str | None = None, photo_location_id: str | None = None, photo_location_name: str | None = None,
    photo_location_type: int | None = None, photo_location_address: str | None = None,
) -> dict[str, Any] | None:
    if ai_generated:
        if declaration not in (None, "ai"):
            raise XhsApiError("--ai-generated conflicts with the selected --declaration")
        declaration = "ai"
    if declaration is not None and declaration not in DECLARATION_ORIGINS:
        raise XhsApiError("Unknown content declaration type")
    location = (photo_location_id, photo_location_name, photo_location_type, photo_location_address)
    has_location = any(v is not None for v in location)
    if source is not None and declaration != "repost":
        raise XhsApiError("--declaration-source requires --declaration repost")
    if (photo_date is not None or has_location) and declaration != "self-shot":
        raise XhsApiError("Photo metadata requires --declaration self-shot")
    if declaration is None:
        return None
    result: dict[str, Any] = {"origin": DECLARATION_ORIGINS[declaration]}
    if source is not None:
        result["repostInfo"] = {"source": source}
    photo: dict[str, Any] = {}
    if photo_date is not None:
        photo["photoTime"] = photo_date
    if has_location:
        if photo_location_id is None or photo_location_name is None or photo_location_type is None:
            raise XhsApiError(
                "Photo location requires --photo-location-id, --photo-location-name and --photo-location-type",
            )
        place = prepare_location(*location)
        photo["photoPlace"] = {
            "poiId": place["poi_id"], "poiType": place["poi_type"], "name": place["name"], "subname": place["subname"],
        }
    if photo:
        result["photoInfo"] = photo
    return validate_declaration(result)


def validate_post_time(post_time: int | None, *, now: datetime | None = None) -> None:
    if post_time is None:
        return
    if isinstance(post_time, bool) or not isinstance(post_time, int):
        raise XhsApiError("Scheduled time must be an integer millisecond timestamp")
    current_ms = int((now or datetime.now(timezone.utc)).timestamp() * 1000)
    if not current_ms + 3600000 <= post_time <= current_ms + 14 * 86400000:
        raise XhsApiError("Scheduled time must be between 1 hour and 14 days from now (Beijing time)")


def parse_schedule(value: str | None, *, now: datetime | None = None) -> int | None:
    if value is None:
        return None
    value = value.strip()
    if not re.match(r"^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}", value):
        raise XhsApiError("Use --schedule 'YYYY-MM-DD HH:MM' (Beijing time) or an ISO8601 time with offset")
    try:
        when = datetime.fromisoformat(value.replace("Z", "+00:00"))
        if when.tzinfo is None:
            when = when.replace(tzinfo=BEIJING)
        result = int(when.timestamp() * 1000)
    except (ValueError, OverflowError) as exc:
        raise XhsApiError("Invalid scheduled date/time") from exc
    validate_post_time(result, now=now)
    return result


def prepare_mentions(body: str, mentions: Sequence[str]) -> tuple[str, list[dict[str, str]]]:
    users: dict[str, str] = {}
    names: dict[str, str] = {}
    for value in mentions:
        uid, sep, name = value.partition("=")
        uid, name = uid.strip(), name.strip()
        if not sep or not re.fullmatch(r"[0-9a-fA-F]{24}", uid) or not name or any(
            ord(char) < 32 or char in "@#\ufeff" for char in name
        ):
            raise XhsApiError("Use --mention USER_ID=NICKNAME; nickname cannot contain @, # or control characters")
        uid = uid.lower()
        if (uid in users and users[uid] != name) or (name in names and names[name] != uid):
            raise XhsApiError("Conflicting mention IDs/nicknames; select one exact account for each nickname")
        users[uid], names[name] = name, uid
    ats = [{"user_id": uid, "nickname": name, "name": name} for uid, name in users.items()]
    missing = [
        f"@{name}" for name in users.values()
        if not re.search(r"(?<![A-Za-z0-9_@/])@" + re.escape(name) + r"(?![\w@]|\.[A-Za-z0-9_])", body)
    ]
    if missing:
        body = body.rstrip() + ("\n\n" if body.strip() else "") + " ".join(missing)
    return body, ats


def prepare_location(
    poi_id: str | None, name: str | None, poi_type: int | None, address: str | None,
) -> dict[str, Any]:
    if poi_id is None and name is None and poi_type is None and address is None:
        return {}
    if not poi_id or not poi_id.strip() or not name or not name.strip() or poi_type is None or poi_type < 0:
        raise XhsApiError("Location requires --location-id, --location-name and --location-type from 'xhs locations'")
    return {"poi_id": poi_id.strip(), "poi_type": poi_type, "name": name.strip(), "subname": address or ""}


def note_common(
    title: str, desc: str, topics: list[dict[str, str]] | None, is_private: bool,
    *, note_type: str, post_time: int | None = None, post_loc: dict[str, Any] | None = None,
    ats: list[dict[str, str]] | None = None, declaration: dict[str, Any] | None = None,
) -> dict[str, Any]:
    validate_post_time(post_time)
    location = prepare_location(
        post_loc.get("poi_id"), post_loc.get("name"), post_loc.get("poi_type"), post_loc.get("subname"),
    ) if post_loc else {}
    desc, validated_ats = prepare_mentions(desc, [
        f"{user.get('user_id', '')}={user.get('nickname', '')}" for user in (ats or [])
    ])
    binds: dict[str, Any] = {
        "version": 1, "noteId": 0, "noteOrderBind": {}, "notePostTiming": {"postTime": post_time},
        "noteCollectionBind": {"id": ""},
    }
    if post_time is not None:
        binds["bizType"] = 13
    declaration = validate_declaration(declaration)
    if declaration is not None:
        binds["userDeclarationBind"] = declaration
    return {
        "type": note_type, "title": title, "note_id": "", "desc": desc,
        "source": '{"type":"web","ids":"","extraInfo":"{\\"subType\\":\\"official\\"}"}',
        "business_binds": json.dumps(binds, ensure_ascii=False), "ats": validated_ats,
        "hash_tag": topics or [], "post_loc": location,
        "privacy_info": {"op_type": 1, "type": 1 if is_private else 0},
    }
