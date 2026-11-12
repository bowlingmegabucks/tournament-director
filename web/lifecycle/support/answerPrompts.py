"""Run a command on a pseudo-terminal and type the answers it asks for.

The first-admin script refuses piped input on purpose (a password must not be echoed or piped), so
the lifecycle test gives it a real terminal. Usage:

    LIFECYCLE_ANSWERS='[["Email:","a@b.c"],["Name:","A"]]' python3 -I answerPrompts.py -- cmd args

Each pair is a prompt to wait for and the reply to type. The answers come from the environment, not
the command line, so they stay out of the process list. Prints what the command wrote (it echoes no
password) and exits with its status.
"""
import json
import os
import pty
import select
import sys

answers = json.loads(os.environ["LIFECYCLE_ANSWERS"])
command = sys.argv[sys.argv.index("--") + 1 :]

# The test runs one command: npm, to start the app's own script. Refuse anything else, so a stray
# argument cannot make this driver start another program.
if command[:1] != ["npm"]:
    print("Only npm may run here.", file=sys.stderr)
    sys.exit(2)

pid, fd = pty.fork()
if pid == 0:
    os.execvp(command[0], command)

seen = ""
step = 0
while True:
    ready, _, _ = select.select([fd], [], [], 60)
    if not ready:
        print("Timed out waiting for the command.", file=sys.stderr)
        os.kill(pid, 9)
        sys.exit(124)
    try:
        chunk = os.read(fd, 4096).decode("utf-8", errors="replace")
    except OSError:
        break
    if chunk == "":
        break
    sys.stdout.write(chunk)
    sys.stdout.flush()
    seen += chunk
    if step < len(answers) and answers[step][0] in seen:
        os.write(fd, (answers[step][1] + "\r").encode())
        seen = ""
        step += 1

_, status = os.waitpid(pid, 0)
sys.exit(os.waitstatus_to_exitcode(status))
