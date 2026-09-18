"""DSAForge Python test harness.

Runs INSIDE the sandbox (Docker container or WSL namespace jail), never on the
host. Reads one JSON payload from stdin:

    {"code": str, "tests": [{"input": str}], "timeLimitMs": int,
     "memoryLimitMb": int, "outputLimitKb": int, "stopAfterTimeout": bool}

Each test runs the user's code in a fresh child process with rlimits applied.
Expected outputs are never sent here; the Node backend compares results.
Prints exactly one JSON object to stdout.
"""

import json
import math
import os
import resource
import signal
import subprocess
import sys
import tempfile
import threading
import time
import traceback

STDERR_LIMIT_BYTES = 16 * 1024
MAX_PROCESSES = 32
MAX_OPEN_FILES = 64
STACK_LIMIT_BYTES = 64 * 1024 * 1024


def emit(result):
    sys.stdout.write(json.dumps(result))
    sys.stdout.flush()


def format_compile_error(exc):
    lines = traceback.format_exception_only(type(exc), exc)
    return "".join(lines).strip()


def make_limiter(time_limit_ms, memory_limit_mb, output_limit_kb):
    cpu_seconds = max(1, math.ceil(time_limit_ms / 1000))
    memory_bytes = memory_limit_mb * 1024 * 1024
    output_bytes = output_limit_kb * 1024

    limits = [
        (resource.RLIMIT_CPU, (cpu_seconds, cpu_seconds + 1)),
        (resource.RLIMIT_AS, (memory_bytes, memory_bytes)),
        (resource.RLIMIT_FSIZE, (output_bytes, output_bytes)),
        (resource.RLIMIT_NPROC, (MAX_PROCESSES, MAX_PROCESSES)),
        (resource.RLIMIT_NOFILE, (MAX_OPEN_FILES, MAX_OPEN_FILES)),
        (resource.RLIMIT_STACK, (STACK_LIMIT_BYTES, STACK_LIMIT_BYTES)),
        (resource.RLIMIT_CORE, (0, 0)),
    ]

    def apply_limits():
        for limit, value in limits:
            try:
                resource.setrlimit(limit, value)
            except (ValueError, OSError):
                pass

    return apply_limits


def read_capped(path, limit):
    with open(path, "rb") as handle:
        data = handle.read(limit + 1)
    truncated = len(data) > limit
    return data[:limit].decode("utf-8", errors="replace"), truncated


def run_test(solution_path, workdir, test_input, options):
    time_limit_ms = options["timeLimitMs"]
    output_limit_bytes = options["outputLimitKb"] * 1024
    in_path = os.path.join(workdir, "stdin.txt")
    out_path = os.path.join(workdir, "stdout.txt")
    err_path = os.path.join(workdir, "stderr.txt")

    with open(in_path, "w", encoding="utf-8") as handle:
        handle.write(test_input)

    child_env = {
        "PATH": "/usr/local/bin:/usr/bin:/bin",
        "LANG": "C.UTF-8",
        "PYTHONIOENCODING": "utf-8",
        "PYTHONDONTWRITEBYTECODE": "1",
        "HOME": workdir,
    }

    with open(in_path, "rb") as stdin, open(out_path, "wb") as stdout, open(err_path, "wb") as stderr:
        started = time.perf_counter()
        proc = subprocess.Popen(
            [sys.executable, "-I", "-B", solution_path],
            stdin=stdin,
            stdout=stdout,
            stderr=stderr,
            cwd=workdir,
            env=child_env,
            preexec_fn=make_limiter(time_limit_ms, options["memoryLimitMb"], options["outputLimitKb"]),
            start_new_session=True,
            close_fds=True,
        )

        wall_timed_out = threading.Event()

        def kill_on_timeout():
            wall_timed_out.set()
            try:
                os.killpg(proc.pid, signal.SIGKILL)
            except ProcessLookupError:
                pass

        # Wall-clock guard catches code that sleeps or blocks without using CPU.
        timer = threading.Timer(time_limit_ms / 1000 + 1.5, kill_on_timeout)
        timer.start()
        _, status, usage = os.wait4(proc.pid, 0)
        timer.cancel()
        timer.join()
        wall_ms = (time.perf_counter() - started) * 1000
        proc.returncode = status

        # Clean up anything the solution may have spawned.
        try:
            os.killpg(proc.pid, signal.SIGKILL)
        except (ProcessLookupError, PermissionError):
            pass

    stdout_text, _ = read_capped(out_path, output_limit_bytes)
    stderr_text, _ = read_capped(err_path, STDERR_LIMIT_BYTES)
    output_size = os.path.getsize(out_path)

    exit_code = os.WEXITSTATUS(status) if os.WIFEXITED(status) else None
    term_signal = os.WTERMSIG(status) if os.WIFSIGNALED(status) else None
    cpu_ms = (usage.ru_utime + usage.ru_stime) * 1000

    return {
        "stdout": stdout_text,
        "stderr": stderr_text,
        "exitCode": exit_code,
        "signal": term_signal,
        "timeMs": round(cpu_ms, 1),
        "wallMs": round(wall_ms, 1),
        "memoryKb": usage.ru_maxrss,
        "timedOut": wall_timed_out.is_set()
        or term_signal == signal.SIGXCPU
        or cpu_ms > time_limit_ms,
        "outputLimitExceeded": term_signal == signal.SIGXFSZ or output_size >= output_limit_bytes,
        "memoryLimitExceeded": "MemoryError" in stderr_text,
    }


def main():
    payload = json.load(sys.stdin)
    code = payload["code"]
    options = {
        "timeLimitMs": int(payload.get("timeLimitMs", 2000)),
        "memoryLimitMb": int(payload.get("memoryLimitMb", 256)),
        "outputLimitKb": int(payload.get("outputLimitKb", 256)),
    }

    try:
        compile(code, "solution.py", "exec")
    except (SyntaxError, ValueError) as exc:
        emit({"compileError": format_compile_error(exc), "results": []})
        return

    workdir = tempfile.mkdtemp(prefix="run-", dir="/tmp")
    solution_path = os.path.join(workdir, "solution.py")
    with open(solution_path, "w", encoding="utf-8") as handle:
        handle.write(code)

    results = []
    for test in payload.get("tests", []):
        result = run_test(solution_path, workdir, test.get("input", ""), options)
        results.append(result)
        if result["timedOut"] and payload.get("stopAfterTimeout", True):
            break

    emit({
        "compileError": None,
        "results": results,
        "runtime": "Python " + sys.version.split()[0],
    })


if __name__ == "__main__":
    try:
        main()
    except Exception:  # Report harness failures instead of dying silently.
        emit({"internalError": traceback.format_exc(), "results": []})
