from pathlib import Path
from zipfile import ZipFile,ZIP_DEFLATED
import base64
from PIL import Image
files={"01-friend-proposal.jpg":"original/01-desktop-friend-proposal.jpg","02-mobile-positions.jpg":"original/08-mobile-both-views.jpg","03-mobile-points.jpg":"original/10-mobile-resumed-points.jpg","04-rankings.jpg":"original/04-desktop-rankings.jpg","05-finished-poster.jpg":"original/05-desktop-poster.jpg","06-latest.jpg":"current/published-latest.jpg","07-trending.jpg":"current/published-trending.jpg","08-saved-comment.jpg":"current/persisted-reader-comment.jpg","09-persona-comments.jpg":"current/fictional-community-replies.jpg"}
with ZipFile("Differ-Kindly-QA-screenshots.zip","w",compression=ZIP_DEFLATED) as z:
    for title,path in files.items():
        if Path(path).is_file():
            with Image.open(path) as im:
                im.verify()
            z.write(path,title)
data=Path("Differ-Kindly-QA-screenshots.zip").read_bytes()
from hashlib import sha256
print("EVIDENCE_SHA",sha256(data).hexdigest(),len(data))
for start in range(0,len(data),3000):
    print("QAIMAGE",start,base64.b64encode(data[start:start+3000]).decode())
