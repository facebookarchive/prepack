from message import Message

class Event(Message):
    def __init__(self, name, seq):
        super(Event, self).__init__("event")
        self.name = name
        self.seq = seq

    @staticmethod
    def makeEvent(message):
        name = None
        seq = None
        if "event" in message:
            name = message["event"]
        elif "seq" in message:
            seq = message["seq"]
        return Event(name, seq)
