# A representation of a debugging session from which commands can be sent

from channel import Channel
import subprocess
import fcntl, os

class Session():
    def __init__(self, adapterPath):
        self.run = True
        self.channel = Channel()
        self.adapterPath = adapterPath
        self.adapterProcess = None

    def serve(self):
        self.startAdapter()
        while self.run:
            line = raw_input("(dbg) ").strip()
            if len(line) == 0:
                continue
            line = line.split()
            command = line[0]
            args = line[1:]
            if command == "exit":
                self.shutdown()
            elif command == "send":
                self.channel.sendRequest({"txt":args[0]})
            elif command == "init":
                self.channel.send('initialize', {
                    "clientID": 'CLI',
                    "adapterID": 'Prepack',
                    "linesStartAt1": True,
                    "columnsStartAt1": True,
                    "supportsVariableType": True,
                    "supportsVariablePaging": False,
                    "supportsRunInTerminalRequest": False,
                    "pathFormat": 'path',
                }, self.adapterProcess)

    def startAdapter(self):
        self.adapterProcess = subprocess.Popen(["node", self.adapterPath], stdin = subprocess.PIPE, stdout = subprocess.PIPE)
        fcntl.fcntl(self.adapterProcess.stdout.fileno(), fcntl.F_SETFL, os.O_NONBLOCK)

    def shutdown(self):
        self.adapterProcess.kill()
        self.run = False
