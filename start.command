#!/bin/bash
# Double-click to preview the site locally (3D scenes need to be served over http, not opened as files).
cd "$(dirname "$0")"
PORT=8742
( sleep 1; open "http://localhost:$PORT/index.html" ) &
echo "Allotar site running at http://localhost:$PORT — close this window to stop."
python3 -m http.server $PORT
