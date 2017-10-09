#The communication channel between the UI and the adapter

import sys
import json
import time

class Channel():
    def __init__(self, session):
        self.sequenceNum = 1
        self.TWO_CRLF = "\r\n\r\n"
        self.session = session
        self._requests = {}

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
        self._requests[self.sequenceNum] = message
        js = json.dumps(message)
        length = sys.getsizeof(js) - sys.getsizeof("")

        content = "Content-Length: " + str(length) + self.TWO_CRLF + js
        if process is None:
            print content
        else:
            process.stdin.write(content)
            messages = self._readProcessStdout(process)
            self.session.receiveMessages(messages)

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
        return self._parseMessages(output)

    def _parseMessages(self, text):
        messages = []
        prefix = "Content-Length: "
        while len(text) > 0:
            spIndex = text.index(self.TWO_CRLF)
            if spIndex == -1:
                return []
            header = text[:spIndex]
            clIndex = header.index(prefix)
            assert clIndex == 0 #Content-Length should be the first part of any message
            contentLength = int(header[clIndex + len(prefix):])
            contentStart = spIndex + len(self.TWO_CRLF)
            contentEnd = contentStart + contentLength
            content = text[contentStart:contentEnd]
            assert len(content) == contentLength
            message = self._handleMessage(content)
            if message is not None:
                messages.append(message)
            text = text[contentEnd:]
        return messages

    def _handleMessage(self, rawMessage):
        try:
            message = json.loads(rawMessage)
            return message
        except:
            return None
