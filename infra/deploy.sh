#!/bin/bash
# Read from standard input over SSH: no command here may read standard input.
set -e
image=$1
previous=$(docker inspect --format '{{.Config.Image}}' tasks || true)

start() {
  docker run -d --name tasks --restart unless-stopped -p 80:3000 \
    --memory 512m --log-driver journald "$1"
}

docker pull "$image"
if [ -n "$previous" ]; then
  docker stop tasks
  docker rm tasks
fi
if start "$image" && curl -fsS --retry 30 --retry-delay 1 --retry-all-errors http://localhost/health; then
  docker image prune -af
else
  echo "health check failed; starting $previous again" >&2
  docker logs tasks
  docker rm -f tasks
  start "$previous"
  exit 1
fi
