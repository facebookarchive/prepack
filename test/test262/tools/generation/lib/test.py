# Copyright (C) 2016 the V8 project authors. All rights reserved.
# This code is governed by the BSD license found in the LICENSE file.

import os, re

from util.find_comments import find_comments
from util.parse_yaml import parse_yaml

class Test:
    """Representation of a generated test. Specifies a file location which may
    or may not exist."""
    def __init__(self, file_name, source=None):
        self.file_name = file_name
        self.source = source
        self.attribs = dict(meta=None)

        if self.source:
            self._parse()

    def load(self, prefix = None):
        location = os.path.join(prefix or '', self.file_name)
        with open(location) as handle:
            self.source = handle.read()
        self._parse()

    def _parse(self):
        for comment in find_comments(self.source):
            meta = parse_yaml(comment['source'])
            if meta:
                self.attribs['meta'] = meta
                break

    def is_generated(self):
        if not self.attribs['meta']:
            return False
        flags = self.attribs['meta'].get('flags')

        if not flags:
            return False

        return 'generated' in flags

    def to_string(self):
        return '\n'.join([
            '/**',
            ' * ----------------------------------------------------------------',
            ' * ' + self.file_name,
            ' * ----------------------------------------------------------------',
            ' */',
            self.source,
            '\n'])

    def write(self, prefix, parents=False):
        location = os.path.join(prefix, self.file_name)
        path = os.path.dirname(location)
        if not os.path.exists(path):
            if parents:
                os.makedirs(path)
            else:
                raise Exception('Directory does not exist: ' + path)

        with open(location, 'w') as handle:
            handle.write(self.source)
