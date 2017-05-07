#!/usr/bin/env python
# Copyright (C) 2017 Mike Pennisi. All rights reserved.
# This code is governed by the BSD license found in the LICENSE file.

import shutil, subprocess, sys, os, unittest, tempfile

testDir = os.path.dirname(os.path.relpath(__file__))
OUT_DIR = os.path.join(testDir, 'out')
ex = os.path.join(testDir, '..', 'lint.py')

class TestLinter(unittest.TestCase):
    maxDiff = None

    def fixture(self, name, content):
        fspath = os.path.join(OUT_DIR, name)
        with open(fspath, 'w') as f:
            f.write(content)
        return fspath

    def lint(self, args):
        args[:0] = [ex]
        sp = subprocess.Popen(args, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        stdout, stderr = sp.communicate()
        return dict(stdout=stdout, stderr=stderr, returncode=sp.returncode)

    def setUp(self):
        os.mkdir(OUT_DIR)

    def tearDown(self):
        shutil.rmtree(OUT_DIR, ignore_errors=True)

    def test_no_file(self):
        result = self.lint(['non-existent-file.js'])
        self.assertNotEqual(result["returncode"], 0)

    def test_whitelist_single(self):
        test_content = ('// Copyright (C) 2017 Mike Pennisi. All rights reserved.\n' +
            '// This code is governed by the BSD license found in the LICENSE file.')
        test_file = self.fixture('input.js', test_content)
        whitelist_content = test_file + ' FRONTMATTER'
        whitelist_file = self.fixture('lint.whitelist', whitelist_content)

        result = self.lint([test_file])

        self.assertNotEqual(result['returncode'], 0)

        result = self.lint(['--whitelist', whitelist_file, test_file])

        self.assertEqual(result['returncode'], 0)

    def test_whitelist_comment(self):
        test_content = ('// Copyright (C) 2017 Mike Pennisi. All rights reserved.\n' +
            '// This code is governed by the BSD license found in the LICENSE file.')
        test_file = self.fixture('input.js', test_content)
        whitelist_content = ('# One comment\n' +
            '# Another comment\n' +
            test_file + ' FRONTMATTER')
        whitelist_file = self.fixture('lint.whitelist', whitelist_content)

        result = self.lint([test_file])

        self.assertNotEqual(result['returncode'], 0)

        result = self.lint(['--whitelist', whitelist_file, test_file])

        self.assertEqual(result['returncode'], 0)

def create_file_test(name, fspath):
    '''Dynamically generate a function that may be used as a test method with
    the Python `unittest` module.'''

    def test(self):
        with open(fspath, 'r') as f:
            contents = f.read()
        expected, input = contents.split('^ expected errors | v input\n')
        expected = expected.split()
        tmp_file = self.fixture(name, input)
        result = self.lint([tmp_file])
        if len(expected) == 0:
            self.assertEqual(result['returncode'], 0)
            self.assertEqual(result['stderr'], '')
        else:
            self.assertNotEqual(result['returncode'], 0)
            for err in expected:
                self.assertIn(err, result['stderr'])

    return test

dirname = os.path.join(os.path.abspath(testDir), 'fixtures')
for file_name in os.listdir(dirname):
    full_path = os.path.join(dirname, file_name)
    if not os.path.isfile(full_path) or file_name.startswith('.'):
        continue

    t = create_file_test(file_name, full_path)
    t.__name__ = 'test_' + file_name
    setattr(TestLinter, t.__name__, t)

if __name__ == '__main__':
    unittest.main()
