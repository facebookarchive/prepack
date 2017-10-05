import json
from channel import Channel
from processor import BreakpointProcessor

class Session():
    def __init__(self):
        self.configure()
        self.channel = Channel(self.inFileName, self.outFileName, self)
        self.breakpointProcessor = BreakpointProcessor(self.channel)
        self.preRun = True
        self.run = False
        self.postRun = False

    def configure(self):
        configFile = open("./src/debugger/config.json")
        config = json.loads(configFile.read())
        self.inFileName = config["files"]["debugger2proxy"]
        self.outFileName = config["files"]["proxy2debugger"]

    def dispatchRunResponse(self, response):
        parts = response.split(" ")
        if parts[0] == "breakpoint":
            assert(len(parts) == 3)
            if parts[1] == "stopped":
                lineNum = int(parts[2])
                print "Stopped for breakpoint on line",lineNum
                self.breakpointProcessor.currentBreak = lineNum

    def serve(self):
        response = self.channel.writeOut("Debugger Attached")
        assert(response == "Ready")
        while self.preRun:
            command = raw_input("(dbg) ")
            if len(command) == 0:
                continue
            elif command == "exit":
                self.preRun = False
                break
            elif command == "run":
                response = self.channel.writeOut("Run")
                if response == "Finished":
                    self.preRun = False
                    break
                self.preRun = False
                self.run = True
                self.dispatchRunResponse(response)
                break
            parts = command.split(" ")
            op = parts[0]
            if op == "breakpoint":
                self.breakpointProcessor.process(parts[1:])

        while self.run:
            command = raw_input("(dbg) ")
            if len(command) == 0:
                continue
            if command == "exit":
                self.run = False
                self.postRun = True
                break
            parts = command.split(" ")
            op = parts[0]
            if op == "run":
                if self.breakpointProcessor.currentBreak > 0:
                    response = self.channel.writeOut("proceed "+str(self.breakpointProcessor.currentBreak))
                    self.breakpointProcessor.currentBreak = -1
                    if response == "Finished":
                        self.run = False
                        break
                    self.dispatchRunResponse(response)
            else:
                print "Invalid command"
