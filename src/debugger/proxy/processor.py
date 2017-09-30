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
