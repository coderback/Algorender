// What every driver shares: the program it makes, the reader names it calls
// per type, and the shell script that compiles and runs it in the sandbox.

import type { ValueType } from '../schema';

/** The files to write into the sandbox's working folder, by name, and which one holds the learner's code. */
export type Program = { files: Record<string, string>; source: string };

/** Each driver prints this line, plus the test's index, before each test, so the server can split the learner's prints by test. */
export const MARKER = '\u001eALGORENDER-TEST ';

/** The reader each driver calls for a value of each type (Go's are prefixed and capitalised: jdgIntArr). */
export const READER: Record<ValueType, string> = {
  int: 'rInt',
  long: 'rLong',
  float: 'rFloat',
  bool: 'rBool',
  string: 'rString',
  'int[]': 'rIntArr',
  'float[]': 'rFloatArr',
  'bool[]': 'rBoolArr',
  'string[]': 'rStringArr',
  'int[][]': 'rIntArr2',
  'float[][]': 'rFloatArr2',
  'string[][]': 'rStringArr2',
  TreeNode: 'rTree',
  ListNode: 'rList',
};

/**
 * judge.sh <language> <seconds>: compiles the program, then runs it on
 * tests.txt for at most that long. Everything it learns goes into files the
 * server reads back: compile.txt, stdout.txt, stderr.txt, answers.jsonl and
 * status.txt ("compile" when compiling failed; otherwise "run <exit code>
 * <seconds taken>"). Output files are capped at 8 to 16 MB (ulimit -f counts
 * 512-byte or 1 KB blocks, by shell). Recursion gets a deep stack (64 MB in
 * Java and Go, 256 MB in C++), so deep recursion works and endless recursion
 * fails fast; the sandbox holds 2 GB.
 */
export const JUDGE_SCRIPT = `#!/bin/sh
cd "$(dirname "$0")"
seconds=$2
ulimit -f 16384 2>/dev/null
case "$1" in
  java)
    javac -encoding UTF-8 -nowarn -d out *.java > compile.txt 2>&1 || { echo compile > status.txt; exit 0; }
    set -- java -XX:+UseSerialGC -Xmx768m -cp out Main answers.jsonl ;;
  cpp)
    g++ -std=c++20 -O2 -w -o main main.cpp > compile.txt 2>&1 || { echo compile > status.txt; exit 0; }
    ulimit -s 262144 2>/dev/null
    set -- ./main answers.jsonl ;;
  go)
    GOTOOLCHAIN=local GOFLAGS=-mod=mod go build -o main . > compile.txt 2>&1 || { echo compile > status.txt; exit 0; }
    set -- ./main answers.jsonl ;;
  *) echo "unknown language $1" > compile.txt; echo compile > status.txt; exit 0 ;;
esac
start=$(date +%s)
timeout -s KILL "$seconds" "$@" < tests.txt > stdout.txt 2> stderr.txt
code=$?
echo "run $code $(( $(date +%s) - start ))" > status.txt
`;
