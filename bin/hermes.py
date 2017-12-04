#!/usr/bin/env python

import platform
import subprocess
import sys


def main():
    hermes_args = []
    hermes_linux = hermes_macos = None
    arg_iter = iter(sys.argv[1:])
    try:
        while True:
            arg = arg_iter.next()
            if arg == '--osx':
                hermes_osx = arg_iter.next()
            elif arg == '--linux':
                hermes_linux = arg_iter.next()
            else:
                hermes_args.append(arg)
    except StopIteration:
        pass

    hermes = None
    if platform.system() == 'Darwin':
        hermes = hermes_osx
    elif platform.system() == 'Linux':
        hermes = hermes_linux

    if hermes is None:
        print 'No hermes arg defined for this platform: ' + platform.system()
        sys.exit(-1)

    subprocess.check_call([hermes] + hermes_args)


if __name__ == '__main__':
    main()
