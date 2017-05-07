#!/usr/bin/env python
# Copyright (C) 2016 the V8 project authors. All rights reserved.
# This code is governed by the BSD license found in the LICENSE file.

import shutil, subprocess, sys, os, unittest

testDir = os.path.dirname(os.path.relpath(__file__))
OUT_DIR = os.path.join(testDir, 'out')
EXPECTED_DIR = os.path.join(testDir, 'expected')
ex = os.path.join(testDir, '..', 'generator.py')

class TestGeneration(unittest.TestCase):
    maxDiff = None

    def fixture(self, name):
        relpath = os.path.relpath(os.path.join(testDir, 'fixtures', name))
        sp = subprocess.Popen(
            [ex, 'create', '-o', OUT_DIR, '-p', relpath],
            stdout=subprocess.PIPE)
        stdout, stderr = sp.communicate()
        return dict(stdout=stdout, stderr=stderr, returncode=sp.returncode)

    def getFiles(self, path):
        names = []
        for root, _, fileNames in os.walk(path):
            for fileName in filter(lambda x: x[0] != '.', fileNames):
                names.append(os.path.join(root, fileName))
        names.sort()
        return names

    def compareTrees(self, targetName):
        expectedPath = os.path.join(EXPECTED_DIR, targetName)
        actualPath = os.path.join(OUT_DIR, targetName)

        expectedFiles = self.getFiles(expectedPath)
        actualFiles = self.getFiles(actualPath)

        self.assertListEqual(
            map(lambda x: os.path.relpath(x, expectedPath), expectedFiles),
            map(lambda x: os.path.relpath(x, actualPath), actualFiles))

        for expectedFile, actualFile in zip(expectedFiles, actualFiles):
            with open(expectedFile) as expectedHandle:
                with open(actualFile) as actualHandle:
                    self.assertMultiLineEqual(
                        expectedHandle.read(),
                        actualHandle.read())

    def tearDown(self):
        shutil.rmtree(OUT_DIR, ignore_errors=True)

    def test_normal(self):
        result = self.fixture('normal.case')
        self.assertEqual(result['returncode'], 0)
        self.compareTrees('normal')

    def test_negative(self):
        result = self.fixture('negative.case')
        self.assertEqual(result['returncode'], 0)
        self.compareTrees('negative')

    def test_indentation(self):
        result = self.fixture('indent-code.case')
        self.assertEqual(result['returncode'], 0)
        result = self.fixture('indent-string-continuation.case')
        self.assertEqual(result['returncode'], 0)
        result = self.fixture('indent-string-template.case')
        self.assertEqual(result['returncode'], 0)
        self.compareTrees('indentation')

if __name__ == '__main__':
    unittest.main()
