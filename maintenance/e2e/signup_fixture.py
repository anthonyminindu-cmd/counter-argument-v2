"""Complete the ordinary 18+ birthday screen for synthetic adult QA accounts."""
import json
from urllib.request import Request, urlopen


def adult_fixture_metadata(api, key, display_name):
    request = Request(api + "/rest/v1/rpc/dk_check_signup_birthday",
                      data=json.dumps({"p_birthday": "1990-06-15"}).encode(),
                      headers={"apikey": key, "Content-Type": "application/json"})
    with urlopen(request, timeout=20) as response:
        result = json.load(response)
    if result.get("status") != "eligible" or not result.get("ticket"):
        raise RuntimeError("Synthetic adult QA signup could not obtain an age check")
    return {"display_name": display_name, "dk_signup_pass": result["ticket"]}
