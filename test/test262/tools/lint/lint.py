#!/usr/bin/env python
# Copyright (C) 2017 Mike Pennisi. All rights reserved.
# This code is governed by the BSD license found in the LICENSE file.

import argparse
import sys

from lib.collect_files import collect_files
from lib.checks.frontmatter import CheckFrontmatter
from lib.checks.license import CheckLicense
from lib.eprint import eprint
import lib.frontmatter
import lib.whitelist

parser = argparse.ArgumentParser(description='Test262 linting tool')
parser.add_argument('--whitelist',
        type=argparse.FileType('r'),
        help='file containing expected linting errors')
parser.add_argument('path',
        nargs='+',
        help='file name or directory of files to lint')

checks = [CheckFrontmatter(), CheckLicense()]

def lint(file_names):
    errors = dict()

    for file_name in file_names:
        with open(file_name, 'r') as f:
            content = f.read()
        meta = lib.frontmatter.parse(content)
        for check in checks:
            error = check.run(file_name, meta, content)

            if error is not None:
                if file_name not in errors:
                    errors[file_name] = dict()
                errors[file_name][check.ID] = error

    return errors

if __name__ == '__main__':
    args = parser.parse_args()
    if args.whitelist:
        whitelist = lib.whitelist.parse(args.whitelist)
    else:
        whitelist = dict()

    files = [path for _path in args.path for path in collect_files(_path)]
    file_count = len(files)
    print 'Linting %s file%s.' % (file_count, 's' if file_count != 1 else '')

    all_errors = lint(files)
    unexpected_errors = dict(all_errors)

    for file_name, failures in all_errors.iteritems():
        if file_name not in whitelist:
            continue
        if set(failures.keys()) == whitelist[file_name]:
            del unexpected_errors[file_name]

    error_count = len(unexpected_errors)
    s = 's' if error_count != 1 else ''

    print 'Linting complete. %s error%s found.' % (error_count, s)

    if error_count == 0:
        sys.exit(0)

    for file_name, failures in unexpected_errors.iteritems():
        for ID, message in failures.iteritems():
            eprint('%s: %s - %s' % (file_name, ID, message))

    sys.exit(1)
