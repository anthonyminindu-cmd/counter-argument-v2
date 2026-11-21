"""Browser checks for opening a friend room from a saved link."""

from urllib.parse import parse_qs, urlparse
from uuid import uuid4

from playwright.sync_api import expect


def check_friend_topic_recovery(page, app, room, capture):
    room_url = app + "/debate/topic/?session="
    suggestion = page.get_by_label("Topic to suggest", exact=True)

    page.goto(room_url + str(uuid4()))
    expect(page.get_by_role("heading", name="This debate is unavailable")).to_be_visible()
    expect(suggestion).to_have_count(0)
    capture(page, "04a-mobile-unavailable-debate")
    page.get_by_role("link", name="Back to friend search", exact=True).click()
    expect(page.get_by_role("heading", name="Debate with a friend", exact=True)).to_be_visible()

    failed_requests = 0
    block_room_requests = True
    route_pattern = "**/rest/v1/debate_sessions?**"

    def simulate_temporary_failure(route):
        nonlocal failed_requests
        url = urlparse(route.request.url)
        matches_room = parse_qs(url.query).get("id") == ["eq." + room]
        if block_room_requests and route.request.method == "GET" and matches_room:
            failed_requests += 1
            route.fulfill(status=503, json={"message": "Temporary test disconnect"})
        else:
            route.continue_()

    page.route(route_pattern, simulate_temporary_failure)
    try:
        page.goto(room_url + room)
        expect(page.get_by_role("heading", name="Could not connect to this debate")).to_be_visible()
        assert failed_requests > 0
        expect(suggestion).to_have_count(0)
        capture(page, "04b-mobile-debate-retry")
        block_room_requests = False
        page.get_by_role("button", name="Try again", exact=True).click()
        expect(suggestion).to_be_visible()
        assert parse_qs(urlparse(page.url).query).get("session") == [room]
        capture(page, "04c-mobile-debate-reconnected")
    finally:
        page.unroute(route_pattern, simulate_temporary_failure)

    print("PASS Missing friend room had a way back, and retry restored a temporarily unavailable room", flush=True)
