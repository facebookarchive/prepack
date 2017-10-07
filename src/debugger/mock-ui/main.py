# Entry point into the mock debug UI which is a CLI from which commands can be
# issued to the adapter

import sys
from session import Session

def main():
    args = sys.argv
    assert len(args) == 2
    adapterPath = args[1]
    s = Session(adapterPath)
    s.serve()

if __name__ == "__main__":
    main()
