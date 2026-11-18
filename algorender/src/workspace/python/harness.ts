// The Python side of the code workspace: run once in Pyodide, it defines
// `run_request(request_json) -> result_json`, which runs a learner's function
// against visual arrays and reports what it did as RunEvents (protocol.ts).
//
// How it sees the learner's code:
// - Comparisons are rewritten (an AST pass) into `_viz_cmp(op, a, b)`, and an
//   indexed operand `arr[i]` into `_viz_cell(arr, i)`, so a comparison knows
//   which cells it read; for `dp[i][j]` the inner subscript gives a row and
//   `_viz_cell(row, j)` the cell.
// - `name = table(…)` / `name = array(…)` call the helper through
//   `_viz_named(name, helper)`, so the collection is named after its variable.
// - Every statement is preceded by `_viz_reads.clear()`, so a grid cell write
//   knows which cells its own statement read (`from`). It is a C method call,
//   so it adds no trace events or steps.
// - Array arguments and array() arrive as VisualList, which records writes,
//   appends and pops, and refuses the mutators that would change it without
//   showing how. Grids (arguments and table()) are a VisualGrid of VisualRows:
//   rows record reads and cell writes; neither can be replaced or resized.
// - Every event takes its line and variables from the innermost frame of the
//   learner's code, so helpers and while-condition re-checks get them right.
// - sys.settrace counts executed lines, so an endless loop stops with a message.
// - In 'lines' mode the same tracer records memory as `step` events: before
//   each line, when a learner function returns (its last instruction a return,
//   not an exception unwinding it), and when an exception leaves a frame. The
//   stack is the learner's frames under a Global frame drawn from the module's
//   namespace, so it outlives the module's own frame when an entry function is
//   called afterwards; the heap is what those frames reach, breadth first.
//   Every object given an id is kept alive for the run, so id() is never
//   reused and two names for one list always share an id.
// - 'judge' mode (_judge) runs the code as written: no AST rewrite and no
//   tracer, so a big test runs at full speed and only the worker's timeout
//   stops an endless loop. Arguments are plain lists, printing is capped, and
//   the result carries every argument's final value.
// - A program (a request with stdin; protocol.ts) gets a _Program: sys.stdin,
//   sys.stdout and sys.stderr are replaced while it runs, input() reads a
//   line, print() writes the raw stream too, and SystemExit sets the exit
//   code. Its other files are written to a fresh folder in Pyodide's file
//   system (_Files), imported from there as ordinary modules (so they run
//   as written; the tracer only counts their lines), and removed with their
//   modules when it ends. A clock (_Clock) stands in for time and datetime.
// - 'program' mode is _judge's run with a light tracer (_Counter) that counts
//   the lines of the learner's files, no print events, and, with tests,
//   _run_tests: every test_* function, its asserts rewritten (_Asserts) so a
//   failure says what each side was.

import { FILE_PATH, MAX_FILE_CHARS, MAX_FILES, MAX_OUTPUT, MAX_TESTS, OUTPUT_CUT } from '../protocol';

export const HARNESS = String.raw`
import ast
import builtins
import collections
import dis
import functools
import importlib
import itertools
import json
import math
import operator
import os
import re
import shutil
import sys
import time
import types

LEARNER = '<learner>'

# Lists longer than this show their first items, then the length.
LIST_SHOWN = 12
STR_SHOWN = 40
# Bigger integers lose precision in JavaScript.
MAX_SAFE_INT = 2 ** 53 - 1
# As protocol.ts: cells one table()/array() call may make, and cells a write's 'from' lists.
MAX_CELLS = 10000
MAX_FROM = 32
# 'lines' mode, as protocol.ts: items a heap object lists, objects one step
# lists, and how deep calls may nest.
MAX_ITEMS = 20
MAX_OBJECTS = 100
MAX_DEPTH = 100
# 'judge' mode, as protocol.ts: lines of printed output kept, and characters per line.
MAX_PRINTS = 100
MAX_PRINT_CHARS = 1000
# Programs, as protocol.ts: characters kept per output stream, and the
# learner's other files.
MAX_OUTPUT = ${MAX_OUTPUT}
OUTPUT_CUT = ${JSON.stringify(OUTPUT_CUT)}
MAX_FILES = ${MAX_FILES}
MAX_FILE_CHARS = ${MAX_FILE_CHARS}
MAX_TESTS = ${MAX_TESTS}
FILE_PATH = r'${FILE_PATH.source}'
# The longest linked list returned as JSON.
MAX_LIST = 1000000
# A frame left by a return or a yield ends on one of these; any other last
# instruction means an exception unwound it.
_RETURNS = {dis.opmap[name] for name in ('RETURN_VALUE', 'RETURN_CONST', 'YIELD_VALUE') if name in dis.opmap}
# co_flags of a function's code (CO_OPTIMIZED): set for functions, not for a
# module or a class body.
_OPTIMIZED = 0x0001

_OPS = {
    '<': operator.lt, '<=': operator.le, '>': operator.gt,
    '>=': operator.ge, '==': operator.eq, '!=': operator.ne,
}
_AST_OPS = {
    ast.Lt: '<', ast.LtE: '<=', ast.Gt: '>',
    ast.GtE: '>=', ast.Eq: '==', ast.NotEq: '!=',
}
_SKIP = object()


class _Stop(BaseException):
    """Ends a run at a limit. A BaseException, so 'except Exception:' in the
    learner's code can't swallow it. Its line, when set, is where to report
    it, in its file when that is one of the learner's other files."""

    line = None
    file = None


# The harness's own timer: a program's clock (_Clock) replaces time's.
_perf_counter = time.perf_counter


# The run in progress; the instrumented code and VisualList report to it.
_current = None


# ---------------------------------------------------------------------------
# Rendering values for the app
# ---------------------------------------------------------------------------

def _short(text):
    return text if len(text) <= STR_SHOWN else text[:STR_SHOWN - 1] + '…'


def _is_number(x):
    return isinstance(x, (int, float)) and not isinstance(x, bool)


def _all_numbers(items):
    """_is_number for every item. The usual case (only ints and floats) is one
    C-level pass over the types: this runs on every event, for every list in
    scope, and a Python-level check of a long list made runs quadratic."""
    return set(map(type, items)) <= _PLAIN_NUMBERS or all(_is_number(x) for x in items)


_PLAIN_NUMBERS = {int, float}


def _number(x):
    """A number as JSON can carry it, or _SKIP."""
    if isinstance(x, float):
        return x if math.isfinite(x) else _SKIP
    if abs(x) <= MAX_SAFE_INT:
        return int(x)
    # Too big for an exact JS number: show it approximately, if at all.
    return float(x) if x.bit_length() <= 1000 else _SKIP


def _list_text(items, tuple_=False):
    shown = ', '.join(repr(x) for x in items[:LIST_SHOWN])
    if len(items) > LIST_SHOWN:
        shown += ', …'
    elif tuple_ and len(items) == 1:
        shown += ','
    text = '(' + shown + ')' if tuple_ else '[' + shown + ']'
    return text if len(items) <= LIST_SHOWN else f'{text} ({len(items)} items)'


def _var(value):
    """A local variable as the variables panel shows it, or _SKIP."""
    if type(value) in _VISUAL:
        return _SKIP  # iterating a graph's list here would read its edges
    if value is None or isinstance(value, bool):
        return value
    if _is_number(value):
        return _number(value)
    if isinstance(value, str):
        return _short(value)
    if isinstance(value, (list, tuple)) and _all_numbers(value):
        return _list_text(value, isinstance(value, tuple))
    return _SKIP


def _repr(value):
    try:
        return _short(repr(value))
    except Exception:
        return type(value).__name__


def _plain(value):
    """The non-cell side of a comparison: always something to show."""
    shown = _var(value)
    return _repr(value) if shown is _SKIP else shown


def _json(value, path=()):
    """The entry function's return value as JSON; anything else becomes text."""
    if value is None or isinstance(value, (bool, str)):
        return value
    if _is_number(value):
        if isinstance(value, int) and abs(value) > MAX_SAFE_INT:
            return _text(value)  # exact as text rather than rounded
        shown = _number(value)
        return _text(value) if shown is _SKIP else shown
    if id(value) in path:  # a list that contains itself
        return '…'
    inner = path + (id(value),)
    if isinstance(value, (VisualList, VisualRow)):
        return list(value._values)
    if isinstance(value, VisualGrid):
        return value._lists()
    # A graph's parts read directly, so returning them records no reads.
    if isinstance(value, VisualGraph):
        return {k: _json(v, inner) for k, v in dict.items(value)}
    if isinstance(value, VisualNeighbours):
        return [_json(x, inner) for x in list.__iter__(value)]
    if isinstance(value, TreeNode):
        return _tree_json(value, inner)
    if isinstance(value, ListNode):
        return _list_json(value, inner)
    if isinstance(value, (list, tuple, set, frozenset)):
        return [_json(x, inner) for x in value]
    if isinstance(value, dict) and all(isinstance(k, str) for k in value):
        return {k: _json(v, inner) for k, v in value.items()}
    return _text(value)


def _text(value):
    try:
        return str(value)
    except Exception:
        return f'<{type(value).__name__}>'


# ---------------------------------------------------------------------------
# Where an event happened
# ---------------------------------------------------------------------------

def _learner_frame():
    frame = sys._getframe(1)
    while frame is not None and frame.f_code.co_filename != LEARNER:
        frame = frame.f_back
    return frame


def _locals(frame):
    out = {}
    for name, value in list(frame.f_locals.items()):
        if not isinstance(name, str) or name.startswith('_') or isinstance(value, _VISUAL):
            continue
        shown = _var(value)
        if shown is not _SKIP:
            out[name] = shown
    return out


def _error_line(error):
    """The last line of the learner's code in the traceback, or None."""
    line = None
    tb = error.__traceback__
    while tb is not None:
        if tb.tb_frame.f_code.co_filename == LEARNER:
            line = tb.tb_lineno
        tb = tb.tb_next
    return line


def _where(error, files=None):
    """(line, file) of an error: the innermost line of the learner's code in
    its traceback, in the main file (file None) or one of its other files. A
    syntax error in another file comes from the import, so it names its own."""
    if files is not None and isinstance(error, SyntaxError):
        name = files.relative(error.filename)
        if name is not None:
            return error.lineno, name
    line, file = None, None
    tb = error.__traceback__
    while tb is not None:
        name = tb.tb_frame.f_code.co_filename
        if name == LEARNER:
            line, file = tb.tb_lineno, None
        elif files is not None and files.relative(name) is not None:
            line, file = tb.tb_lineno, files.relative(name)
        tb = tb.tb_next
    return line, file


def _message(error):
    try:
        detail = str(error)
    except Exception:
        detail = ''
    name = type(error).__name__
    return f'{name}: {detail}' if detail else name


# ---------------------------------------------------------------------------
# Visual arrays
# ---------------------------------------------------------------------------

def _index(i):
    if isinstance(i, int):
        return int(i)
    if hasattr(type(i), '__index__'):
        return operator.index(i)
    raise TypeError(f'list indices must be integers or slices, not {type(i).__name__}')


def _check_number(name, value, what):
    """A value a visual collection called name can store at what (e.g. 'arr[2]')."""
    if not _is_number(value):
        raise TypeError(
            f"{name} holds numbers, so {what} can't store {_repr(value)} "
            f'(a {type(value).__name__}).'
        )
    if isinstance(value, float) and not math.isfinite(value):
        raise ValueError(f'{name} holds finite numbers, so {what} can\'t store {value}.')
    if isinstance(value, int) and abs(value) > MAX_SAFE_INT:
        raise ValueError(f'{name} holds numbers up to {MAX_SAFE_INT:,}; {what} got a bigger one.')


def _plural(n, word):
    return f'{n} {word}' if n == 1 else f'{n} {word}s'


class VisualList:
    """A list of numbers whose changes are shown on the array view. _id is
    unique within the run; _name is the learner's variable, used in messages."""

    __slots__ = ('_id', '_name', '_values')
    __hash__ = None

    def __init__(self, array_id, values, name=None):
        self._id = array_id
        self._name = array_id if name is None else name
        self._values = list(values)

    def _at(self, i, message='list index out of range'):
        i = _index(i)
        n = len(self._values)
        if i < 0:
            i += n
        if not 0 <= i < n:
            raise IndexError(message)
        return i

    def _check(self, value, what):
        _check_number(self._name, value, what)

    # Reading
    def __getitem__(self, i):
        if isinstance(i, slice):
            return self._values[i]  # a plain copy, like a list slice
        return self._values[self._at(i)]

    def __len__(self):
        return len(self._values)

    def __iter__(self):
        return iter(self._values)

    def __reversed__(self):
        return reversed(self._values)

    def __contains__(self, value):
        return value in self._values

    def __repr__(self):
        return repr(self._values)

    __str__ = __repr__

    def __eq__(self, other):
        if isinstance(other, VisualList):
            return self._values == other._values
        if isinstance(other, list):
            return self._values == other
        return NotImplemented

    def __add__(self, other):
        return self._values + list(other)

    def __radd__(self, other):
        return list(other) + self._values

    def __mul__(self, n):
        return self._values * n

    __rmul__ = __mul__

    def index(self, *args):
        return self._values.index(*args)

    def count(self, value):
        return self._values.count(value)

    def copy(self):
        return list(self._values)

    # Changing: validate, report (which may stop the run), then change, so the
    # final contents always match the events.
    def __setitem__(self, i, value):
        if isinstance(i, slice):
            raise TypeError(
                f'Assigning to a slice of {self._name} would change many cells at once '
                'without showing the steps; assign one cell at a time.'
            )
        i = self._at(i, 'list assignment index out of range')
        self._check(value, f'{self._name}[{i}]')
        _current.emit('write', array=self._id, index=i, value=value)
        self._values[i] = value

    def append(self, value):
        self._check(value, f'{self._name}.append()')
        _current.emit('append', array=self._id, value=value)
        self._values.append(value)

    def pop(self, i=-1):
        if not self._values:
            raise IndexError('pop from empty list')
        i = self._at(i, 'pop index out of range')
        _current.emit('pop', array=self._id, index=i)
        return self._values.pop(i)

    # Mutators the view can't show step by step.
    def _refuse(self, what):
        raise TypeError(what)

    def sort(self, *args, **kwargs):
        self._refuse(f'{self._name}.sort() would sort without showing the steps; '
                     'write the comparisons and swaps yourself.')

    def reverse(self):
        self._refuse(f'{self._name}.reverse() would reverse without showing the steps; '
                     'swap the cells yourself.')

    def insert(self, *args):
        self._refuse(f'{self._name}.insert() would shift every later cell without showing the steps; '
                     f'use {self._name}.append() and move values with {self._name}[i] = ….')

    def extend(self, *args):
        self._refuse(f'{self._name}.extend() would add many values at once; '
                     f'use {self._name}.append() for each one.')

    def remove(self, *args):
        self._refuse(f'{self._name}.remove() would search and shift without showing the steps; '
                     f'find the index yourself and use {self._name}.pop(i).')

    def clear(self):
        self._refuse(f'{self._name}.clear() would empty the array without showing the steps; '
                     f'use {self._name}.pop() for each value.')

    def __delitem__(self, i):
        self._refuse(f'del {self._name}[…] isn\'t shown on the array; use {self._name}.pop(i) instead.')

    def __iadd__(self, other):
        self._refuse(f'{self._name} += … would add many values at once; '
                     f'use {self._name}.append() for each one.')

    def __imul__(self, other):
        self._refuse(f'{self._name} *= … would add many values at once; '
                     f'use {self._name}.append() for each one.')


# ---------------------------------------------------------------------------
# Visual grids
# ---------------------------------------------------------------------------

class VisualGrid:
    """A table of numbers (a list of VisualRows) shown on the grid view. Its
    size is fixed: rows can't be replaced, added or removed."""

    __slots__ = ('_id', '_name', '_rows')
    __hash__ = None

    def __init__(self, grid_id, name, values):
        self._id = grid_id
        self._name = name
        self._rows = [VisualRow(self, r, row) for r, row in enumerate(values)]

    def _lists(self):
        return [list(row._values) for row in self._rows]

    def _at(self, i):
        i = _index(i)
        n = len(self._rows)
        if not -n <= i < n:
            raise IndexError(f'row {i} is out of range for {self._name} ({_plural(n, "row")})')
        return i + n if i < 0 else i

    # Reading: a row is not a cell, so getting one records no read.
    def __getitem__(self, i):
        if isinstance(i, slice):
            return self._rows[i]  # a plain list of the (still visual) rows
        return self._rows[self._at(i)]

    def __len__(self):
        return len(self._rows)

    def __iter__(self):
        return iter(self._rows)

    def __reversed__(self):
        return reversed(self._rows)

    def __repr__(self):
        return repr(self._lists())

    __str__ = __repr__

    def __eq__(self, other):
        if isinstance(other, (VisualGrid, list)):
            return self._lists() == list(other)
        return NotImplemented

    def copy(self):
        return list(self._rows)

    # Changing the shape: refused, the view's table has a fixed size.
    def __setitem__(self, i, value):
        raise TypeError(f'{self._name}[…] = … would replace a whole row of {self._name}; '
                        f'set its cells one at a time with {self._name}[i][j] = ….')

    def _fixed(self, what):
        raise TypeError(f'{what} would change the size of {self._name}, but a table keeps its size; '
                        f'make it as big as you need with table(rows, cols).')

    def append(self, *args):
        self._fixed(f'{self._name}.append()')

    def pop(self, *args):
        self._fixed(f'{self._name}.pop()')

    def insert(self, *args):
        self._fixed(f'{self._name}.insert()')

    def extend(self, *args):
        self._fixed(f'{self._name}.extend()')

    def remove(self, *args):
        self._fixed(f'{self._name}.remove()')

    def clear(self):
        self._fixed(f'{self._name}.clear()')

    def __delitem__(self, i):
        self._fixed(f'del {self._name}[…]')

    def __iadd__(self, other):
        self._fixed(f'{self._name} += …')

    def __imul__(self, other):
        self._fixed(f'{self._name} *= …')

    def sort(self, *args, **kwargs):
        raise TypeError(f'{self._name}.sort() would reorder the rows without showing the steps.')

    def reverse(self):
        raise TypeError(f'{self._name}.reverse() would reorder the rows without showing the steps.')


class VisualRow:
    """One row of a VisualGrid. Reading a cell is remembered (for the next
    cell write's 'from'); writing one is shown; the length is fixed."""

    __slots__ = ('_grid', '_r', '_values')
    __hash__ = None

    def __init__(self, grid, r, values):
        self._grid = grid
        self._r = r
        self._values = list(values)

    def _label(self):
        return f'{self._grid._name}[{self._r}]'

    def _at(self, j):
        j = _index(j)
        n = len(self._values)
        if not -n <= j < n:
            raise IndexError(f'column {j} is out of range for {self._grid._name} ({_plural(n, "column")})')
        return j + n if j < 0 else j

    def _read(self, j):
        _current.read(self._grid._id, self._r, j)
        return self._values[j]

    def _read_all(self):
        return [self._read(j) for j in range(len(self._values))]

    # Reading
    def __getitem__(self, j):
        if isinstance(j, slice):
            return [self._read(k) for k in range(*j.indices(len(self._values)))]
        return self._read(self._at(j))

    def __len__(self):
        return len(self._values)

    def __iter__(self):
        # Lazily, like a JS iterator, so a loop that breaks early reads only what it saw.
        for j in range(len(self._values)):
            yield self._read(j)

    def __reversed__(self):
        for j in reversed(range(len(self._values))):
            yield self._read(j)

    def __contains__(self, value):
        return any(x is value or x == value for x in self)

    def __repr__(self):
        return repr(self._values)

    __str__ = __repr__

    def __eq__(self, other):
        if isinstance(other, VisualRow):
            return self._values == other._values
        if isinstance(other, list):
            return self._values == other
        return NotImplemented

    def __add__(self, other):
        return self._read_all() + list(other)

    def __radd__(self, other):
        return list(other) + self._read_all()

    def __mul__(self, n):
        return self._read_all() * n

    __rmul__ = __mul__

    def index(self, *args):
        return self._read_all().index(*args)

    def count(self, value):
        return self._read_all().count(value)

    def copy(self):
        return self._read_all()

    # Changing: validate, report (which may stop the run), then change.
    def __setitem__(self, j, value):
        if isinstance(j, slice):
            raise TypeError(f'Assigning to a slice of {self._label()} would change many cells at once '
                            'without showing the steps; assign one cell at a time.')
        j = self._at(j)
        grid = self._grid
        _check_number(grid._name, value, f'{self._label()}[{j}]')
        _current.emit('cellWrite', grid=grid._id, row=self._r, col=j, value=value, **{'from': _current.sources()})
        self._values[j] = value

    def _fixed(self, what):
        raise TypeError(f'{what} would change the length of a row of {self._grid._name}, but a table keeps its size; '
                        f'set cells with {self._label()}[j] = ….')

    def append(self, *args):
        self._fixed(f'{self._label()}.append()')

    def pop(self, *args):
        self._fixed(f'{self._label()}.pop()')

    def insert(self, *args):
        self._fixed(f'{self._label()}.insert()')

    def extend(self, *args):
        self._fixed(f'{self._label()}.extend()')

    def remove(self, *args):
        self._fixed(f'{self._label()}.remove()')

    def clear(self):
        self._fixed(f'{self._label()}.clear()')

    def __delitem__(self, j):
        self._fixed(f'del {self._label()}[…]')

    def __iadd__(self, other):
        self._fixed(f'{self._label()} += …')

    def __imul__(self, other):
        self._fixed(f'{self._label()} *= …')

    def sort(self, *args, **kwargs):
        raise TypeError(f'{self._label()}.sort() would sort without showing the steps; set the cells yourself.')

    def reverse(self):
        raise TypeError(f'{self._label()}.reverse() would reverse without showing the steps; set the cells yourself.')


# ---------------------------------------------------------------------------
# Graphs: a read-only dict of neighbour lists whose reads are shown
# ---------------------------------------------------------------------------

def _read_only(what):
    raise TypeError(f"{what} is part of the graph you were given, so it can't be changed here; "
                    'keep what you find in a dict, set or list of your own.')


class VisualGraph(dict):
    """A graph argument: each node → its VisualNeighbours, in a fixed order.
    Fetching a node's list is a 'neighbours' event; items() and values()
    fetch every list at once (as Object.entries does in JS)."""

    __slots__ = ('_id', '_name')

    def __init__(self, graph_id, name, lists):
        dict.__init__(self, lists)
        self._id = graph_id
        self._name = name

    def _fetch(self, node):
        if _current is not None:
            _current.emit('neighbours', graph=self._id, node=node)
        return dict.__getitem__(self, node)

    def __getitem__(self, node):
        if not dict.__contains__(self, node):
            raise KeyError(node)
        return self._fetch(node)

    def get(self, node, default=None):
        return self._fetch(node) if dict.__contains__(self, node) else default

    def items(self):
        for node in dict.keys(self):
            self._fetch(node)
        return dict.items(self)

    def values(self):
        for node in dict.keys(self):
            self._fetch(node)
        return dict.values(self)

    def __setitem__(self, node, value):
        _read_only(self._name)

    def __delitem__(self, node):
        _read_only(self._name)

    def __ior__(self, other):
        _read_only(self._name)

    def pop(self, *args):
        _read_only(self._name)

    def popitem(self):
        _read_only(self._name)

    def clear(self):
        _read_only(self._name)

    def update(self, *args, **kwargs):
        _read_only(self._name)

    def setdefault(self, *args):
        _read_only(self._name)


class VisualNeighbours(list):
    """One node's neighbours (or (neighbour, weight) pairs). Taking an entry,
    by iterating or indexing, is an 'edge' event; len() and 'in' are not."""

    __slots__ = ('_graph', '_node', '_weighted', '_label')

    def __init__(self, graph, node, weighted, items):
        list.__init__(self, items)
        self._graph = graph
        self._node = node
        self._weighted = weighted
        self._label = f'{graph._name}[{node!r}]'

    def _take(self, item):
        if _current is not None:
            to, weight = item if self._weighted else (item, 1)
            _current.emit('edge', graph=self._graph._id, to=to, weight=weight, **{'from': self._node})
        return item

    def __iter__(self):
        # Lazily, like a JS iterator, so a loop that breaks early takes only the edges it saw.
        for i in range(list.__len__(self)):
            yield self._take(list.__getitem__(self, i))

    def __reversed__(self):
        for i in reversed(range(list.__len__(self))):
            yield self._take(list.__getitem__(self, i))

    def __getitem__(self, i):
        if isinstance(i, slice):
            return [self._take(x) for x in list.__getitem__(self, i)]
        return self._take(list.__getitem__(self, i))

    def copy(self):
        return list(self)

    def __add__(self, other):
        return list(self) + list(other)

    def __radd__(self, other):
        return list(other) + list(self)

    def __mul__(self, n):
        return list(self) * n

    __rmul__ = __mul__

    def __setitem__(self, i, value):
        _read_only(self._label)

    def __delitem__(self, i):
        _read_only(self._label)

    def __iadd__(self, other):
        _read_only(self._label)

    def __imul__(self, other):
        _read_only(self._label)

    def append(self, value):
        _read_only(self._label)

    def extend(self, values):
        _read_only(self._label)

    def insert(self, i, value):
        _read_only(self._label)

    def remove(self, value):
        _read_only(self._label)

    def pop(self, *args):
        _read_only(self._label)

    def clear(self):
        _read_only(self._label)

    def sort(self, *args, **kwargs):
        _read_only(self._label)

    def reverse(self):
        _read_only(self._label)


def _graph(spec):
    graph_id = spec['name']
    weighted = bool(spec.get('weighted'))
    graph = VisualGraph(graph_id, graph_id, {})
    for row in spec.get('adjacency') or []:
        items = [(n['to'], n['weight']) if weighted else n['to'] for n in row['neighbours']]
        dict.__setitem__(graph, row['node'], VisualNeighbours(graph, row['node'], weighted, items))
    return graph


_VISUAL = (VisualList, VisualGrid, VisualRow, VisualGraph, VisualNeighbours)


# ---------------------------------------------------------------------------
# Trees: LeetCode's TreeNode
# ---------------------------------------------------------------------------

class TreeNode:
    """A binary tree node: TreeNode(val, left=None, right=None)."""

    def __init__(self, val=0, left=None, right=None):
        self.val = val
        self.left = left
        self.right = right

    def __repr__(self):
        return f'TreeNode({self.val!r})'


def _build_tree(values):
    """The root of a tree given in level order (None: no node there), or None."""
    if not values or values[0] is None:
        return None
    root = TreeNode(values[0])
    waiting = [root]
    k = 0
    i = 1
    while i < len(values) and k < len(waiting):
        node = waiting[k]
        k += 1
        for side in ('left', 'right'):
            if i < len(values) and values[i] is not None:
                child = TreeNode(values[i])
                setattr(node, side, child)
                waiting.append(child)
            i += 1
    return root


def _tree_json(root, path):
    """A tree in level order, trailing gaps dropped: [4, 2, 7, None, 3]."""
    out = []
    seen = set()
    waiting = [root]
    k = 0
    while k < len(waiting):
        node = waiting[k]
        k += 1
        if not isinstance(node, TreeNode):
            out.append(None if node is None else _json(node, path))
            continue
        if id(node) in seen or len(seen) >= MAX_CELLS:
            return 'not a tree: a node can be reached twice'
        seen.add(id(node))
        out.append(_json(node.val, path))
        waiting.append(node.left)
        waiting.append(node.right)
    while out and out[-1] is None:
        out.pop()
    return out


# ---------------------------------------------------------------------------
# Linked lists: LeetCode's ListNode
# ---------------------------------------------------------------------------

class ListNode:
    """A linked list node: ListNode(val, next=None)."""

    def __init__(self, val=0, next=None):
        self.val = val
        self.next = next

    def __repr__(self):
        return f'ListNode({self.val!r})'


def _build_list(values):
    """The head of a linked list holding these values, or None."""
    head = None
    for value in reversed(values):
        head = ListNode(value, head)
    return head


def _list_json(head, path):
    """A linked list as the list of its values: [1, 2, 3]."""
    out = []
    seen = set()
    node = head
    while node is not None:
        if not isinstance(node, ListNode):
            out.append(_json(node, path))
            break
        if id(node) in seen:
            return 'not a list: it loops back to a node it already passed'
        if len(seen) >= MAX_LIST:
            return f'not a list: longer than {MAX_LIST:,} nodes'
        seen.add(id(node))
        out.append(_json(node.val, path))
        node = node.next
    return out


# ---------------------------------------------------------------------------
# The helpers the learner's code can call: table() and array()
# ---------------------------------------------------------------------------

def _fill(fill, blank_ok):
    if fill is None and blank_ok:
        return None
    if (not _is_number(fill) or (isinstance(fill, float) and not math.isfinite(fill))
            or (isinstance(fill, int) and abs(fill) > MAX_SAFE_INT)):
        allowed = 'a number or None' if blank_ok else 'a number'
        raise TypeError(f'fill must be {allowed}, not {_repr(fill)}.')
    return fill


def _whole(value, what):
    if isinstance(value, bool) or not isinstance(value, int):
        raise TypeError(f'{what} needs whole numbers, not {_repr(value)}.')
    return value


def table(rows, cols, fill=0, *, _viz_name=None):
    """A visual table of rows × cols cells, each starting as fill (None: blank)."""
    _whole(rows, 'table(rows, cols)')
    _whole(cols, 'table(rows, cols)')
    if rows < 0 or cols < 0:
        raise ValueError(f"table() can't make {rows if rows < 0 else cols} {'rows' if rows < 0 else 'columns'}.")
    if rows * cols > MAX_CELLS:
        raise ValueError(f'table({rows}, {cols}) would make {rows * cols:,} cells; a visual table holds at most {MAX_CELLS:,}.')
    fill = _fill(fill, True)
    name, grid_id = _current.new_id(_viz_name, 'table')
    values = [[fill] * cols for _ in range(rows)]
    _current.emit('grid', grid=grid_id, name=name, rows=rows, cols=cols, values=[list(r) for r in values])
    grid = VisualGrid(grid_id, name, values)
    _current.grids[grid_id] = grid
    return grid


def array(values, fill=0, *, _viz_name=None):
    """A visual array: a copy of values, or that many cells of fill."""
    if isinstance(values, int) and not isinstance(values, bool):
        if values < 0:
            raise ValueError(f"array() can't make {values} cells.")
        if values > MAX_CELLS:
            raise ValueError(f'array({values}) would make {values:,} cells; a visual array holds at most {MAX_CELLS:,}.')
        items = [_fill(fill, False)] * values
    elif _is_number(values):
        raise TypeError(f'array() needs a whole number of cells, not {_repr(values)}.')
    else:
        try:
            items = iter(values)
        except TypeError:
            raise TypeError(f'array() takes a length or a list of numbers, not {_repr(values)}.') from None
        items = list(items)  # outside the try: an error inside the learner's own iterable stays theirs
        if len(items) > MAX_CELLS:
            raise ValueError(f'array() would make {len(items):,} cells; a visual array holds at most {MAX_CELLS:,}.')
        for x in items:
            if not _is_number(x) or (isinstance(x, float) and not math.isfinite(x)) or (isinstance(x, int) and abs(x) > MAX_SAFE_INT):
                raise TypeError(f'array() takes numbers, not {_repr(x)}.')
    name, array_id = _current.new_id(_viz_name, 'array')
    _current.emit('array', array=array_id, name=name, values=list(items))
    made = VisualList(array_id, items, name)
    _current.arrays[array_id] = made
    return made


def _viz_named(name, helper):
    """name = table(…): the helper learns the variable's name. A learner's own
    function of the same name is called as it is."""
    if helper is table or helper is array:
        return functools.partial(helper, _viz_name=name)
    return helper


# ---------------------------------------------------------------------------
# Comparisons
# ---------------------------------------------------------------------------

class _Cell:
    """An array cell read by a comparison: which cell, and what it held."""

    __slots__ = ('array', 'index', 'value')

    def __init__(self, array, index, value):
        self.array = array
        self.index = index
        self.value = value


class _GridCell:
    """A grid cell read by a comparison."""

    __slots__ = ('grid', 'row', 'col', 'value')

    def __init__(self, grid, row, col, value):
        self.grid = grid
        self.row = row
        self.col = col
        self.value = value


_CELLS = (_Cell, _GridCell)


def _viz_cell(obj, index):
    kind = type(obj)
    if kind is VisualList and not isinstance(index, slice):
        i = obj._at(index)
        return _Cell(obj._id, i, obj._values[i])
    if kind is VisualRow and not isinstance(index, slice):
        j = obj._at(index)
        return _GridCell(obj._grid._id, obj._r, j, obj._read(j))
    return obj[index]  # dp[i] in dp[i][j]: the row, which gives the cell


def _operand(x):
    kind = type(x)
    if kind is _Cell:
        return {'array': x.array, 'index': x.index, 'value': x.value}
    if kind is _GridCell:
        return {'grid': x.grid, 'row': x.row, 'col': x.col, 'value': x.value}
    return {'value': _plain(x)}


def _viz_cmp(op, a, b):
    left = a.value if type(a) in _CELLS else a
    right = b.value if type(b) in _CELLS else b
    result = _OPS[op](left, right)
    if type(a) in _CELLS or type(b) in _CELLS:
        _current.emit('compare', op=op, a=_operand(a), b=_operand(b), result=bool(result))
    return result


# ---------------------------------------------------------------------------
# Instrumenting the learner's code
# ---------------------------------------------------------------------------

def _is_plain_index(node):
    if isinstance(node, ast.Slice):
        return False
    if isinstance(node, ast.Tuple):
        return not any(isinstance(e, ast.Slice) for e in node.elts)
    return True


class _Instrument(ast.NodeTransformer):
    """a < b  becomes  _viz_cmp('<', a, b); an operand arr[i] becomes _viz_cell(arr, i).
    Chained comparisons and in/is are left as written."""

    def visit_Compare(self, node):
        self.generic_visit(node)
        if len(node.ops) != 1 or type(node.ops[0]) not in _AST_OPS:
            return node
        call = ast.Call(
            func=ast.Name('_viz_cmp', ast.Load()),
            args=[ast.Constant(_AST_OPS[type(node.ops[0])]),
                  self._operand(node.left), self._operand(node.comparators[0])],
            keywords=[],
        )
        return ast.copy_location(call, node)

    @staticmethod
    def _operand(node):
        if isinstance(node, ast.Subscript) and _is_plain_index(node.slice):
            call = ast.Call(func=ast.Name('_viz_cell', ast.Load()),
                            args=[node.value, node.slice], keywords=[])
            return ast.copy_location(call, node)
        return node

    # name = table(…) / name = array(…) calls the helper through _viz_named(name, helper).
    def visit_Assign(self, node):
        self.generic_visit(node)
        if len(node.targets) == 1:
            self._name(node.targets[0], node.value)
        return node

    def visit_AnnAssign(self, node):
        self.generic_visit(node)
        if node.value is not None:
            self._name(node.target, node.value)
        return node

    @staticmethod
    def _name(target, value):
        if (isinstance(target, ast.Name) and isinstance(value, ast.Call)
                and isinstance(value.func, ast.Name) and value.func.id in ('table', 'array')):
            named = ast.Call(func=ast.Name('_viz_named', ast.Load()),
                             args=[ast.Constant(target.id), value.func], keywords=[])
            value.func = ast.copy_location(named, value.func)


def _marked(stmt):
    if isinstance(stmt, ast.ImportFrom) and stmt.module == '__future__':
        return [stmt]  # must stay first
    clear = ast.Expr(ast.Call(func=ast.Attribute(ast.Name('_viz_reads', ast.Load()), 'clear', ast.Load()),
                              args=[], keywords=[]))
    # On the statement's first line only: spanning a def's whole body would
    # make the tracer see its last line run too.
    clear.lineno = clear.end_lineno = stmt.lineno
    clear.col_offset = clear.end_col_offset = stmt.col_offset
    return [clear, stmt]


class _Statements(ast.NodeTransformer):
    """Puts _viz_reads.clear() before every statement of every block, as the JS
    runtime puts a line marker there, so a statement starts with no reads."""

    def generic_visit(self, node):
        super().generic_visit(node)
        for field in ('body', 'orelse', 'finalbody'):
            block = getattr(node, field, None)
            if isinstance(block, list) and block and isinstance(block[0], ast.stmt):
                setattr(node, field, [x for stmt in block for x in _marked(stmt)])
        return node


# ---------------------------------------------------------------------------
# Memory, for 'lines' mode
# ---------------------------------------------------------------------------

def _prim(value):
    """A value drawn inline, written as Python prints it, or None for an object."""
    kind = type(value)
    if value is None:
        return {'prim': 'None', 'type': 'none'}
    if kind is bool:
        return {'prim': repr(value), 'type': 'boolean'}
    if kind is int or kind is float or kind is complex:
        return {'prim': _number_text(value), 'type': 'number'}
    if kind is str:
        return {'prim': _quoted(value), 'type': 'string'}
    return None


def _number_text(x):
    try:
        text = repr(x)
    except ValueError:  # an int too long to turn into text
        return 'a number too long to show'
    return text if len(text) <= STR_SHOWN else f'{text[:STR_SHOWN // 2]}… ({len(text)} digits)'


def _quoted(text):
    """A string as repr writes it, cut to STR_SHOWN characters inside its quotes."""
    if len(text) <= STR_SHOWN:
        return repr(text)
    cut = repr(text[:STR_SHOWN - 1])
    return cut[:-1] + '…' + cut[-1]


def _shown(name, value):
    """Whether a frame's name belongs in the diagram: not the harness's own
    names, dunders, modules, or the helpers (table, array, TreeNode, ListNode)."""
    if not isinstance(name, str) or not name.isidentifier() or name.startswith('_viz'):
        return False
    if name.startswith('__') and name.endswith('__'):
        return False
    return not isinstance(value, types.ModuleType) and value is not table and value is not array and value is not TreeNode and value is not ListNode


_FUNCTIONS = (types.FunctionType, types.BuiltinFunctionType, types.MethodType)


class _Heap:
    """The objects one step reaches from its frames, breadth first, each listed
    once under its id for the run. Past MAX_OBJECTS a reference shows as …."""

    def __init__(self, run):
        self.run = run
        self.objects = []
        self.slot = {}
        self.queue = []

    def value(self, x):
        prim = _prim(x)
        if prim is not None:
            return prim
        oid = self.run.object_id(x)
        if oid not in self.slot:
            if len(self.slot) >= MAX_OBJECTS:
                return {'prim': '…', 'type': 'none'}
            self.slot[oid] = len(self.objects)
            self.objects.append(None)
            self.queue.append((oid, x))
        return {'ref': oid}

    def fill(self):
        """Describes every object reached so far, and whatever those reach."""
        k = 0
        while k < len(self.queue):
            oid, x = self.queue[k]
            k += 1
            self.objects[self.slot[oid]] = self.describe(oid, x)
        return self.objects

    def items(self, oid, kind, name, values):
        shown = [self.value(v) for v in itertools.islice(values, MAX_ITEMS)]
        return {'id': oid, 'kind': kind, 'type': name, 'items': shown, 'more': max(0, len(values) - MAX_ITEMS)}

    def describe(self, oid, x):
        kind = type(x)
        # Visual collections are lists to the learner; their cells are read
        # directly, so drawing them records no reads.
        if kind is VisualList or kind is VisualRow:
            return self.items(oid, 'list', 'list', x._values)
        if kind is VisualGrid:
            return self.items(oid, 'list', 'list', x._rows)
        # A graph is a dict and its lists are lists; read directly, so drawing them takes no edges.
        if kind is VisualGraph:
            entries = [[self.value(k), self.value(v)] for k, v in itertools.islice(dict.items(x), MAX_ITEMS)]
            return {'id': oid, 'kind': 'dict', 'type': 'dict', 'entries': entries, 'more': max(0, len(x) - MAX_ITEMS)}
        if kind is VisualNeighbours:
            return self.items(oid, 'list', 'list', list(list.__iter__(x)))
        if isinstance(x, collections.deque):
            return self.items(oid, 'list', kind.__name__, list(x))
        if isinstance(x, list):
            return self.items(oid, 'list', kind.__name__, x)
        if isinstance(x, tuple):
            return self.items(oid, 'tuple', kind.__name__, x)
        if isinstance(x, (set, frozenset)):
            return self.items(oid, 'set', kind.__name__, x)
        if isinstance(x, dict):
            entries = [[self.value(k), self.value(v)] for k, v in itertools.islice(x.items(), MAX_ITEMS)]
            return {'id': oid, 'kind': 'dict', 'type': kind.__name__, 'entries': entries, 'more': max(0, len(x) - MAX_ITEMS)}
        if isinstance(x, type):
            return {'id': oid, 'kind': 'function', 'type': 'class', 'name': x.__name__}
        if isinstance(x, _FUNCTIONS):
            return {'id': oid, 'kind': 'function', 'type': 'function', 'name': getattr(x, '__name__', 'function')}
        # Anything else is drawn by its attributes, read without running the
        # learner's __getattr__ or properties.
        try:
            attrs = object.__getattribute__(x, '__dict__')
        except Exception:
            attrs = None
        named = [(k, v) for k, v in attrs.items() if isinstance(k, str) and not k.startswith('__')] if isinstance(attrs, dict) else []
        fields = [[k, self.value(v)] for k, v in named[:MAX_ITEMS]]
        return {'id': oid, 'kind': 'object', 'type': kind.__name__, 'fields': fields, 'more': max(0, len(named) - MAX_ITEMS)}


# ---------------------------------------------------------------------------
# A run
# ---------------------------------------------------------------------------

class _Run:
    def __init__(self, request):
        limits = request.get('limits') or {}
        self.max_events = int(limits.get('maxEvents', 5000))
        self.max_steps = int(limits.get('maxSteps', 200000))
        self.events = []
        self.arrays = {}
        self.grids = {}
        # Grid cells the current function's statement has read, in order, each
        # once: a dict used as an ordered set, bound to _viz_reads in the
        # learner's globals so the statement markers clear it in place. A call
        # gets its own; when it returns, what its last statement read joins the
        # caller's (so dp[i][j] = at(i - 1, j) + … lists both cells).
        self.reads = {}
        self.caller_reads = []
        self.namespace = None
        self.ids = set()
        self.unnamed = {'table': 0, 'array': 0}
        self.steps = 0
        # Set when a limit stopped the run, even if the learner's code caught it.
        self.stopped = None
        # 'lines' mode: memory at every step.
        self.lines = request.get('mode') == 'lines'
        # The compiled module: its frame is the Global frame.
        self.code = None
        self.global_line = 1
        # Objects get 'o1', 'o2'… in the order first seen, and are kept alive so
        # no other object can take their id() during the run.
        self.object_ids = {}
        self.kept = []
        # Each live call's frame id ('f1', 'f2'…), by id(frame), and each
        # frame's names in the order first bound (a dict used as an ordered set).
        self.frame_ids = {}
        self.order = {}
        self.calls = 0
        self.depth = 0
        # The exception passing through each frame, by id(frame).
        self.raised = {}

    def new_id(self, name, kind):
        """(name, id) for a new collection: the variable's name, or table1, array2…;
        the id gets a number on the end when the name is already taken."""
        if name is None:
            self.unnamed[kind] += 1
            name = f'{kind}{self.unnamed[kind]}'
        collection_id, k = name, 1
        while collection_id in self.ids:
            k += 1
            collection_id = f'{name}{k}'
        self.ids.add(collection_id)
        return name, collection_id

    def read(self, grid, row, col):
        if len(self.reads) < MAX_FROM:
            self.reads[(grid, row, col)] = None

    def sources(self):
        return [{'grid': g, 'row': r, 'col': c} for (g, r, c) in self.reads]

    def _bind_reads(self, reads):
        self.reads = reads
        if self.namespace is not None:
            self.namespace['_viz_reads'] = reads

    def enter(self):
        self.caller_reads.append(self.reads)
        self._bind_reads({})

    def leave(self):
        if not self.caller_reads:
            return
        caller = self.caller_reads.pop()
        for key in self.reads:
            if len(caller) >= MAX_FROM:
                break
            if key not in caller:
                caller[key] = None
        self._bind_reads(caller)

    def stop(self, message, line=None, file=None):
        self.stopped = message
        stop = _Stop(message)
        stop.line = line
        stop.file = file
        raise stop

    def limit_message(self):
        if self.lines:
            return f'Stopped after {self.max_events:,} steps: is there a loop that never ends?'
        return (f'Stopped after {self.max_events:,} events: '
                'the code changed the array more times than the visual can show.')

    def emit(self, kind, line=_SKIP, **fields):
        if self.stopped is not None:
            raise _Stop(self.stopped)
        if len(self.events) >= self.max_events:
            self.stop(self.limit_message())
        event = {'kind': kind, **fields}
        if line is _SKIP:
            frame = _learner_frame()
            event['line'] = frame.f_lineno if frame is not None else None
            event['vars'] = _locals(frame) if frame is not None else {}
        else:
            event['line'] = line
            event['vars'] = {}
        self.events.append(event)

    # sys.settrace: only the learner's frames get a line tracer. Their call and
    # return events (a generator's every resume and yield, and a return by
    # exception too) keep the read logs in step with the frames. Frames of the
    # learner's other files only count their lines.
    def trace_calls(self, frame, event, arg):
        name = frame.f_code.co_filename
        if name == LEARNER:
            self.enter()
            if self.drawn(frame.f_code):
                self.called(frame)
            return self.trace_lines
        if self.files is not None and self.files.relative(name) is not None:
            return self.count_lines
        return None

    def count_lines(self, frame, event, arg):
        if event == 'line':
            self.steps += 1
            if self.steps > self.max_steps:
                self.stop(f'Stopped after {self.max_steps:,} steps: is there a loop that never ends?',
                          frame.f_lineno, self.files.relative(frame.f_code.co_filename))
        return self.count_lines

    # Set by _run when the run has other files (_Files).
    files = None

    def trace_lines(self, frame, event, arg):
        if event == 'line':
            self.steps += 1
            if self.steps > self.max_steps:
                self.stop(f'Stopped after {self.max_steps:,} steps: is there a loop that never ends?')
            if self.drawn(frame.f_code):
                self.step('line', frame)
        elif event == 'return':
            self.leave()
            if self.drawn(frame.f_code):
                self.returned(frame, arg)
        elif event == 'exception' and self.drawn(frame.f_code):
            self.raised[id(frame)] = arg[1]
        return self.trace_lines

    # 'lines' mode --------------------------------------------------------------

    def drawn(self, code):
        """In 'lines' mode, whether code's frame is drawn and stepped through:
        the module and every function, but not a class body, which runs as
        one step of the frame that defines the class (as in JS)."""
        return self.lines and (code is self.code or bool(code.co_flags & _OPTIMIZED))

    def called(self, frame):
        if frame.f_code is self.code:
            return
        if self.depth >= MAX_DEPTH:
            # Reported on the line that made the call, not the refused function's def.
            caller = frame.f_back
            while caller is not None and caller.f_code.co_filename != LEARNER:
                caller = caller.f_back
            self.stop(f'Stopped at {MAX_DEPTH} nested calls: is there a recursion that never ends?',
                      caller.f_lineno if caller is not None else None)
        self.depth += 1
        self.calls += 1
        self.frame_ids[id(frame)] = f'f{self.calls}'

    def returned(self, frame, value):
        key = id(frame)
        error = self.raised.pop(key, None)
        module = frame.f_code is self.code
        try:
            if self.stopped is None:
                if frame.f_code.co_code[frame.f_lasti] in _RETURNS:
                    self.step('return', frame, _SKIP if module else value)
                elif error is not None and not isinstance(error, _Stop) and not self.exiting(error):
                    self.step('exception', frame, message=_message(error))
        finally:
            if not module:
                self.depth -= 1
                self.order.pop(self.frame_ids.pop(key, None), None)

    def exiting(self, error):
        """A program's sys.exit: it ends the run, as process.exit does in
        JS, rather than unwinding frame by frame as an error does."""
        return isinstance(error, SystemExit) and self.program is not None

    def object_id(self, x):
        key = id(x)
        oid = self.object_ids.get(key)
        if oid is None:
            self.kept.append(x)
            oid = self.object_ids[key] = f'o{len(self.kept)}'
        return oid

    def step(self, event, frame, returning=_SKIP, message=None):
        """Records memory as frame (the innermost learner frame) stands now."""
        if self.stopped is not None:
            raise _Stop(self.stopped)
        if len(self.events) >= self.max_events:
            self.stop(self.limit_message())
        heap = _Heap(self)
        stack = self.stack(frame, heap)
        if returning is not _SKIP:
            stack[-1]['returning'] = heap.value(returning)
        record = {'kind': 'step', 'event': event, 'line': stack[-1]['line'], 'stack': stack, 'heap': heap.fill()}
        if message is not None:
            record['message'] = message
        self.events.append(record)

    def stack(self, frame, heap):
        """The Global frame, then the learner's calls outward-in; harness frames left out."""
        calls = []
        while frame is not None:
            code = frame.f_code
            if code is self.code:
                self.global_line = frame.f_lineno or self.global_line
            elif code.co_filename == LEARNER and self.drawn(code):
                calls.append(frame)
            frame = frame.f_back
        stack = [self.frame('global', 'Global frame', self.global_line, self.namespace, heap)]
        for f in reversed(calls):
            fid = self.frame_ids.get(id(f), 'f0')
            stack.append(self.frame(fid, f.f_code.co_name, f.f_lineno or 0, f.f_locals, heap, f.f_code.co_freevars))
        return stack

    def frame(self, fid, fn, line, scope, heap, outer=()):
        """A frame's names in binding order. A closure's free variables
        (outer) belong to the frame that defines them, so they are drawn
        there, as in JS."""
        order = self.order.setdefault(fid, {})
        shown = {}
        for name, value in list(scope.items()):
            if name not in outer and _shown(name, value):
                shown[name] = value
                order.setdefault(name, None)
        names = [name for name in order if name in shown]
        return {'id': fid, 'fn': fn, 'line': line, 'locals': [[name, heap.value(shown[name])] for name in names]}

    def print(self, *args, sep=' ', end='\n', file=None, flush=False):
        if sep is None:
            sep = ' '
        elif not isinstance(sep, str):
            raise TypeError(f'sep must be None or a string, not {type(sep).__name__}')
        text = sep.join(str(a) for a in args)
        if self.program is None:
            self.emit('print', text=text)
            return
        stream, end, shown = self.program.target(file, end)
        if shown:
            self.emit('print', text=text)
        stream.write(text + end)

    # Set by _run for a program (a request with stdin).
    program = None

    def arg(self, spec):
        kind = spec.get('kind')
        if kind == 'array':
            name = spec['name']
            values = list(spec.get('values') or [])
            array = VisualList(name, values)
            self.ids.add(name)
            self.arrays[name] = array
            self.emit('array', line=None, array=name, name=name, values=list(values))
            return array
        if kind == 'grid':
            name = spec['name']
            values = [list(row) for row in spec.get('values') or []]
            self.ids.add(name)
            self.emit('grid', line=None, grid=name, name=name, rows=len(values),
                      cols=len(values[0]) if values else 0, values=[list(row) for row in values])
            grid = VisualGrid(name, name, values)
            self.grids[name] = grid
            return grid
        if kind == 'graph':
            name = spec['name']
            self.ids.add(name)
            shown = {k: spec[k] for k in ('directed', 'weighted', 'adjacency', 'layout') if k in spec}
            self.emit('graph', line=None, graph=name, name=name, **shown)
            return _graph(spec)
        if kind == 'tree':
            values = list(spec.get('values') or [])
            self.emit('tree', line=None, name=spec['name'], values=values)
            return _build_tree(values)
        if kind == 'list':
            return _build_list(list(spec.get('values') or []))
        return spec.get('value')

    def result(self, returned, error, ms):
        return {
            'events': self.events,
            'arrays': {k: list(v._values) for k, v in self.arrays.items()},
            'grids': {k: v._lists() for k, v in self.grids.items()},
            'returned': _json(returned),
            'error': error,
            'ms': ms,
        }


def _error(kind, message, line, file=None):
    error = {'kind': kind, 'message': message, 'line': line}
    if file is not None:
        error['file'] = file
    return error


def _limit(e):
    """The error a limit (_Stop) ended a run with: where it says, else the learner's innermost line."""
    if e.line is not None:
        return _error('limit', str(e), e.line, e.file)
    return _error('limit', str(e), _error_line(e))


def _failed(e, files):
    """The error that ended a run: a runtime error, or a syntax error in another file."""
    line, file = _where(e, files)
    if isinstance(e, SyntaxError) and file is not None:
        return _error('syntax', f'{type(e).__name__}: {e.msg}', line, file)
    return _error('runtime', _message(e), line, file)


def _run(request):
    global _current
    run = _Run(request)
    entry = request['entry']
    program = _Program(request) if request.get('stdin') is not None else None
    run.program = program

    problem = _files_problem(request.get('files'))
    if problem is not None:
        return _ended(run.result(None, problem, 0), program)
    try:
        tree = _Statements().visit(_Instrument().visit(ast.parse(request['code'], LEARNER, 'exec')))
        code = compile(ast.fix_missing_locations(tree), LEARNER, 'exec')
    except SyntaxError as e:
        return _ended(run.result(None, _error('syntax', f'{type(e).__name__}: {e.msg}', e.lineno), 0), program)
    except ValueError as e:  # e.g. a null byte in the source
        return _ended(run.result(None, _error('syntax', f'SyntaxError: {e}', None), 0), program)

    namespace = {'__name__': '__main__', '__builtins__': builtins,
                 '_viz_cmp': _viz_cmp, '_viz_cell': _viz_cell, '_viz_named': _viz_named,
                 '_viz_reads': run.reads, 'table': table, 'array': array, 'TreeNode': TreeNode,
                 'ListNode': ListNode}
    run.namespace = namespace
    run.code = code
    returned = None
    error = None
    real_print = builtins.print
    real_input = builtins.input
    files = _Files(request['files']) if request.get('files') else None
    run.files = files
    seeded = _Seeded(request.get('seed'))
    clock = _Clock(request.get('clock'))
    _current = run
    builtins.print = run.print
    builtins.input = program.input if program else _no_input
    if program:
        program.install()
    if files:
        files.install()
    clock.install()
    started = _perf_counter()
    try:
        sys.settrace(run.trace_calls)
        try:
            exec(code, namespace)
            # No entry: the top-level code was the whole program.
            fn = namespace.get(entry) if entry else None
            calls = request.get('calls')
            if entry and not callable(fn):
                error = _error('runtime', f"Define {'a class' if calls else 'a function'} called {entry}.", None)
            elif entry and calls:
                returned = []
                _call_methods(fn, entry, calls, returned)
            elif entry:
                args = [run.arg(spec) for spec in request.get('args') or []]
                returned = fn(*args)
        finally:
            sys.settrace(None)
    except _Waiting:
        pass  # the program's fields say so
    except _Stop as e:
        error = _limit(e)
    except SystemExit as e:
        if program is None:
            error = _failed(e, files)
        else:
            program.exit(e)
    except BaseException as e:
        error = _failed(e, files)
    finally:
        builtins.print = real_print
        builtins.input = real_input
        if program:
            program.restore()
        if files:
            files.restore()
        seeded.restore()
        clock.restore()
        _current = None
    ms = (_perf_counter() - started) * 1000

    if run.stopped is not None and (error is None or error['kind'] != 'limit'):
        # The learner's code caught the stop (a bare except); it still stopped.
        error = _error('limit', run.stopped, None)
        returned = None
    result = run.result(returned, error, ms)
    if request.get('calls') and returned is not None:
        result['returned'] = returned  # already JSON, call by call, even when one raised
    return _ended(result, program)


def _call_methods(cls, name, calls, out):
    """A design problem: constructs the class with the first call's arguments,
    then calls each method in turn, appending what each returned (as JSON, at
    once, so a later call can't change it) to out."""
    first, rest = (calls[0], calls[1:]) if calls else ({'args': []}, [])
    instance = cls(*json.loads(json.dumps(first['args'])))
    out.append(None)
    for call in rest:
        method = getattr(instance, call['method'], None)
        if not callable(method):
            raise AttributeError(f"{name} has no method called {call['method']}.")
        out.append(_json(method(*json.loads(json.dumps(call['args'])))))


# ---------------------------------------------------------------------------
# Programs: stdin, a raw stdout, exit codes, and the learner's other files
# ---------------------------------------------------------------------------

class _Waiting(_Stop):
    """moreInput: the program read past the end of stdin, so the run stops
    there and the console asks the learner for another line."""


class _Out:
    """sys.stdout or sys.stderr while a program runs: what it writes, kept to
    MAX_OUTPUT characters. units counts UTF-16 code units, the length a
    JavaScript string has, so the app can cut stdout where a read happened."""

    def __init__(self):
        self.parts = []
        self.size = 0
        self.units = 0
        self.cut = False

    def write(self, text):
        if not isinstance(text, str):
            raise TypeError(f'write() argument must be str, not {type(text).__name__}')
        if self.cut:
            return len(text)
        if self.size + len(text) > MAX_OUTPUT:
            self._add(text[:MAX_OUTPUT - self.size] + OUTPUT_CUT)
            self.cut = True
        else:
            self._add(text)
        return len(text)

    def _add(self, text):
        self.parts.append(text)
        self.size += len(text)
        self.units += len(text.encode('utf-16-le')) // 2

    def text(self):
        return ''.join(self.parts)

    def flush(self):
        pass

    def isatty(self):
        return False

    def writable(self):
        return True

    def readable(self):
        return False

    encoding = 'utf-8'


class _In:
    """sys.stdin while a program runs: the request's stdin, a line at a time."""

    def __init__(self, text, more, out):
        text = text.replace('\r\n', '\n')
        parts = text.split('\n')
        self.lines = [p + '\n' for p in parts[:-1]] + ([parts[-1]] if parts[-1] else [])
        self.next = 0
        self.more = more
        self.out = out
        # How long stdout was when each line was read (in UTF-16 units), and
        # how much of it to keep (in characters) once the program is waiting.
        self.reads = []
        self.waiting_at = None

    def line(self):
        """The next line, or '' at the end of input; with moreInput, the end stops the run."""
        if self.next < len(self.lines):
            self.reads.append(self.out.units)
            self.next += 1
            return self.lines[self.next - 1]
        if self.more:
            if self.waiting_at is None:
                self.waiting_at = self.out.size
            raise _Waiting('waiting for input')
        return ''

    def readline(self, size=-1):
        return self.line()

    def read(self, size=-1):
        text = []
        while True:
            line = self.line()
            if not line:
                return ''.join(text)
            text.append(line)

    def readlines(self, hint=-1):
        return list(iter(self.line, ''))

    def __iter__(self):
        return self

    def __next__(self):
        line = self.line()
        if not line:
            raise StopIteration
        return line

    def isatty(self):
        return False

    def readable(self):
        return True

    def writable(self):
        return False

    encoding = 'utf-8'


class _Program:
    """A run with stdin: input() and sys.stdin read it, and output goes to
    a raw stdout and stderr."""

    def __init__(self, request):
        self.stdout = _Out()
        self.stderr = _Out()
        self.stdin = _In(request.get('stdin') or '', bool(request.get('moreInput')), self.stdout)
        self.exit_code = 0
        self.saved = None
        # Where each prompt sits in stdout, [start, end) in UTF-16 units.
        self.prompts = []

    def input(self, prompt=''):
        if prompt != '':
            start = self.stdout.units
            sys.stdout.write(str(prompt))
            if self.stdout.units > start:
                self.prompts.append([start, self.stdout.units])
        line = self.stdin.line()
        if not line:
            raise EOFError('EOF when reading a line')
        return line[:-1] if line.endswith('\n') else line

    def target(self, file, end):
        """Where print() writes: (stream, end, whether it is a print event)."""
        if end is None:
            end = '\n'
        elif not isinstance(end, str):
            raise TypeError(f'end must be None or a string, not {type(end).__name__}')
        stream = sys.stdout if file is None else file
        if not callable(getattr(stream, 'write', None)):
            raise AttributeError(f"'{type(stream).__name__}' object has no attribute 'write'")
        return stream, end, stream is self.stdout or stream is self.stderr

    def install(self):
        self.saved = (sys.stdin, sys.stdout, sys.stderr)
        sys.stdin, sys.stdout, sys.stderr = self.stdin, self.stdout, self.stderr

    def restore(self):
        if self.saved is not None:
            sys.stdin, sys.stdout, sys.stderr = self.saved
            self.saved = None

    def exit(self, e):
        """sys.exit(code), as CPython ends: None is 0, a number is itself, anything else is printed and is 1."""
        code = e.code
        if code is None:
            self.exit_code = 0
        elif isinstance(code, int) and not isinstance(code, bool):
            self.exit_code = code
        else:
            self.stderr.write(f'{code}\n')
            self.exit_code = 1

    def fields(self, error):
        waiting = self.stdin.waiting_at is not None
        if waiting:
            exit_code = None
        elif error is None:
            exit_code = self.exit_code
        else:
            exit_code = None if error['kind'] == 'limit' else 1
        stdout = self.stdout.text()
        return {
            'stdout': stdout[:self.stdin.waiting_at] if waiting else stdout,
            'stderr': self.stderr.text(),
            'exitCode': exit_code,
            'reads': self.stdin.reads,
            'prompts': self.prompts,
            'waiting': waiting,
        }


def _ended(result, program):
    """A result, with a program's output; a waiting program ended at its read, not in error."""
    if program is not None:
        result.update(program.fields(result['error']))
        if result['waiting']:
            result['error'] = None
    return result


def _files_problem(files):
    """Why a request's other files can't be used, as an error, or None."""
    if not files:
        return None
    if len(files) > MAX_FILES:
        return _error('limit', f'A run takes at most {MAX_FILES} other files.', None)
    if sum(len(text) for text in files.values()) > MAX_FILE_CHARS:
        return _error('limit', f'The other files hold more than {MAX_FILE_CHARS:,} characters in all.', None)
    for path in files:
        if not re.fullmatch(FILE_PATH, path):
            return _error('runtime', f'“{path}” isn’t a file name the runner takes: a name with an extension, in at most one folder.', None)
    return None


_runs = itertools.count(1)


class _Files:
    """The learner's other files, written to a fresh folder in Pyodide's file
    system for one run. It goes first on sys.path, so the main file imports
    them, and is the working directory, so open() finds data files. All of
    it goes when the run ends: the next run (a replay too) starts afresh."""

    def __init__(self, files):
        self.root = f'/tmp/algorender/run{next(_runs)}'
        self.files = files
        self.saved = None

    def relative(self, filename):
        prefix = self.root + '/'
        return filename[len(prefix):] if isinstance(filename, str) and filename.startswith(prefix) else None

    def install(self):
        for path, text in self.files.items():
            full = f'{self.root}/{path}'
            os.makedirs(os.path.dirname(full), exist_ok=True)
            with open(full, 'w', encoding='utf-8') as f:
                f.write(text)
        self.saved = (os.getcwd(), set(sys.modules), sys.dont_write_bytecode)
        sys.dont_write_bytecode = True
        sys.path.insert(0, self.root)
        os.chdir(self.root)
        importlib.invalidate_caches()

    def restore(self):
        if self.saved is None:
            return
        cwd, modules, bytecode = self.saved
        self.saved = None
        os.chdir(cwd)
        if self.root in sys.path:
            sys.path.remove(self.root)
        sys.dont_write_bytecode = bytecode
        # The learner's modules go, so the next run imports its own code again.
        for name in list(sys.modules):
            if name not in modules and self.relative(getattr(sys.modules[name], '__file__', None)) is not None:
                del sys.modules[name]
        shutil.rmtree(self.root, ignore_errors=True)


class _Seeded:
    """A request's seed: random makes the same choices every run, so a
    replayed program does what it did before, and its own state comes back after."""

    def __init__(self, seed):
        self.state = None
        if seed is not None:
            import random
            self.state = random.getstate()
            random.seed(seed)

    def restore(self):
        if self.state is not None:
            import random
            random.setstate(self.state)
            self.state = None


# time's functions a program's clock replaces while it runs.
_TIME_NAMES = ('time', 'time_ns', 'sleep', 'monotonic', 'monotonic_ns', 'perf_counter',
               'perf_counter_ns', 'localtime', 'gmtime', 'ctime', 'asctime', 'strftime')


class _Clock:
    """A request's clock (ms since 1970): time and datetime read it, and it
    moves only when the program sleeps, so a replay sees the same time and a
    sleep costs nothing. monotonic() and perf_counter() count from 0."""

    def __init__(self, clock):
        self.start = None if clock is None else clock / 1000
        self.now = self.start
        self.saved = None

    def sleep(self, seconds):
        if not isinstance(seconds, (int, float)) or isinstance(seconds, bool):
            raise TypeError(f"'{type(seconds).__name__}' object cannot be interpreted as an integer")
        if seconds < 0:
            raise ValueError('sleep length must be non-negative')
        self.now += seconds

    def install(self):
        if self.start is None:
            return
        import datetime as dt
        real = {name: getattr(time, name) for name in _TIME_NAMES}
        self.saved = (real, dt.datetime, dt.date)
        clock = self
        base_dt, base_date = dt.datetime, dt.date

        def at(secs, convert):
            return convert(clock.now if secs is None else secs)

        time.time = lambda: clock.now
        time.time_ns = lambda: int(round(clock.now * 1e9))
        time.sleep = clock.sleep
        time.monotonic = time.perf_counter = lambda: clock.now - clock.start
        time.monotonic_ns = time.perf_counter_ns = lambda: int(round((clock.now - clock.start) * 1e9))
        time.localtime = lambda secs=None: at(secs, real['localtime'])
        time.gmtime = lambda secs=None: at(secs, real['gmtime'])
        time.ctime = lambda secs=None: at(secs, real['ctime'])
        time.asctime = lambda t=None: real['asctime'](real['localtime'](clock.now) if t is None else t)
        time.strftime = lambda fmt, t=None: real['strftime'](fmt, real['localtime'](clock.now) if t is None else t)

        # Subclasses whose now() and today() read the clock, named and shown as the real ones.
        class datetime(base_dt):
            @classmethod
            def now(cls, tz=None):
                return cls.fromtimestamp(clock.now, tz)

            @classmethod
            def today(cls):
                return cls.fromtimestamp(clock.now)

            @classmethod
            def utcnow(cls):
                return cls.fromtimestamp(clock.now, dt.timezone.utc).replace(tzinfo=None)

            def __repr__(self):
                text = base_dt.__repr__(self)
                return text if text.startswith('datetime.') else 'datetime.' + text

        class date(base_date):
            @classmethod
            def today(cls):
                return cls.fromtimestamp(clock.now)

            def __repr__(self):
                text = base_date.__repr__(self)
                return text if text.startswith('datetime.') else 'datetime.' + text

        for cls in (datetime, date):
            cls.__module__ = 'datetime'
        dt.datetime, dt.date = datetime, date

    def restore(self):
        if self.saved is None:
            return
        import datetime as dt
        real, dt.datetime, dt.date = self.saved
        for name, fn in real.items():
            setattr(time, name, fn)
        self.saved = None


# ---------------------------------------------------------------------------
# 'judge' mode
# ---------------------------------------------------------------------------

class _Prints:
    """What a judged run printed: the first MAX_PRINTS lines, then a note.
    A 'program' run keeps no events: its streams are the whole output."""

    def __init__(self, program=None, events=True):
        self.events = []
        self.count = 0 if events else MAX_PRINTS + 1
        self.program = program

    def print(self, *args, sep=' ', end='\n', file=None, flush=False):
        if sep is None:
            sep = ' '
        elif not isinstance(sep, str):
            raise TypeError(f'sep must be None or a string, not {type(sep).__name__}')
        if self.program is not None:
            # A program's output is all there in stdout; the events keep the start, as ever.
            text = sep.join(str(a) for a in args)
            stream, end, shown = self.program.target(file, end)
            stream.write(text + end)
            if shown:
                self.event(lambda: text)
            return
        self.event(lambda: sep.join(str(a) for a in args))

    def event(self, text):
        if self.count > MAX_PRINTS:
            return
        self.count += 1
        if self.count > MAX_PRINTS:
            shown = '… (the rest of the output is cut)'
        else:
            shown = text()
            if len(shown) > MAX_PRINT_CHARS:
                shown = shown[:MAX_PRINT_CHARS] + '…'
        self.events.append({'kind': 'print', 'text': shown, 'line': None, 'vars': {}})


def _plain_table(rows, cols, fill=0):
    """table() in a judged run: a plain list of lists."""
    _whole(rows, 'table(rows, cols)')
    _whole(cols, 'table(rows, cols)')
    if rows < 0 or cols < 0:
        raise ValueError(f"table() can't make {rows if rows < 0 else cols} {'rows' if rows < 0 else 'columns'}.")
    return [[fill] * cols for _ in range(rows)]


def _plain_array(values, fill=0):
    """array() in a judged run: a plain list."""
    if isinstance(values, int) and not isinstance(values, bool):
        if values < 0:
            raise ValueError(f"array() can't make {values} cells.")
        return [fill] * values
    return list(values)


def _judge_arg(spec):
    kind = spec.get('kind')
    if kind == 'tree':
        return _build_tree(list(spec.get('values') or []))
    if kind == 'list':
        return _build_list(list(spec.get('values') or []))
    if kind == 'graph':
        weighted = spec.get('weighted')
        return {row['node']: [[n['to'], n['weight']] if weighted else n['to'] for n in row['neighbours']]
                for row in spec.get('adjacency') or []}
    if kind in ('array', 'grid'):
        return json.loads(json.dumps(spec.get('values') or []))
    return spec.get('value')


def _judge(request):
    """'judge' mode, and 'program' mode: the same run, but a program counts
    the lines of the learner's files, keeps no print events, is always a
    program, and may end with unit tests."""
    entry = request['entry']
    calls = request.get('calls')
    counting = request.get('mode') == 'program'
    program = _Program(request) if counting or request.get('stdin') is not None else None
    prints = _Prints(program, events=not counting)
    tests = request.get('tests') if counting else None
    outcomes = []

    def result(returned, error, ms, args=()):
        out = {'events': prints.events, 'arrays': {}, 'grids': {}, 'returned': returned,
               'error': error, 'ms': ms, 'args': [] if error else [_json(a) for a in args]}
        if tests is not None:
            out['tests'] = outcomes
        return _ended(out, program)

    problem = _files_problem(request.get('files'))
    if problem is not None:
        return result(None, problem, 0)
    try:
        code = compile(request['code'], LEARNER, 'exec')
    except SyntaxError as e:
        return result(None, _error('syntax', f'{type(e).__name__}: {e.msg}', e.lineno), 0)
    except ValueError as e:  # e.g. a null byte in the source
        return result(None, _error('syntax', f'SyntaxError: {e}', None), 0)

    namespace = {'__name__': '__main__', '__builtins__': builtins, 'table': _plain_table,
                 'array': _plain_array, 'TreeNode': TreeNode, 'ListNode': ListNode}
    returned = None
    args = []
    error = None
    real_print = builtins.print
    real_input = builtins.input
    files = _Files(request['files']) if request.get('files') else None
    seeded = _Seeded(request.get('seed'))
    clock = _Clock(request.get('clock'))
    counter = _Counter(request, files) if counting else None
    builtins.print = prints.print
    builtins.input = program.input if program else _no_input
    if program:
        program.install()
    if files:
        files.install()
    clock.install()
    started = _perf_counter()
    try:
        if counter:
            sys.settrace(counter.trace_calls)
        try:
            exec(code, namespace)
            # A program (stdin, no entry) is its top level; a function is called.
            fn = namespace.get(entry) if entry or program is None else None
            if (entry or program is None) and not callable(fn):
                error = _error('runtime', f"Define {'a class' if calls else 'a function'} called {entry}.", None)
            elif fn is None:
                pass
            elif calls:
                returned = []
                _call_methods(fn, entry, calls, returned)
            else:
                args = [_judge_arg(spec) for spec in request.get('args') or []]
                returned = _json(fn(*args))
            if tests is not None and error is None:
                _run_tests(tests, namespace, files, outcomes)
        finally:
            sys.settrace(None)
    except _Waiting:
        pass  # the program's fields say so
    except _Stop as e:
        error = _limit(e)
        returned = None
    except SystemExit as e:
        if program is None:
            error = _failed(e, files)
        else:
            program.exit(e)
    except BaseException as e:
        error = _failed(e, files)
        if not calls:
            returned = None
    finally:
        builtins.print = real_print
        builtins.input = real_input
        if program:
            program.restore()
        if files:
            files.restore()
        seeded.restore()
        clock.restore()
    ms = (_perf_counter() - started) * 1000
    if counter is not None and counter.stopped is not None and (error is None or error['kind'] != 'limit'):
        # The learner's code caught the stop (a bare except); it still stopped.
        error = _error('limit', counter.stopped, None)
        returned = None
    return result(returned, error, ms, args)


class _Counter:
    """'program' mode's tracer: counts the lines run in the learner's files
    (the main one, the others, and the tests that call them), so an endless
    loop stops with a message rather than a timeout. Nothing else is traced."""

    def __init__(self, request, files):
        limits = request.get('limits') or {}
        self.max_steps = int(limits.get('maxSteps', 200000))
        self.files = files
        self.steps = 0
        self.stopped = None

    def trace_calls(self, frame, event, arg):
        name = frame.f_code.co_filename
        if name == LEARNER or name == TESTS or (self.files is not None and self.files.relative(name) is not None):
            return self.trace_lines
        return None

    def trace_lines(self, frame, event, arg):
        if event == 'line':
            self.steps += 1
            if self.steps > self.max_steps:
                self.stopped = f'Stopped after {self.max_steps:,} steps: is there a loop that never ends?'
                stop = _Stop(self.stopped)
                name = frame.f_code.co_filename
                if name == LEARNER:
                    stop.line = frame.f_lineno
                elif name != TESTS:
                    stop.line = frame.f_lineno
                    stop.file = self.files.relative(name)
                raise stop
        return self.trace_lines


# ---------------------------------------------------------------------------
# Unit tests ('program' mode with tests)
# ---------------------------------------------------------------------------

TESTS = '<tests>'

_CMP_TEXT = {
    ast.Eq: '==', ast.NotEq: '!=', ast.Lt: '<', ast.LtE: '<=', ast.Gt: '>', ast.GtE: '>=',
    ast.In: 'in', ast.NotIn: 'not in', ast.Is: 'is', ast.IsNot: 'is not',
}
_CMP = {
    '==': operator.eq, '!=': operator.ne, '<': operator.lt, '<=': operator.le, '>': operator.gt,
    '>=': operator.ge, 'in': lambda a, b: a in b, 'not in': lambda a, b: a not in b,
    'is': operator.is_, 'is not': operator.is_not,
}


class _Asserts(ast.NodeTransformer):
    """assert a == b  becomes  _test_cmp('==', a, b, 'a == b', 'a', 'b', msg), and any
    other assert x  becomes  _test_true(x, 'x', msg), so a failure says what each side was."""

    def __init__(self, source):
        self.source = source

    def text(self, node):
        return ast.get_source_segment(self.source, node) or ''

    def visit_Assert(self, node):
        test = node.test
        msg = node.msg if node.msg is not None else ast.Constant(None)
        if isinstance(test, ast.Compare) and len(test.ops) == 1 and type(test.ops[0]) in _CMP_TEXT:
            left, right = test.left, test.comparators[0]
            call = ast.Call(ast.Name('_test_cmp', ast.Load()), [
                ast.Constant(_CMP_TEXT[type(test.ops[0])]), left, right, ast.Constant(self.text(test)),
                ast.Constant(None if _literal(left) else self.text(left)),
                ast.Constant(None if _literal(right) else self.text(right)), msg], [])
        else:
            call = ast.Call(ast.Name('_test_true', ast.Load()), [test, ast.Constant(self.text(test)), msg], [])
        return ast.copy_location(ast.Expr(call), node)


def _literal(node):
    """Whether a side of an assert is written as its own value (5, 'x', [], (1, 2)), so saying what it is adds nothing."""
    try:
        ast.literal_eval(node)
        return True
    except Exception:
        return False


def _test_cmp(op, a, b, text, left, right, msg):
    if _CMP[op](a, b):
        return
    if msg is not None:
        raise AssertionError(msg)
    seen = [f'{side} is {_short(repr(value))}' for side, value in ((left, a), (right, b)) if side]
    raise AssertionError(f'Expected {text}, but ' + ' and '.join(seen) if seen else f'Expected {text}')


def _test_true(value, text, msg):
    if value:
        return
    raise AssertionError(msg if msg is not None else f'Expected {text} to be true, but it is {_short(repr(value))}')


class raises:
    """with raises(ValueError): … passes only if the block raises that error (or a subclass)."""

    def __init__(self, expected):
        self.expected = expected
        self.value = None

    def __enter__(self):
        return self

    def __exit__(self, kind, value, tb):
        if kind is None:
            raise AssertionError(f'Expected {self.expected.__name__} to be raised, but nothing was')
        if issubclass(kind, self.expected) and not issubclass(kind, _Stop):
            self.value = value
            return True
        return False


def _run_tests(source, namespace, files, outcomes):
    """Runs every test_* function the tests define, in order, against the
    learner's top-level names, appending each one's outcome. A limit or an
    exit ends the run there."""
    try:
        tree = _Asserts(source).visit(ast.parse(source, TESTS, 'exec'))
        code = compile(ast.fix_missing_locations(tree), TESTS, 'exec')
    except SyntaxError as e:
        raise RuntimeError(f'The tests themselves don’t parse: {e.msg} (line {e.lineno})')
    scope = dict(namespace)
    scope.update({'__name__': 'tests', 'raises': raises, '_test_cmp': _test_cmp, '_test_true': _test_true})
    exec(code, scope)
    names = [name for name, fn in scope.items()
             if name.startswith('test_') and isinstance(fn, types.FunctionType) and fn.__code__.co_filename == TESTS]
    for name in names[:MAX_TESTS]:
        try:
            scope[name]()
            outcomes.append({'name': name, 'passed': True})
        except (_Stop, SystemExit):
            raise
        except BaseException as e:
            line, file = _where(e, files)
            message = (str(e) or 'AssertionError') if isinstance(e, AssertionError) and line is None else _message(e)
            outcomes.append({'name': name, 'passed': False, 'message': message, 'line': line if file is None else None})


def _no_input(prompt=''):
    # There is no keyboard in the worker; the function's arguments are its input.
    raise RuntimeError('input() isn’t available here: your function gets its values as arguments.')


def run_request(request_json):
    """Runs one RunRequest (JSON) and returns its RunResult (JSON)."""
    try:
        request = json.loads(request_json)
        return json.dumps(_judge(request) if request.get('mode') in ('judge', 'program') else _run(request), allow_nan=False)
    except BaseException as e:  # a bug here, not in the learner's code
        sys.settrace(None)
        return json.dumps({
            'events': [], 'arrays': {}, 'grids': {}, 'returned': None, 'ms': 0,
            'error': _error('internal', f'The Python runner failed: {_message(e)}', None),
        })
`;
