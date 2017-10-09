from message import Message

class Response(Message):
    def __init__(self, command, request_seq, success, body):
        self.command = command
        self.request_seq = request_seq
        self.success = success
        self.body = body

    @staticmethod
    def makeResponse(message):
        command = None
        request_seq = None
        success = None
        body = None
        if "command" in message:
            command = message["command"]
        if "request_seq" in message:
            request_seq = message["request_seq"]
        if "success" in message:
            success = message["success"]
        if "body" in message:
            body = message["body"]
        return Response(command, request_seq, success, body)

    def toDict(self):
        return {
            "command": self.command,
            "request_seq": self.request_seq,
            "success": self.success,
            "body": self.body
        }
