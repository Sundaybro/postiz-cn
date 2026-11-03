"""Creator commands: post, my-notes, delete."""

import re
from datetime import datetime
from pathlib import Path

import click

from ..command_normalizers import select_topic_payload
from ..exceptions import XhsApiError
from ..formatter import (
    extract_note_id,
    maybe_print_structured,
    print_info,
    print_json,
    print_success,
    render_creator_note_data,
    render_creator_notes,
)
from ..note_refs import save_index_from_notes
from ..publishing import (
    BEIJING,
    DECLARATION_ORIGINS,
    parse_schedule,
    prepare_declaration,
    prepare_location,
    prepare_mentions,
)
from ._common import exit_for_error, handle_command, handle_errors, run_client_action, structured_output_options


def publication_options(command):
    """Options shared by image and video publication."""
    options = [
        (("--schedule",), {"help": "Publish at YYYY-MM-DD HH:MM (Beijing) or ISO8601 with offset; 1h to 14d ahead"}),
        (("--location-id",), {"help": "POI ID from 'xhs locations' (requires name and type)"}),
        (("--location-name",), {"help": "Selected POI name"}),
        (("--location-type",), {"type": click.IntRange(min=0), "help": "Selected poi_type from 'xhs locations'"}),
        (("--location-address",), {"help": "Selected POI full_address"}),
        (("--mention", "mentions"), {"multiple": True, "help": "Exact USER_ID=NICKNAME; repeat for more users"}),
        (("--ai-generated",), {"is_flag": True, "help": "Declare that the note contains AI-synthesized content"}),
        (("--declaration",), {"type": click.Choice(list(DECLARATION_ORIGINS)), "multiple": True,
                               "help": "Native content-type declaration; choose one"}),
        (("--declaration-source",), {"help": "Original source text (requires --declaration repost)"}),
        (("--photo-date",), {"help": "Shooting date YYYY-MM-DD (requires --declaration self-shot)"}),
        (("--photo-location-id",), {"help": "Shooting POI ID; requires self-shot and location name/type"}),
        (("--photo-location-name",), {"help": "Shooting POI name (requires self-shot and location ID/type)"}),
        (("--photo-location-type",), {"type": click.IntRange(min=0), "help": "Shooting poi_type from locations"}),
        (("--photo-location-address",), {"help": "Optional shooting POI address"}),
        (("--dry-run",), {"is_flag": True, "help": "Preview locally; no login, uploads, topic lookup or publication"}),
    ]
    for flags, kwargs in reversed(options):
        command = click.option(*flags, **kwargs)(command)
    return command


def prepare_publication(title, body, media, topics, is_private, **options):
    """Validate everything local before opening a client or uploading any file."""
    post_time = parse_schedule(options["schedule"])
    post_loc = prepare_location(
        options["location_id"], options["location_name"], options["location_type"], options["location_address"],
    )
    body, ats = prepare_mentions(body, options["mentions"])
    declarations = tuple(dict.fromkeys(options.get("declaration", ())))
    if len(declarations) > 1:
        raise XhsApiError("Choose only one --declaration type; conflicting declarations are not allowed")
    declaration = prepare_declaration(
        declarations[0] if declarations else None, ai_generated=options.get("ai_generated", False),
        source=options.get("declaration_source"), photo_date=options.get("photo_date"),
        photo_location_id=options.get("photo_location_id"), photo_location_name=options.get("photo_location_name"),
        photo_location_type=options.get("photo_location_type"),
        photo_location_address=options.get("photo_location_address"),
    )
    paths = [("Image", path) for path in media.get("images", [])]
    if "video" in media:
        paths.append(("Video", media["video"]))
        if Path(media["video"]).suffix.lower() not in {".mp4", ".mov"}:
            raise XhsApiError("Video file must be .mp4 or .mov")
    if media.get("cover"):
        paths.append(("Cover image", media["cover"]))
    for label, path in paths:
        if not Path(path).is_file():
            missing_label = label if label == "Cover image" else f"{label} file"
            raise XhsApiError(f"{missing_label} not found: {path}")
        if Path(path).stat().st_size == 0:
            raise XhsApiError(f"{label} file is empty: {path}")
    return {
        "dry_run": True, "title": title, "body": body, **media, "is_private": is_private,
        "post_time": post_time,
        "scheduled_at": datetime.fromtimestamp(post_time / 1000, BEIJING).isoformat() if post_time else None,
        "post_loc": post_loc, "ats": ats, "declaration": declaration,
        "topic_names": list(dict.fromkeys([*topics, *extract_hashtags(body)]))[:10], "topics_resolved": False,
    }


def resolve_publication_topics(client, body, names):
    topics, tag_map = [], {}
    for name in names:
        payloads = [p for p in select_topic_payload(client.search_topics(name), name) if p.get("id") and p.get("name")]
        if payloads:
            topics.extend(payloads)
            tag_map[name] = payloads[0]["name"]
    return format_body_hashtags(body, tag_map), topics


@click.command("locations")
@click.argument("keyword")
@click.option("--page", default=1, type=click.IntRange(min=1), show_default=True)
@click.option("--page-size", default=30, type=click.IntRange(1, 50), show_default=True)
@click.option("--latitude", default=0.0, type=click.FloatRange(-90, 90), help="Search coordinate; defaults to zero")
@click.option("--longitude", default=0.0, type=click.FloatRange(-180, 180), help="Search coordinate; defaults to zero")
@structured_output_options
@click.pass_context
def locations(ctx, keyword, page, page_size, latitude, longitude, as_json, as_yaml):
    """Find POIs; pass the chosen poi_id, name and poi_type to post/post-video."""
    handle_command(
        ctx, action=lambda client: client.search_locations(keyword, page, page_size, latitude, longitude),
        render=print_json, as_json=as_json, as_yaml=as_yaml,
    )


def extract_hashtags(body: str) -> list[str]:
    """Extract hashtag names from body text.

    Matches '#tag' at start-of-string or preceded by whitespace.
    Does not match URL fragments like 'https://example.com#section'.
    """
    return [tag.removesuffix("[话题]") for tag in re.findall(r"(?:^|(?<=\s))#([^\s#]+)", body)]


def format_body_hashtags(body: str, tag_map: dict[str, str]) -> str:
    """Format hashtag occurrences in body to Xiaohongshu's native '#topic[话题]#' syntax.

    Matches '#tag' at start-of-string or preceded by whitespace.
    Replace complete tokens in one pass, including already-native markup.
    """
    if not tag_map:
        return body

    def replace(match: re.Match[str]) -> str:
        raw_tag = match.group(1).removesuffix("[话题]")
        if raw_tag not in tag_map:
            return match.group(0)
        return f"#{tag_map[raw_tag]}[话题]#"

    return re.sub(r"(?:^|(?<=\s))#([^\s#]+)#?", replace, body)


@click.command()
@click.option("--title", required=True, help="Note title")
@click.option("--body", required=True, help="Note body text")
@click.option("--images", required=True, multiple=True, help="Image file path(s)")
@click.option("--topic", "topics_flag", multiple=True, help="Topic(s)/hashtag(s) to search and attach")
@click.option("--private", "is_private", is_flag=True, help="Publish as private note")
@publication_options
@structured_output_options
@click.pass_context
def post(
    ctx,
    title: str,
    body: str,
    images: tuple[str, ...],
    topics_flag: tuple[str, ...],
    is_private: bool,
    as_json: bool,
    as_yaml: bool,
    dry_run: bool,
    **options,
):
    """Publish an image note."""
    preview = handle_errors(
        lambda: prepare_publication(title, body, {"images": list(images)}, topics_flag, is_private, **options),
        as_json=as_json, as_yaml=as_yaml,
    )
    if dry_run:
        if not maybe_print_structured(preview, as_json=as_json, as_yaml=as_yaml):
            print_json(preview)
        return

    def _publish(client):
        formatted_desc, resolved_topics = resolve_publication_topics(client, preview["body"], preview["topic_names"])
        file_ids = []
        for img_path in images:
            print_info(f"Uploading {img_path}...")
            permit = client.get_upload_permit()
            client.upload_file(permit["fileId"], permit["token"], img_path)
            file_ids.append(permit["fileId"])
            print_success(f"Uploaded: {img_path}")

        return client.create_image_note(
            title=title,
            desc=formatted_desc,
            image_file_ids=file_ids,
            topics=resolved_topics,
            is_private=is_private,
            post_time=preview["post_time"], post_loc=preview["post_loc"], ats=preview["ats"],
            declaration=preview["declaration"],
        )

    handle_command(
        ctx,
        action=_publish,
        render=lambda _data: print_success(f"Note published: {title}" + (" (private)" if is_private else "")),
        as_json=as_json,
        as_yaml=as_yaml,
    )


@click.command("my-notes")
@click.option("--page", default=0, help="Page number (0-indexed)")
@structured_output_options
@click.pass_context
def my_notes(ctx, page: int, as_json: bool, as_yaml: bool):
    """List your own published notes."""
    def _my_notes_action(client):
        data = client.get_creator_note_list(page=page)
        notes = data.get("notes", data.get("note_list", []))
        save_index_from_notes(notes)
        return data

    handle_command(
        ctx,
        action=_my_notes_action,
        render=render_creator_notes,
        as_json=as_json,
        as_yaml=as_yaml,
    )


@click.command("my-notes-data")
@click.option("--page", default=1, help="Page number (1-indexed)")
@click.option("--page-size", default=10, help="Page size")
@structured_output_options
@click.pass_context
def my_notes_data(ctx, page: int, page_size: int, as_json: bool, as_yaml: bool):
    """List your own published notes data."""
    def _my_notes_data_action(client):
        return client.get_creator_note_analyze_list(page_num=page, page_size=page_size)

    handle_command(
        ctx,
        action=_my_notes_data_action,
        render=render_creator_note_data,
        as_json=as_json,
        as_yaml=as_yaml,
    )


@click.command("delete")
@click.argument("id_or_url")
@structured_output_options
@click.option("--yes", "-y", is_flag=True, help="Skip confirmation")
@click.pass_context
def delete(ctx, id_or_url: str, as_json: bool, as_yaml: bool, yes: bool):
    """Delete a note. Experimental: the public web endpoint is unstable."""
    note_id = extract_note_id(id_or_url)

    if not yes:
        click.confirm(f"Delete note {note_id}?", abort=True)

    try:
        data = run_client_action(ctx, lambda client: client.delete_note(note_id))
        if not maybe_print_structured(data, as_json=as_json, as_yaml=as_yaml):
            print_success(f"Deleted note {note_id}")
    except Exception as exc:
        exit_for_error(exc, as_json=as_json, as_yaml=as_yaml)


@click.command("post-video")
@click.option("--title", required=True, help="Video note title")
@click.option("--body", required=True, help="Video note body text")
@click.option("--video", required=True, help="Video file path (.mp4/.mov)")
@click.option("--cover", help="Cover image file path (optional)")
@click.option("--topic", "topics_flag", multiple=True, help="Topic(s)/hashtag(s) to search and attach")
@click.option("--private", "is_private", is_flag=True, help="Publish as private note")
@publication_options
@structured_output_options
@click.pass_context
def post_video(
    ctx,
    title: str,
    body: str,
    video: str,
    cover: str | None,
    topics_flag: tuple[str, ...],
    is_private: bool,
    as_json: bool,
    as_yaml: bool,
    dry_run: bool,
    **options,
):
    """Publish a video note."""
    preview = handle_errors(
        lambda: prepare_publication(title, body, {"video": video, "cover": cover}, topics_flag, is_private, **options),
        as_json=as_json, as_yaml=as_yaml,
    )
    if dry_run:
        if not maybe_print_structured(preview, as_json=as_json, as_yaml=as_yaml):
            print_json(preview)
        return

    def _publish(client):
        formatted_desc, topics = resolve_publication_topics(client, preview["body"], preview["topic_names"])
        # 上传视频
        click.echo(f"Uploading video {video}...", err=True)
        video_permit = client.get_video_upload_permit()
        client.upload_video(video_permit["fileId"], video_permit["token"], video)
        video_file_id = video_permit["fileId"]
        click.echo(f"Uploaded video: {video}", err=True)

        # 上传封面（如果提供）
        cover_file_id = None
        if cover:
            click.echo(f"Uploading cover {cover}...", err=True)
            cover_permit = client.get_upload_permit()
            client.upload_file(cover_permit["fileId"], cover_permit["token"], cover)
            cover_file_id = cover_permit["fileId"]
            click.echo(f"Uploaded cover: {cover}", err=True)

        # 创建视频笔记
        return client.create_video_note(
            title=title,
            desc=formatted_desc,
            video_file_id=video_file_id,
            cover_file_id=cover_file_id,
            topics=topics,
            is_private=is_private,
            post_time=preview["post_time"], post_loc=preview["post_loc"], ats=preview["ats"],
            declaration=preview["declaration"],
        )

    handle_command(
        ctx,
        action=_publish,
        render=lambda _data: print_success(f"Video note published: {title}" + (" (private)" if is_private else "")),
        as_json=as_json,
        as_yaml=as_yaml,
    )
