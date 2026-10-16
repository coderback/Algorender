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

export const HARNESS = String.raw`
import ast
import builtins
import functools
import json
import math
import operator
import sys
import time

LEARNER = '<learner>'

# Lists longer than this show their first items, then the length.
LIST_SHOWN = 12
STR_SHOWN = 40
# Bigger integers lose precision in JavaScript.
MAX_SAFE_INT = 2 ** 53 - 1
# As protocol.ts: cells one table()/array() call may make, and cells a write's 'from' lists.
MAX_CELLS = 10000
MAX_FROM = 32

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
    learner's code can't swallow it."""


# The run in progress; the instrumented code and VisualList report to it.
_current = None


# ---------------------------------------------------------------------------
# Rendering values for the app
# ---------------------------------------------------------------------------

def _short(text):
    return text if len(text) <= STR_SHOWN else text[:STR_SHOWN - 1] + '…'


def _is_number(x):
    return isinstance(x, (int, float)) and not isinstance(x, bool)


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
    if value is None or isinstance(value, bool):
        return value
    if _is_number(value):
        return _number(value)
    if isinstance(value, str):
        return _short(value)
    if isinstance(value, (list, tuple)) and all(_is_number(x) for x in value):
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
    if isinstance(value, (list, tuple)):
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


_VISUAL = (VisualList, VisualGrid, VisualRow)


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
    return [ast.copy_location(clear, stmt), stmt]


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

    def stop(self, message):
        self.stopped = message
        raise _Stop(message)

    def emit(self, kind, line=_SKIP, **fields):
        if self.stopped is not None:
            raise _Stop(self.stopped)
        if len(self.events) >= self.max_events:
            self.stop(f'Stopped after {self.max_events:,} events: '
                      'the code changed the array more times than the visual can show.')
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
    # exception too) keep the read logs in step with the frames.
    def trace_calls(self, frame, event, arg):
        if frame.f_code.co_filename == LEARNER:
            self.enter()
            return self.trace_lines
        return None

    def trace_lines(self, frame, event, arg):
        if event == 'line':
            self.steps += 1
            if self.steps > self.max_steps:
                self.stop(f'Stopped after {self.max_steps:,} steps: is there a loop that never ends?')
        elif event == 'return':
            self.leave()
        return self.trace_lines

    def print(self, *args, sep=' ', end='\n', file=None, flush=False):
        if sep is None:
            sep = ' '
        elif not isinstance(sep, str):
            raise TypeError(f'sep must be None or a string, not {type(sep).__name__}')
        self.emit('print', text=sep.join(str(a) for a in args))

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


def _error(kind, message, line):
    return {'kind': kind, 'message': message, 'line': line}


def _run(request):
    global _current
    run = _Run(request)
    entry = request['entry']

    try:
        tree = _Statements().visit(_Instrument().visit(ast.parse(request['code'], LEARNER, 'exec')))
        code = compile(ast.fix_missing_locations(tree), LEARNER, 'exec')
    except SyntaxError as e:
        return run.result(None, _error('syntax', f'{type(e).__name__}: {e.msg}', e.lineno), 0)
    except ValueError as e:  # e.g. a null byte in the source
        return run.result(None, _error('syntax', f'SyntaxError: {e}', None), 0)

    namespace = {'__name__': '__main__', '__builtins__': builtins,
                 '_viz_cmp': _viz_cmp, '_viz_cell': _viz_cell, '_viz_named': _viz_named,
                 '_viz_reads': run.reads, 'table': table, 'array': array}
    run.namespace = namespace
    returned = None
    error = None
    real_print = builtins.print
    real_input = builtins.input
    _current = run
    builtins.print = run.print
    builtins.input = _no_input
    started = time.perf_counter()
    try:
        sys.settrace(run.trace_calls)
        try:
            exec(code, namespace)
            fn = namespace.get(entry)
            if not callable(fn):
                error = _error('runtime', f'Define a function called {entry}.', None)
            else:
                args = [run.arg(spec) for spec in request.get('args') or []]
                returned = fn(*args)
        finally:
            sys.settrace(None)
    except _Stop as e:
        error = _error('limit', str(e), _error_line(e))
    except BaseException as e:
        error = _error('runtime', _message(e), _error_line(e))
    finally:
        builtins.print = real_print
        builtins.input = real_input
        _current = None
    ms = (time.perf_counter() - started) * 1000

    if run.stopped is not None and (error is None or error['kind'] != 'limit'):
        # The learner's code caught the stop (a bare except); it still stopped.
        error = _error('limit', run.stopped, None)
        returned = None
    return run.result(returned, error, ms)


def _no_input(prompt=''):
    # There is no keyboard in the worker; the function's arguments are its input.
    raise RuntimeError('input() isn’t available here: your function gets its values as arguments.')


def run_request(request_json):
    """Runs one RunRequest (JSON) and returns its RunResult (JSON)."""
    try:
        return json.dumps(_run(json.loads(request_json)), allow_nan=False)
    except BaseException as e:  # a bug here, not in the learner's code
        sys.settrace(None)
        return json.dumps({
            'events': [], 'arrays': {}, 'grids': {}, 'returned': None, 'ms': 0,
            'error': _error('internal', f'The Python runner failed: {_message(e)}', None),
        })
`;
