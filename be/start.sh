#!/bin/sh
# Container entrypoint: apply DB migrations, then start the API + worker.
set -e
npx prisma migrate deploy
node dist/index.js
