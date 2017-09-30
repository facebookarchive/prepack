from datetime import datetime

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
