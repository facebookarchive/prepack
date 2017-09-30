import json
from channel import Inputer, Outputer
from processor import BreakpointProcessor

class Session():
    def __init__(self):
        self.configure()
        self.inputer = Inputer(self.inFileName)
        self.outputer = Outputer(self.outFileName)
        self.breakpointProcessor = BreakpointProcessor(self.inputer, self.outputer)
        self.run = True

    def configure(self):
        configFile = open("./src/debugger/config.json")
        config = json.loads(configFile.read())
        self.inFileName = config["files"]["debugger2proxy"]
        self.outFileName = config["files"]["proxy2debugger"]

    def serve(self):
        self.outputer.addLine("Debugger Attached")

        while self.run:
            command = raw_input("(dbg) ").strip()
            self.inputer.checkPollDispatch(self)
            if not self.run:
                break
            if len(command) == 0:
                continue
            elif command == "exit":
                self.run = False
                break
            parts = command.split(" ")
            op = parts[0]
            if op == "breakpoint":
                self.breakpointProcessor.process(parts[1:])
            elif op == "proceed":
                if self.breakpointProcessor.currentBreak > 0:
                    self.outputer.clearAndOpen()
                    self.outputer.addLine("proceed "+str(self.breakpointProcessor.currentBreak))
                    self.breakpointProcessor.currentBreak = -1
            else:
                print "Invalid command"
        self.shutdown()

    def shutdown(self):
        self.inputer.shutdown()
        self.outputer.shutdown()
