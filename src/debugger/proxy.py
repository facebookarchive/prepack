from datetime import datetime
import sys
import json

class Processor(object):
    def __init__(self, inputer, outputer):
        self.inputer = inputer
        self.outputer = outputer

    #Need to be overridden by each child processor
    def extractArgs(self, argsList):
        return None

    #Need to be overridden by each child processor
    def process(self, argsList):
        return None

class BreakpointProcessor(Processor):
    def __init__(self, inputer, outputer):
        super(BreakpointProcessor, self).__init__(inputer, outputer)
        self.currentBreak = -1

    def extractArgs(self, argsList):
        assert(len(argsList) == 2)
        kind = argsList[0]
        assert(kind in ["add", "remove", "enable", "disable"])
        lineNum = int(argsList[1])
        return kind, lineNum

    def process(self, argsList):
        kind, lineNum = self.extractArgs(argsList)
        if kind == "add":
            self.outputer.addLine("breakpoint add %d"%lineNum)
        elif kind == "remove":
            self.outputer.addLine("breakpoint remove %d"%lineNum)
        elif kind == "enable":
            self.outputer.addLine("breakpoint enable %d"%lineNum)
        elif kind == "disable":
            self.outputer.addLine("breakpoint disable %d"%lineNum)

class Inputer():
    def __init__(self, inFileName):
        self.fileName = inFileName
        open(inFileName, "w").close() #clear the contents of the file
        self.file = open(inFileName, "r")
        self.lastPoll = datetime.now()
        self.threshold = 1 #time in seconds before polling file again

    def shutdown(self):
        self.file.close()
        open(self.fileName,"w").close()

    def checkPollDispatch(self, session):
        current = datetime.now()
        diff = datetime.now() - self.lastPoll
        if diff.seconds > self.threshold:
            self.rereadFile(session)

    def rereadFile(self, session):
        self.file.close()
        self.file = open(self.fileName, "r")
        while True:
            try:
                line = self.file.readline().strip()
                if len(line) == 0:
                    break
                line = line.split()
                self.dispatch(session, line)
            except EOFError:
                break

    def dispatch(self, session, commands):
        command = commands[0]
        if command == "breakpoint":
            session.breakpointProcessor.currentBreak = int(commands[1])
        elif command == "Program":
            if commands[1] == "finished":
                session.run = False

class Outputer():
    def __init__(self, outFileName):
        self.fileName = outFileName
        open(outFileName,"w").close()
        self.file = open(outFileName, "w")

    def shutdown(self):
        self.file.close()
        open(self.fileName, "w").close()

    def addLine(self, line):
        self.file.write(line+"\n")
        self.file.flush()

    def clearAndOpen(self):
        self.file.close()
        self.file = open(self.fileName, "w")

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

def main():
    session = Session()
    session.serve()
if __name__ == "__main__":
    main()
