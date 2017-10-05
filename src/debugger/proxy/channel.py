from datetime import datetime

class Channel():
    def __init__(self, inFileName, outFileName, session):
        self.inFileName = inFileName
        self.outFileName = outFileName
        open(inFileName, "w").close()
        open(outFileName, "w").close()
        self.session = session
        self.responseReceived = False
        self.lastRequest = None
        self.lastResponse = None

    def readIn(self):
        self.inFile = open(self.inFileName, "r")
        line = self.inFile.read().strip()
        self.inFile.close()
        if len(line) > 0:
            open(self.inFileName,"w").close()
            self.responseReceived = True
        return line

    def writeOut(self, contents):
        self.responseReceived = False
        self.outFile = open(self.outFileName, "w")
        self.outFile.write(contents)
        self.lastRequest = contents
        self.outFile.close()

        threshold = 1
        lastPoll = datetime.now()
        while not self.responseReceived:
            diff = datetime.now() - lastPoll
            if diff.seconds >= threshold:
                self.lastResponse = self.readIn()
                lastPoll = datetime.now()
        return self.lastResponse
