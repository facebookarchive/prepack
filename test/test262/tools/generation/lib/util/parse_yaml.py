# Copyright (C) 2016 the V8 project authors. All rights reserved.
# This code is governed by the BSD license found in the LICENSE file.

import yaml, re

yamlPattern = re.compile(r'\---\n([\s]*)((?:\s|\S)*)[\n\s*]---',
                         flags=re.DOTALL|re.MULTILINE)

def parse_yaml(string):
    match = yamlPattern.match(string)
    if not match:
        return False

    unindented = re.sub('^' + match.group(1), '',
        match.group(2), flags=re.MULTILINE)

    return yaml.safe_load(unindented)
