class Processor(object):
    def __init__(self, channel):
        self.channel = channel

    #Need to be overridden by each child processor
    def extractArgs(self, argsList):
        return None

    #Need to be overridden by each child processor
    def process(self, argsList):
        return None

class BreakpointProcessor(Processor):
    def __init__(self, channel):
        super(BreakpointProcessor, self).__init__(channel)
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
            response = self.channel.writeOut("breakpoint add %d"%lineNum)
        elif kind == "remove":
            response = self.channel.writeOut("breakpoint remove %d"%lineNum)
        elif kind == "enable":
            response = self.channel.writeOut("breakpoint enable %d"%lineNum)
        elif kind == "disable":
            response = self.channel.writeOut("breakpoint disable %d"%lineNum)
