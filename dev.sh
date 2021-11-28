#!/bin/sh
set -e

docker rm -f fashion-segmentation-dev
docker build -t fashion-segmentation-dev .
docker run -it -p 5000:5000 -v /tmp/upload_tmp:/upload_tmp/ --name=fashion-segmentation-dev fashion-segmentation-dev
