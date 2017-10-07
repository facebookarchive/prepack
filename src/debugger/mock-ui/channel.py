#The communication channel between the UI and the adapter

import sys
import json
import time

class Channel():
    def __init__(self):
        self.sequenceNum = 1
        self.TWO_CRLF = "\r\n\r\n"

    def send(self, command, args, process):
        request = {
            "command": command,
            "arguments": args
        }
        self.sendRequest(request, process)

    def sendRequest(self, request, process = None):
        self._sendMessage("request", request, process)

    def sendResponse(self, response, process = None):
        self._sendMessage("response", response, process)

    def _sendMessage(self, typ, message, process):
        assert typ in ["request", "response", "event"]
        message["type"] = typ
        self.sequenceNum+=1
        message["seq"] = self.sequenceNum
        js = json.dumps(message)
        length = sys.getsizeof(js) - sys.getsizeof("")

        content = "Content-Length: " + str(length) + self.TWO_CRLF + js
        if process is None:
            print content
        else:
            process.stdin.write(content)
            print self._readProcessStdout(process)

    def _readProcessStdout(self, process):
        output = ""
        timeWaited = 0
        while True:
            output = ""
            try:
                output += process.stdout.read()
            except IOError:
                pass
            if len(output) > 0 or timeWaited > 1:
                break
            time.sleep(.1)
            timeWaited += .1
        return output
