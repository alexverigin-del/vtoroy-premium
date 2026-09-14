FROM debian:bookworm-slim

RUN apt-get update \
 && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
      ca-certificates ffmpeg libvips-tools python3 \
 && rm -rf /var/lib/apt/lists/* \
 && useradd --uid 10001 --no-create-home --shell /usr/sbin/nologin sanitizer

COPY --chown=root:root sanitizer.py /opt/isvoi/sanitizer.py

ENV VIPS_CONCURRENCY=1 OMP_NUM_THREADS=1 MAGICK_THREAD_LIMIT=1
USER 10001:10001
EXPOSE 8080
ENTRYPOINT ["python3", "/opt/isvoi/sanitizer.py"]
