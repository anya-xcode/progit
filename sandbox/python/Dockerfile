# DSAForge Python sandbox image.
# Build:  docker build -t dsaforge-python-runner sandbox/python
# The backend runs it with --network none, --read-only, memory/pids limits,
# all capabilities dropped and a non-root user (see dockerProvider.js).
FROM python:3.12-slim

COPY runner.py /sandbox/runner.py
RUN chmod 444 /sandbox/runner.py

USER 65534:65534
WORKDIR /tmp
ENTRYPOINT ["python3", "-I", "-B", "/sandbox/runner.py"]
