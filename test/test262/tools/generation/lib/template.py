# Copyright (C) 2016 the V8 project authors. All rights reserved.
# This code is governed by the BSD license found in the LICENSE file.

import os, re
import codecs, yaml
from collections import OrderedDict

from util.find_comments import find_comments
from util.parse_yaml import parse_yaml
from test import Test

indentPattern = re.compile(r'^(\s*)')
interpolatePattern = re.compile(r'\{\s*(\S+)\s*\}')

def indent(text, prefix = '    ', js_value = False):
    '''Prefix a block of text (as defined by the "line break" control
    character) with some character sequence.

    :param prefix: String value to insert before each line
    :param js_value: If True, the text will be interpreted as a JavaScript
        value, meaning that indentation will not occur for lines that would
        effect the runtime value; defaults to False
    '''

    if isinstance(text, list):
        lines = text
    else:
        lines = text.split('\n')

    indented = [prefix + lines[0]]
    str_char = None

    for line in lines[1:]:
        # Determine if the beginning of the current line is part of some
        # previously-opened literal value.
        if js_value:
            for char in indented[-1]:
                if char == str_char:
                    str_char = None
                elif str_char is None and char in '\'"`':
                    str_char = char

        # Do not indent the current line if it is a continuation of a literal
        # value or if it is empty.
        if str_char or len(line) == 0:
            indented.append(line)
        else:
            indented.append(prefix + line)

    return '\n'.join(indented)

class Template:
    def __init__(self, filename):
        self.filename = filename

        with open(filename) as template_file:
            self.source = template_file.read()

        self.attribs = dict()
        self.regions = []

        self._parse()

    def _remove_comment(self, comment):
        '''Create a region that is not intended to be referenced by any case,
        ensuring that the comment is not emitted in the rendered file.'''
        name = '__remove_comment_' + str(comment['firstchar']) + '__'

        # When a removed comment ends the line, the following newline character
        # should also be removed from the generated file.
        lastchar = comment['lastchar']
        if self.source[lastchar] == '\n':
            comment['lastchar'] = comment['lastchar'] + 1

        self.regions.insert(0, dict(name=name, **comment))

    def _parse(self):
        for comment in find_comments(self.source):
            meta = parse_yaml(comment['source'])

            # Do not emit the template's frontmatter in generated files
            # (file-specific frontmatter is generated as part of the rendering
            # process)
            if meta:
                self.attribs['meta'] = meta
                self._remove_comment(comment)
                continue

            # Do not emit license information in generated files (recognized as
            # comments preceeding the YAML frontmatter)
            if not self.attribs.get('meta'):
                self._remove_comment(comment)
                continue

            match = interpolatePattern.match(comment['source'])

            if match == None:
                continue

            self.regions.insert(0, dict(name=match.group(1), **comment))

    def expand_regions(self, source, context):
        lines = source.split('\n')

        for region in self.regions:
            whitespace = indentPattern.match(lines[region['lineno']]).group(1)
            value = context['regions'].get(region['name'], '')

            str_char = region.get('in_string')
            if str_char:
                safe_char = '"' if str_char == '\'' else '\''
                value = value.replace(str_char, safe_char)
                value = value.replace('\n', '\\\n')

            source = source[:region['firstchar']] + \
                indent(value, whitespace, True).lstrip() + \
                source[region['lastchar']:]

        setup = context['regions'].get('setup')

        if setup:
            source = setup + '\n' + source

        teardown = context['regions'].get('teardown')

        if teardown:
            source += '\n' + teardown + '\n'

        return source

    def _frontmatter(self, case_filename, case_values):
        description = case_values['meta']['desc'].strip() + \
            ' (' + self.attribs['meta']['name'].strip() + ')'
        lines = []

        lines += [
            '// This file was procedurally generated from the following sources:',
            '// - ' + case_filename,
            '// - ' + self.filename,
            '/*---',
            'description: ' + description,
        ]

        esid = self.attribs['meta'].get('esid')
        if esid:
            lines.append('esid: ' + esid)

        es6id = self.attribs['meta'].get('es6id')
        if es6id:
            lines.append('es6id: ' + es6id)

        features = []
        features += case_values['meta'].get('features', [])
        features += self.attribs['meta'].get('features', [])
        features = list(OrderedDict.fromkeys(features))
        if len(features):
            lines += ['features: ' + yaml.dump(features).strip()]

        flags = ['generated']
        flags += case_values['meta'].get('flags', [])
        flags += self.attribs['meta'].get('flags', [])
        flags = list(OrderedDict.fromkeys(flags))
        lines += ['flags: ' + yaml.dump(flags).strip()]

        includes = []
        includes += case_values['meta'].get('includes', [])
        includes += self.attribs['meta'].get('includes', [])
        includes = list(OrderedDict.fromkeys(includes))
        if len(includes):
            lines += ['includes: ' + yaml.dump(includes).strip()]

        if case_values['meta'].get('negative'):
            if self.attribs['meta'].get('negative'):
                raise Exception('Cannot specify negative in case and template file')
            negative = case_values['meta'].get('negative')
        else:
            negative = self.attribs['meta'].get('negative')

        if negative:
            lines += ['negative:']
            as_yaml = yaml.dump(negative,
                                default_flow_style=False)
            lines += indent(as_yaml.strip(), '  ').split('\n')

        info = []

        if 'info' in self.attribs['meta']:
            info.append(indent(self.attribs['meta']['info']))
        if 'info' in case_values['meta']:
            if len(info):
                info.append('')
            info.append(indent(case_values['meta']['info']))

        if len(info):
            lines.append('info: |')
            lines += info

        lines.append('---*/')

        return '\n'.join(lines)

    def expand(self, case_filename, case_name, case_values, encoding):
        frontmatter = self._frontmatter(case_filename, case_values)
        body = self.expand_regions(self.source, case_values)

        return Test(self.attribs['meta']['path'] + case_name + '.js',
            source=codecs.encode(frontmatter + '\n' + body, encoding))
